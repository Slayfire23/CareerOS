"""Code rules for hybrid analysis: which requirements local AI may look at, and how far its answer
for one requirement may go.

Hard qualifications stay with the rules engine: employment, education, durations, credentials, and
requirements containing text directed at an AI or reviewer are never sent to local AI. "Experience
with <technology>" (no duration, role, or domain) is a skill requirement and may be sent.
Local AI only proposes which profile entries match; code decides the verdict and writes the explanation:
- "supported" only when it cites a listed skill whose name code recognizes as the same technology
  (word for word or a known alternate name) at the level the requirement asks for;
- "possible" when a citation is code-recognized as related, or names the skill in a role or
  project, or the skill is listed below the level asked for. A model claim of "supported" that
  code can only confirm this far is lowered to "possible", never kept;
- rejected (the rules verdict stands) when any citation is not verbatim, not from this request,
  unrelated to the requirement, or taken from profile text directed at an AI or reviewer. In free
  text, a word that is also ordinary English ("rust") counts only next to a technical word.
Local AI may only add a match the rules engine missed; it never lowers or replaces a rules
verdict. Nothing the model writes is shown: explanations come from code and the verified quotes.

Next.js re-checks these rules on the response (src/lib/ai/match-validation.ts).
"""

from typing import Literal

from app.matching.evidence import quote_is_verbatim
from app.matching.relations import relation
from app.matching.requirement_structure import Structure, listed_terms, parse, untrusted_evidence_spans
from app.matching.requirement_text import QUALIFICATION_WORDS, skill_like_experience
from app.matching.untrusted_text import has_directed_text, quote_in_trusted_text
from app.matching.validate import stated_years
from app.providers.rules import _PROFICIENCY_LABEL, _PROFICIENCY_RANK, NOT_ALL_ITEMS, required_skill_level
from app.schemas import (
    Citation,
    Evidence,
    ExperienceEvidence,
    Finding,
    ProjectEvidence,
    Requirement,
    SkillEvidence,
)

VERDICT_RANK = {"insufficient_information": 0, "gap": 0, "possible": 1, "supported": 2}

RELATED_ONLY = "Local AI found a related technology, not the same one. Check that it fits."
MENTION_ONLY = "Mentioned in a role or project, not listed as a skill."

Rejection = Literal[
    "unreadable_answer",
    "missing_answer",
    "invalid_verdict",
    "no_citation",
    "unknown_evidence",
    "quote_not_verbatim",
    "untrusted_text",
    "unrelated_citation",
]
# Why a model's "supported" was lowered to "possible" (reported by the evaluation).
Lowered = Literal["related_only", "not_a_listed_skill", "level_not_met", "not_all_items"]


def semantic_eligible(requirement: Requirement) -> bool:
    """True when local AI may look for this requirement (a skill, not a hard qualification)."""
    text = requirement.text
    skill = requirement.category in ("Skills", "Other") or (
        requirement.category == "Experience" and skill_like_experience(text)
    )
    return (
        skill
        and not stated_years(text)
        and not QUALIFICATION_WORDS.search(text)
        and not has_directed_text(text)
    )


def structure_of(requirement: Requirement, evidence: dict[str, Evidence]) -> Structure:
    """The requirement's structure (requirement_structure.py), given the skills the profile lists."""
    names = [e.name for e in evidence.values() if isinstance(e, SkillEvidence)]
    names += [n for e in evidence.values() if isinstance(e, ProjectEvidence) for n in e.skills]
    return parse(requirement.text, listed_terms(names), requirement.confirmed)


def contains_instructions(requirement: Requirement, evidence: dict[str, Evidence]) -> bool:
    """Instructions, claims, or evaluation language in the requirement: rules only, and the
    person is asked to confirm it."""
    structure = structure_of(requirement, evidence)
    return has_directed_text(requirement.text) or structure.ignored or structure.needs_review


def quote_source(item: Evidence, quote: str) -> tuple[bool, str | None]:
    """Where a verbatim quote may come from: (allowed, free_text_field). Names, titles, and listed
    skills are structured; descriptions are free text, where only trusted parts may be quoted and
    the field is returned so ambiguous words can be checked for technical context."""
    if isinstance(item, SkillEvidence):
        return quote in item.name, None
    if isinstance(item, ExperienceEvidence):
        structured, free = [item.job_title], [item.description]
    elif isinstance(item, ProjectEvidence):
        structured, free = [item.title, *item.skills], [item.description, item.contribution, item.results]
    else:
        return False, None  # education is never sent to local AI
    if any(quote in field for field in structured):
        return True, None
    for field in free:
        if field and quote in field and quote_in_trusted_text(field, quote, untrusted_evidence_spans(field)):
            return True, field
    return False, None


def _quoted(quotes: list[str]) -> str:
    return ", ".join(f"\u201c{q}\u201d" for q in dict.fromkeys(quotes))


def check_local_finding(
    requirement: Requirement, item: dict, evidence: dict[str, Evidence]
) -> tuple[Finding, Lowered | None] | Rejection | None:
    """Check one local-AI answer. Returns the finding to show (and why the model's verdict was
    lowered, if it was), a rejection reason, or None when local AI found no match. ``evidence``
    maps the short ids sent in the prompt to the real evidence."""
    verdict = item.get("verdict")
    if verdict == "insufficient_information":
        return None
    if verdict not in ("supported", "possible"):
        return "invalid_verdict"
    raw_citations = item.get("citations")
    if not isinstance(raw_citations, list) or not 1 <= len(raw_citations) <= 10:
        return "no_citation"

    # Citations are judged only against what the requirement actually requests: its head and listed
    # alternatives. Later required clauses only add mandatory groups (checked below); they never
    # make a citation relevant, so text outside the head can't earn credit.
    structure = structure_of(requirement, evidence)
    target = structure.credit_text or requirement.text
    citations: list[Citation] = []
    strengths: list[tuple[Evidence, str, str]] = []
    for raw in raw_citations:
        if not isinstance(raw, dict) or not isinstance(raw.get("quote"), str):
            return "unknown_evidence"
        cited = evidence.get(raw.get("evidence_id"))  # type: ignore[arg-type]
        if cited is None:
            return "unknown_evidence"
        quote = raw["quote"]
        if not 1 <= len(quote) <= 300 or not quote_is_verbatim(cited, quote):
            return "quote_not_verbatim"
        allowed, free_text = quote_source(cited, quote)
        if not allowed:
            return "untrusted_text"
        strength = relation(target, quote, free_text)
        if strength is None:  # every citation must be about this requirement
            return "unrelated_citation"
        citations.append(Citation(evidence_id=cited.id, quote=quote))
        strengths.append((cited, quote, strength))

    same_skills = [
        cited
        for cited, quote, strength in strengths
        if isinstance(cited, SkillEvidence) and quote == cited.name and strength == "same"
    ]
    required = required_skill_level(requirement.text)
    level_ok = [
        s for s in same_skills if not required or _PROFICIENCY_RANK.get(s.proficiency or "", 0) >= required[0]
    ]
    quotes = _quoted([q for _, q, _ in strengths])
    # Every mandatory part ("Python and Go") needs a listed skill that is the same technology.
    listed = [e for e in evidence.values() if isinstance(e, SkillEvidence)]
    missing = [p for p in structure.pieces if not any(relation(p, s.name) == "same" for s in listed)]
    lowered: Lowered | None
    if level_ok and missing:
        final, lowered = "possible", "not_all_items"
        caveats = [NOT_ALL_ITEMS(missing)]
        explanation = (
            f"You list {_quoted([s.name for s in level_ok])}, which local AI matched to part of this "
            "requirement, but it asks for more than that."
        )
    elif level_ok:
        final, lowered, caveats = "supported", None, []
        explanation = (
            f"You list {_quoted([s.name for s in level_ok])}, which local AI matched as another name "
            "for what this requirement asks for."
        )
    elif same_skills:
        assert required is not None
        final, lowered = "possible", "level_not_met"
        rated = [s for s in same_skills if s.proficiency]
        levels = ", ".join(f"{s.name} as {_PROFICIENCY_LABEL[s.proficiency]}" for s in rated)  # type: ignore[index]
        caveats = [
            f"You rated {levels}; this requirement asks for {required[1]} level."
            if rated
            else f"No skill level is listed, so {required[1]} level cannot be confirmed."
        ]
        explanation = (
            f"You list {_quoted([s.name for s in same_skills])}, which local AI matched to this skill, "
            "but not at the level this requirement asks for."
        )
    elif any(strength == "same" for _, _, strength in strengths):
        final, lowered, caveats = "possible", "not_a_listed_skill", [MENTION_ONLY]
        projects_only = all(isinstance(c, ProjectEvidence) for c, _, _ in strengths)
        where = "projects" if projects_only else "roles or projects"
        explanation = f"Your {where} mention {quotes}, but not as a listed skill."
    else:
        final, lowered, caveats = "possible", "related_only", [RELATED_ONLY]
        explanation = f"Local AI linked this to {quotes}, a related technology rather than the same one."
    if verdict == "possible":
        lowered = None  # only a model "supported" that code could not confirm counts as lowered

    finding = Finding(
        requirement_index=requirement.index,
        verdict=final,
        explanation=explanation,
        citations=list(dict.fromkeys(citations)),
        caveats=caveats,
        method="local_ai",
        ai_status="accepted",
    )
    return finding, lowered
