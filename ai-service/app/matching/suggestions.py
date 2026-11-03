"""Checks for AI suggestions. Suggestions are advice shown beside verdicts; they never change one.

Local AI only points at things: which profile entry might relate to a requirement, or which term of
a requirement the profile may be missing. Code checks each pointer and writes every word shown:

- A quote must be verbatim from the cited entry, and not from text that is aimed at an evaluator,
  about the evaluation, or a skill name carrying a claim.
- If the reviewed table (skill_relations.json) knows both technologies and says they are unrelated,
  the suggestion is dropped: the table outranks the model.
- If the table knows the relationship, the suggestion says so. If not, it is marked for review.
- A profile-gap term must appear in what the requirement requests, and must not already be listed.
- Nothing is suggested for text that isn't part of what the requirement requests.
"""

from typing import Literal

from app.matching.evidence import quote_is_verbatim
from app.matching.relations import canonical_terms, plain_skill_name, relation, vocabulary
from app.matching.requirement_structure import Structure, names_an_item, untrusted_evidence_spans
from app.matching.untrusted_text import quote_in_trusted_text
from app.schemas import (
    Citation,
    Evidence,
    ExperienceEvidence,
    ProjectEvidence,
    Requirement,
    SkillEvidence,
    Suggestion,
)

Rejected = Literal[
    "invalid_kind",
    "unknown_evidence",
    "quote_not_verbatim",
    "untrusted_text",
    "table_says_unrelated",
    "term_not_in_requirement",
    "term_already_listed",
    "no_new_information",
]


def _quote_field(item: Evidence, quote: str) -> tuple[bool, str | None]:
    """(allowed, free_text_field). Structured names are allowed as they are; free text only outside
    parts that are aimed at an evaluator or about the evaluation."""
    if isinstance(item, SkillEvidence):
        return plain_skill_name(item.name) and quote in item.name, None
    if isinstance(item, ExperienceEvidence):
        structured, free = [item.job_title], [item.description]
    elif isinstance(item, ProjectEvidence):
        structured = [item.title, *[s for s in item.skills if plain_skill_name(s)]]
        free = [item.description, item.contribution, item.results]
    else:
        return False, None
    if any(quote in field for field in structured):
        return True, None
    for field in free:
        if field and quote in field and quote_in_trusted_text(field, quote, untrusted_evidence_spans(field)):
            return True, field
    return False, None


def check_suggestion(
    requirement: Requirement,
    structure: Structure,
    item: dict,
    evidence: dict[str, Evidence],
    already_cited: set[tuple[str, str]],
) -> Suggestion | Rejected:
    """Turn one local-AI pointer into a suggestion with code-written wording, or say why not."""
    kind = item.get("kind")
    target = structure.credit_text
    if kind == "missing_from_profile":
        term = item.get("term")
        if (
            not isinstance(term, str)
            or not 2 <= len(term.strip()) <= 100
            or term.strip().casefold() not in target.casefold()
        ):
            return "term_not_in_requirement"
        term = term.strip()
        if not names_an_item(term):
            return "term_not_in_requirement"
        listed = [e for e in evidence.values() if isinstance(e, SkillEvidence)]
        if any(relation(term, s.name) == "same" for s in listed):
            return "term_already_listed"
        return Suggestion(
            requirement_index=requirement.index,
            kind="profile_gap",
            term=term,
            text=f"“{term}” isn't in your profile. If you have it, add it and run the analysis again.",
        )
    if kind != "possible_connection":
        return "invalid_kind"
    cited = evidence.get(item.get("evidence_id"))  # type: ignore[arg-type]
    quote = item.get("quote")
    if cited is None or not isinstance(quote, str):
        return "unknown_evidence"
    if not 1 <= len(quote) <= 300 or not quote_is_verbatim(cited, quote):
        return "quote_not_verbatim"
    allowed, free_text = _quote_field(cited, quote)
    if not allowed:
        return "untrusted_text"
    if (cited.id, quote) in already_cited:
        return "no_new_information"  # the verified result already uses this evidence
    strength = relation(target, quote, free_text)
    citation = Citation(evidence_id=cited.id, quote=quote)
    named = f"“{quote}”"
    if strength == "same":
        return Suggestion(
            requirement_index=requirement.index,
            kind="relevant_evidence",
            citation=citation,
            known_to_rules=True,
            text=f"Your profile mentions {named}. Check whether it shows this. It doesn't change the result.",
        )
    if strength == "related":
        return Suggestion(
            requirement_index=requirement.index,
            kind="related_technology",
            citation=citation,
            known_to_rules=True,
            text=f"{named} is a related technology. It doesn't change the result.",
        )
    known = vocabulary()
    wanted, found = canonical_terms(target), canonical_terms(quote)
    if wanted & known and found and found <= known:
        return "table_says_unrelated"  # the table knows both and doesn't relate them
    if free_text is not None and not found & known:
        kind_out: Literal["relevant_evidence", "alternate_name"] = "relevant_evidence"
        wording = f"{named} in your profile might be relevant. Not verified, so please review it."
    else:
        kind_out = "alternate_name"
        wording = f"{named} might be another name for this, or related. Not verified, so please review it."
    return Suggestion(requirement_index=requirement.index, kind=kind_out, citation=citation, text=wording)
