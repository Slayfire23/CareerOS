"""Deterministic rules provider: explainable keyword and date logic, no AI.

This engine is the only authority for final verdicts. AI suggestions (providers/assisted.py) never
change them.

Deliberately conservative: "not enough information" is preferred to an unsupported positive claim.
Keyword rules cannot prove that a skill is absent, so this provider never returns a skills "gap". It
also cannot judge whether experience is relevant, so a years-of-experience requirement that is met is
reported as "possible" rather than "supported". A listed skill is "supported" only when the
requirement names exactly that skill, or a name the reviewed table (skill_relations.json) records as
the same technology, asks for no duration with it, and asks for no credential. A related technology
from the table is at most "possible". Free text is at most "possible", and only when it describes
the technology as used in work (relations.describes_use); a mention alone is not evidence.

Job and profile text is untrusted: parts directed at an AI or reviewer are removed before any
matching (untrusted_text.py). "Experience with <technology>", with no duration or role, is judged
as a skill requirement (requirement_text.skill_like_experience).
"""

import re

from app.matching.evidence import (
    PROJECT_NOT_EMPLOYMENT,
    contains_phrase,
    employment_months,
    format_years,
)
from app.matching.relations import _raw as _relations_raw
from app.matching.relations import (
    asks_for_field,
    canonical_terms,
    describes_use,
    field_matches,
    generic_terms,
    names_same_degree,
    plain_skill_name,
    quote_terms,
    relation,
    surface_forms,
    vocabulary,
)
from app.matching.requirement_structure import (
    listed_terms,
    parse,
    untrusted_evidence_spans,
    unverifiable_field,
)
from app.matching.requirement_text import QUALIFICATION_WORDS, skill_like_experience
from app.matching.untrusted_text import (
    INSTRUCTION_TEXT,
    INSTRUCTIONS_IGNORED,
    qualification_text,
)
from app.matching.validate import required_months
from app.schemas import (
    Citation,
    EducationEvidence,
    ExperienceEvidence,
    Finding,
    MatchRequest,
    ProjectEvidence,
    Requirement,
    SkillEvidence,
)

PROJECT_MENTION = "Mentioned in a project, not listed as a skill."
PART_OF_LONGER_NAME = (
    "Your listed skill appears inside a longer name here, which may be a different technology."
)
YEARS_PER_SKILL = "This asks for time with the skill; your profile does not record time per skill."
RELATED_TECHNOLOGY = "A related technology, not the same one. Check that it fits."
UNVERIFIABLE_FIELD = "Whether your field counts as related can't be confirmed automatically."
CREDENTIAL_NOT_SHOWN = "Listing a skill does not show the certification or license this asks for."
JUDGED_AS_SKILL = "This names a technology with no duration or role, so it was judged as a skill."
NEEDS_CONFIRMATION = (
    "This requirement's wording reads partly like instructions or a judgment about how to evaluate it, "
    "so it was not assessed. Check it in the job review and confirm it if it is a real requirement; "
    "confirming it does not count as evidence that you meet it."
)


def NOT_ALL_ITEMS(missing: list[str]) -> str:
    named = "; ".join(f"\u201c{m}\u201d" for m in missing[:3])
    return f"This asks for several things; your listed skills don't show {named}."


# Words too generic to count as a match on their own.
GENERIC_WORDS = frozenset(
    """a an and the or of in on to for with as such like using use including plus etc
    year years month months experience experienced professional work working ability able
    knowledge familiarity familiar proficiency proficient skill skills strong solid good excellent
    understanding tools tool required preferred minimum must nice have having demonstrated proven
    related relevant equivalent field degree team""".split()
)
# Skill level a requirement asks for, and the user's self-assessed level, on one scale.
_REQUIRED_LEVELS = [
    (
        3,
        "an expert or advanced",
        re.compile(r"\b(expert|advanced|in-depth|extensive|deep|senior|mastery)\b", re.I),
    ),
    (2, "an intermediate", re.compile(r"\b(intermediate|working knowledge|solid|strong)\b", re.I)),
]
_PROFICIENCY_RANK = {"BEGINNER": 1, "INTERMEDIATE": 2, "ADVANCED": 3}
_PROFICIENCY_LABEL = {"BEGINNER": "beginner", "INTERMEDIATE": "intermediate", "ADVANCED": "advanced"}


def required_skill_level(text: str) -> tuple[int, str] | None:
    """The minimum level a requirement asks for, or None when it names no level."""
    for rank, label, pattern in _REQUIRED_LEVELS:
        if pattern.search(text):
            return rank, label
    return None


_LEVELS = [  # (rank, label, patterns), ordered most to least specific per rank
    (
        4,
        "doctorate",
        [r"\bph\.?\s?d\b", r"\bd\.?\s?phil\b", r"\bdoctorate\b", r"\bdoctoral\b", r"\bed\.?\s?d\b"],
    ),
    (
        3,
        "master's",
        [
            r"\bmaster'?s?\b",
            r"\bm\.?\s?s\.?(?=\s|$|,)",
            r"\bm\.?\s?eng\b",
            r"\bm\.?\s?sc\b",
            r"\bm\.?\s?phil\b",
            r"\bm\.?\s?res\b",
            r"\bm\.?\s?ed\b",
            r"\bmba\b",
            r"\bm\.?\s?a\.?(?=\s|$|,)",
        ],
    ),
    (
        2,
        "bachelor's",
        [
            r"\bbachelor'?s?\b",
            r"\bb\.?\s?s\.?(?=\s|$|,)",
            r"\bb\.?\s?sc\b",
            r"\bb\.?\s?a\.?(?=\s|$|,)",
            r"\bb\.?\s?eng\b",
            r"\bundergraduate degree\b",
        ],
    ),
    (1, "associate", [r"\bassociate'?s? degree\b", r"\ba\.?\s?a\.?s\.?(?=\s|$|,)"]),
    (0, "high school", [r"\bhigh[\s-]school\b", r"\bsecondary school\b", r"\bged\b", r"\bhs diploma\b"]),
]
# Words in an education requirement that don't name a field of study.
_NO_FIELD_WORDS = frozenset(
    """or and a an the in of any equivalent equivalents equivalency related field fields degree degrees
    diploma required preferred minimum plus higher level from accredited institution university college
    school high secondary ged completed completion qualification qualifications""".split()
)


_LEVEL_LABELS = {4: "doctorate", 3: "master's", 2: "bachelor's", 1: "associate", 0: "high school"}


def _implied(text: str) -> list[tuple[int, str, str]]:
    """(level, label, field) for degree names that imply both, such as "MBA" or "BSN"."""
    implied = _relations_raw().get("degree_implied", {})
    found = []
    low = " ".join(re.findall(r"[a-z]+", text.lower()))
    for phrase, info in _relations_raw().get("degree_phrases", {}).items():
        if f" {phrase} " in f" {low} ":
            found.append((info["level"], _LEVEL_LABELS[info["level"]], info["field"]))
    for token in re.findall(r"[A-Za-z.]+", text):
        key = token.replace(".", "").lower()
        if key in implied:
            found.append((implied[key]["level"], _LEVEL_LABELS[implied[key]["level"]], implied[key]["field"]))
    return found


def implied_field(qualification: str) -> str | None:
    return next((field for _, _, field in _implied(qualification) if field), None)


def required_degree_rank(text: str) -> tuple[int, str] | None:
    """The lowest degree level a requirement accepts ("Master's or PhD" -> master's). A degree
    with no level named ("Degree in Mathematics") accepts any degree."""
    found = [
        (rank, label)
        for rank, label, patterns in _LEVELS
        if any(re.search(p, text, re.IGNORECASE) for p in patterns)
    ]
    found += [(rank, label) for rank, label, _ in _implied(text)]
    if not found and re.search(r"\bdegree\b", text, re.IGNORECASE):
        return 1, "a degree"
    return min(found) if found else None


def degree_rank(text: str) -> tuple[int, str] | None:
    for rank, label, patterns in _LEVELS:
        if any(re.search(p, text, re.IGNORECASE) for p in patterns):
            return rank, label
    implied = _implied(text)
    return (max(implied)[0], max(implied)[1]) if implied else None


def _finding(
    requirement: Requirement, verdict, explanation: str, citations=(), caveats=(), review=None, basis=None
) -> Finding:
    return Finding(
        requirement_index=requirement.index,
        verdict=verdict,
        explanation=explanation,
        citations=list(citations)[:10],
        caveats=list(dict.fromkeys(caveats))[:5],
        review=review,
        basis=basis or ("needs_confirmation" if review else "no_evidence"),
    )


def _listed(request: MatchRequest) -> frozenset[str]:
    """Canonical terms of every skill the profile lists, including project skills."""
    names = [e.name for e in request.evidence if isinstance(e, SkillEvidence)]
    names += [n for e in request.evidence if isinstance(e, ProjectEvidence) for n in e.skills]
    return listed_terms([n for n in names if plain_skill_name(n)])


def same_skill(requirement_text: str, name: str) -> bool:
    """True when the requirement names this skill exactly, or by a name the reviewed table records
    as the same technology. Every specific word of the skill's name must be accounted for, so a name
    that also mentions something else ("Bash (also counts as Terraform)") doesn't match."""
    if not plain_skill_name(name):
        return False
    terms = canonical_terms(name)
    return contains_phrase(requirement_text, name) or bool(
        terms and terms <= canonical_terms(requirement_text)
    )


def exact_skill(requirement_text: str, name: str) -> bool:
    return plain_skill_name(name) and contains_phrase(requirement_text, name)


class RulesProvider:
    name = "rules"
    model = None
    method_version = "rules-v5"
    local = True
    generative = False

    def __init__(self, use_trusted_table: bool = True) -> None:
        # False only for the retired hybrid provider, which relied on local AI for alternate names.
        self._use_table = use_trusted_table

    async def match(self, request: MatchRequest) -> list[Finding]:
        return [self._assess(request, requirement) for requirement in request.requirements]

    def _assess(self, request: MatchRequest, requirement: Requirement) -> Finding:
        # A requirement that contains instructions or evaluation language is not judged until the
        # person confirms it (requirement_structure.py). Otherwise only its qualification is judged.
        structure = parse(requirement.text, _listed(request), requirement.confirmed)
        if structure.needs_review:
            return _finding(
                requirement, "insufficient_information", NEEDS_CONFIRMATION, review="needs_confirmation"
            )
        notes: list[str] = []
        if structure.instructions:
            text = qualification_text(requirement.text)
            if not text:
                return _finding(requirement, "insufficient_information", INSTRUCTION_TEXT)
            requirement = requirement.model_copy(update={"text": text})
            notes.append(INSTRUCTIONS_IGNORED)
        if requirement.category == "Experience" and skill_like_experience(requirement.text):
            finding = self._skills(request, requirement)
            notes.append(JUDGED_AS_SKILL)
        elif requirement.category == "Experience":
            finding = self._experience(request, requirement)
        elif requirement.category == "Education":
            finding = self._education(request, requirement)
        else:
            finding = self._skills(request, requirement)
        if not notes:
            return finding
        caveats = list(dict.fromkeys([*finding.caveats, *notes]))[:5]
        return finding.model_copy(update={"caveats": caveats})

    def _experience(self, request: MatchRequest, requirement: Requirement) -> Finding:
        roles = [e for e in request.evidence if isinstance(e, ExperienceEvidence)]
        has_projects = any(isinstance(e, ProjectEvidence) for e in request.evidence)
        caveats = [PROJECT_NOT_EMPLOYMENT] if has_projects else []
        role_citations = [Citation(evidence_id=r.id, quote=r.job_title) for r in roles]
        needed = required_months(requirement.text)  # "3+ years", "two years", "2-3 years", "six months"

        if not roles:
            return _finding(
                requirement,
                "insufficient_information",
                "No professional employment is listed in your profile, so this cannot be assessed.",
                caveats=caveats,
            )
        if needed is not None:
            amount = f"{needed:g}-month" if needed % 12 else f"{needed / 12:g}-year"
            months = employment_months(request)
            listed = format_years(months)
            if months >= needed:
                return _finding(
                    requirement,
                    "possible",
                    f"Your listed employment totals {listed} years, "
                    f"which meets the {amount} amount. "
                    "Keyword rules cannot judge whether that experience is in the field "
                    "this requirement means.",
                    role_citations,
                    caveats,
                    basis="employment_dates",
                )
            return _finding(
                requirement,
                "gap",
                f"Your listed employment totals {listed} years, less than the {amount} amount stated.",
                role_citations,
                caveats,
                basis="employment_dates",
            )
        related = [
            Citation(evidence_id=r.id, quote=quote)
            for r in roles
            for text in (r.job_title, r.description or "")
            if (quote := self._shared_term(requirement.text, text))
        ]
        if related:
            return _finding(
                requirement,
                "possible",
                "Some of your listed roles mention terms from this requirement. "
                "Check that they match what it asks for.",
                related,
                caveats,
                basis="role_description",
            )
        return _finding(
            requirement,
            "insufficient_information",
            "None of your listed roles mention terms from this requirement.",
            caveats=caveats,
        )

    def _education(self, request: MatchRequest, requirement: Requirement) -> Finding:
        entries = [e for e in request.evidence if isinstance(e, EducationEvidence)]
        if not entries:
            return _finding(
                requirement,
                "insufficient_information",
                "No education is listed in your profile, so this cannot be assessed.",
            )
        wanted = required_degree_rank(requirement.text)
        best: tuple[EducationEvidence, bool] | None = None
        ranks: list[int | None] = []
        for entry in entries:
            level = degree_rank(entry.qualification)
            ranks.append(level[0] if level else None)
            if wanted and level and level[0] >= wanted[0]:
                # A degree name can imply its field: an MBA is in business administration, on either side.
                field = entry.field_of_study or implied_field(entry.qualification)
                required = [f for _, _, f in _implied(requirement.text) if f]
                field_match = bool(
                    field
                    and (
                        any(field_matches(f, field) for f in required)
                        if required
                        else field_matches(requirement.text, field)
                    )
                )
                if best is None or (field_match and not best[1]):
                    best = (entry, field_match)

        if best:
            entry, field_match = best
            citations = [Citation(evidence_id=entry.id, quote=entry.qualification)]
            if field_match:
                field = entry.field_of_study or implied_field(entry.qualification)
                if entry.field_of_study:
                    citations.append(Citation(evidence_id=entry.id, quote=entry.field_of_study))
                return _finding(
                    requirement,
                    "supported",
                    f"You list a {wanted[1]} level qualification in {field}.",
                    citations,
                    basis="education",
                )
            if names_same_degree(requirement.text, entry.qualification):
                return _finding(
                    requirement,
                    "supported",
                    f"You list this {wanted[1]} level degree.",
                    citations,
                    basis="education",
                )
            unverifiable = bool(unverifiable_field(requirement.text))
            required_fields = [f for _, _, f in _implied(requirement.text) if f]
            if not asks_for_field(requirement.text) and not required_fields and not unverifiable:
                # Any field will do, and a higher degree meets a lower minimum.
                return _finding(
                    requirement,
                    "supported",
                    f"You list a qualification at or above the {wanted[1]} level this asks for.",
                    citations,
                    basis="education",
                )
            return _finding(
                requirement,
                "possible",
                f"You list a {wanted[1]} level qualification, "
                "but its field could not be matched to this requirement.",
                citations,
                [UNVERIFIABLE_FIELD] if unverifiable else [],
                basis="education",
            )
        if wanted and ranks and all(rank is not None and rank < wanted[0] for rank in ranks):
            return _finding(
                requirement,
                "gap",
                f"This asks for a {wanted[1]} degree; your listed qualifications are at a lower level.",
                [Citation(evidence_id=e.id, quote=e.qualification) for e in entries],
                basis="education",
            )
        return _finding(
            requirement,
            "insufficient_information",
            "Your listed education could not be compared with this requirement by keyword rules.",
        )

    def _skills(self, request: MatchRequest, requirement: Requirement) -> Finding:
        # Only the requirement's head (and later clauses that state a need) can earn credit; see
        # requirement_structure.py. Later text can add mandatory items, never substitute for them.
        # A skill name that carries a claim isn't a skill name, so it is never matched.
        listed = [s for s in request.evidence if isinstance(s, SkillEvidence) and plain_skill_name(s.name)]
        project_skills = [n for e in request.evidence if isinstance(e, ProjectEvidence) for n in e.skills]
        structure = parse(requirement.text, listed_terms([s.name for s in listed] + project_skills), True)
        head = structure.credit_text
        notes = [INSTRUCTIONS_IGNORED] if structure.ignored else []
        names_skill = same_skill if self._use_table else exact_skill
        matched = [s for s in listed if names_skill(head, s.name)]
        if matched:
            missing = [
                piece for piece in structure.pieces if not any(names_skill(piece, s.name) for s in listed)
            ]
            alternate = not any(exact_skill(head, s.name) for s in matched)
            basis = "alternate_name" if alternate else "listed_skill"
            skills = [Citation(evidence_id=s.id, quote=s.name) for s in matched]
            names = ", ".join(c.quote for c in skills)
            required = required_skill_level(requirement.text)
            level_caveat = None
            if required and not any(
                _PROFICIENCY_RANK.get(s.proficiency or "", 0) >= required[0] for s in matched
            ):
                # The skill is listed, but not at the level asked for (or no level was given).
                rated = [s for s in matched if s.proficiency]
                if rated:
                    levels = ", ".join(f"{s.name} as {_PROFICIENCY_LABEL[s.proficiency]}" for s in rated)  # type: ignore[index]
                    level_caveat = f"You rated {levels}; this requirement asks for {required[1]} level."
                else:
                    level_caveat = (
                        f"No skill level is listed, so keyword rules cannot confirm {required[1]} level."
                    )
            if level_caveat:
                explanation = f"You list {names} as a skill, but not at the level this requirement asks for."
                extra = [NOT_ALL_ITEMS(missing)] if missing else []
                return _finding(
                    requirement, "possible", explanation, skills, [level_caveat, *extra, *notes], basis=basis
                )
            if missing:
                return _finding(
                    requirement,
                    "possible",
                    f"You list {names} as a skill, but this requirement asks for more than that.",
                    skills,
                    [NOT_ALL_ITEMS(missing), *notes],
                    basis=basis,
                )
            if caveats := self._skill_caveats(requirement.text, matched):
                return _finding(
                    requirement,
                    "possible",
                    f"You list {names} as a skill, but that alone may not meet this requirement.",
                    skills,
                    [*caveats, *notes],
                    basis=basis,
                )
            explanation = (
                f"You list {names}, a known name for what this requirement asks for."
                if alternate
                else f"You list {names} as a skill."
            )
            return _finding(requirement, "supported", explanation, skills, notes, basis=basis)

        # A related technology from the reviewed table is a lead, never a match.
        family = [s for s in listed if self._use_table and relation(head, s.name) == "related"]
        if family:
            names = ", ".join(s.name for s in family)
            return _finding(
                requirement,
                "possible",
                f"You list {names}, a related technology rather than the same one.",
                [Citation(evidence_id=s.id, quote=s.name) for s in family],
                [RELATED_TECHNOLOGY, *notes],
                basis="related_technology",
            )

        related: list[Citation] = []
        caveats: list[str] = []
        project_only = True
        for item in request.evidence:
            if isinstance(item, ProjectEvidence):
                quotes = [s for s in item.skills if names_skill(head, s)]
                quotes += [
                    q
                    for text in (item.description, item.contribution, item.results)
                    if text and (q := self._shared_term(head, text, self._use_table))
                ]
                if quotes:
                    related.extend(Citation(evidence_id=item.id, quote=q) for q in dict.fromkeys(quotes))
                    caveats.append(PROJECT_MENTION)
            elif isinstance(item, ExperienceEvidence) and item.description:
                if quote := self._shared_term(head, item.description, self._use_table):
                    related.append(Citation(evidence_id=item.id, quote=quote))
                    project_only = False
        if related:
            return _finding(
                requirement,
                "possible",
                "This requirement's terms appear in your roles or projects, but not as a listed skill.",
                related,
                [*caveats, *notes],
                basis="project" if project_only else "described_in_work",
            )
        return _finding(
            requirement,
            "insufficient_information",
            "No listed skill, role, or project mentions this requirement's terms. Keyword rules cannot tell "
            "whether you have it under a different name.",
            caveats=notes,
        )

    @staticmethod
    def _skill_caveats(requirement_text: str, matched: list[SkillEvidence]) -> list[str]:
        """Why a listed skill named in the requirement does not fully meet it (empty if it does)."""
        caveats = []
        wanted = canonical_terms(requirement_text)
        # "React" inside "React Native": the words match, but the requirement names another technology.
        if not any(canonical_terms(s.name) <= wanted for s in matched):
            caveats.append(PART_OF_LONGER_NAME)
        if required_months(requirement_text) is not None:
            caveats.append(YEARS_PER_SKILL)
        if QUALIFICATION_WORDS.search(requirement_text):
            caveats.append(CREDENTIAL_NOT_SHOWN)
        return caveats

    @staticmethod
    def _shared_term(requirement_text: str, evidence_text: str, use_table: bool = True) -> str | None:
        """A specific word or two-word phrase found in both texts, quoted exactly as in the evidence.

        Generic words ("knowledge", "tools", "administration") are ignored so they cannot produce
        matches on their own, and two-word phrases are tried first. Profile text aimed at an AI or
        reviewer, or about the evaluation itself, is skipped. A word that is also ordinary English
        ("rust", "excel") must appear near a technical noun, so "rust prevention coatings" doesn't
        match Rust.
        """
        generic = GENERIC_WORDS | generic_terms()
        directed = untrusted_evidence_spans(evidence_text)
        known = vocabulary()

        def usable(quote: str, start: int, end: int) -> bool:
            if any(s < end and start < e for s, e in directed):
                return False
            if not quote_terms(quote, evidence_text):
                return False
            # A named technology must be described as used in work; a mention alone isn't evidence.
            names_technology = bool(canonical_terms(quote) & known) or any(c.isupper() for c in quote)
            return not names_technology or describes_use(evidence_text, quote)

        # A name the reviewed table records as the same technology ("k8s" for Kubernetes).
        for term in canonical_terms(requirement_text) & known if use_table else ():
            for form in surface_forms(term):
                pattern = rf"(?<![A-Za-z0-9]){re.escape(form)}(?![A-Za-z0-9])"
                for match in re.finditer(pattern, evidence_text, flags=re.IGNORECASE):
                    if usable(match.group(0), match.start(), match.end()):
                        return match.group(0)

        words = re.findall(r"[A-Za-z][A-Za-z0-9+#.&-]*", requirement_text)
        for size in (2, 1):
            for i in range(len(words) - size + 1):
                window = words[i : i + size]
                if any(
                    w.casefold() in generic or (len(w) < 3 and w.casefold() not in vocabulary())
                    for w in window
                ):
                    continue  # two-letter words only when they name a known technology ("Go")
                phrase = " ".join(window)
                if not contains_phrase(evidence_text, phrase):
                    continue
                whole = rf"(?<![A-Za-z0-9]){re.escape(phrase)}(?![A-Za-z0-9])"
                for match in re.finditer(whole, evidence_text, flags=re.IGNORECASE):
                    if usable(match.group(0), match.start(), match.end()):
                        return match.group(0)
        return None
