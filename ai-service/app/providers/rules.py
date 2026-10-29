"""Deterministic rules provider: explainable keyword and date logic, no AI.

Deliberately conservative. Keyword rules cannot prove that a skill is absent, so this provider
never returns a skills "gap". It also cannot judge whether experience is relevant, so a
years-of-experience requirement that is met is reported as "possible" rather than "supported".
"""

import re

from app.matching.evidence import (
    PROJECT_NOT_EMPLOYMENT,
    contains_phrase,
    employment_months,
    find_verbatim,
    format_years,
)
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
# Words too generic to count as a match on their own.
GENERIC_WORDS = frozenset(
    """a an and the or of in on to for with as such like using use including plus etc
    year years month months experience experienced professional work working ability able
    knowledge familiarity familiar proficiency proficient skill skills strong solid good excellent
    understanding tools tool required preferred minimum must nice have having demonstrated proven
    related relevant equivalent field degree team""".split()
)
_YEARS = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:or more\s+)?years?", re.IGNORECASE)
_LEVELS = [  # (rank, label, patterns), ordered most to least specific per rank
    (4, "doctorate", [r"\bph\.?\s?d\b", r"\bdoctorate\b", r"\bdoctoral\b"]),
    (
        3,
        "master's",
        [
            r"\bmaster'?s?\b",
            r"\bm\.?\s?s\.?(?=\s|$|,)",
            r"\bm\.?\s?eng\b",
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
]


def degree_rank(text: str) -> tuple[int, str] | None:
    for rank, label, patterns in _LEVELS:
        if any(re.search(p, text, re.IGNORECASE) for p in patterns):
            return rank, label
    return None


def _finding(requirement: Requirement, verdict, explanation: str, citations=(), caveats=()) -> Finding:
    return Finding(
        requirement_index=requirement.index,
        verdict=verdict,
        explanation=explanation,
        citations=list(citations)[:10],
        caveats=list(dict.fromkeys(caveats))[:5],
    )


class RulesProvider:
    name = "rules"
    model = None
    method_version = "rules-v1"

    async def match(self, request: MatchRequest) -> list[Finding]:
        return [self._assess(request, requirement) for requirement in request.requirements]

    def _assess(self, request: MatchRequest, requirement: Requirement) -> Finding:
        if requirement.category == "Experience":
            return self._experience(request, requirement)
        if requirement.category == "Education":
            return self._education(request, requirement)
        return self._skills(request, requirement)

    def _experience(self, request: MatchRequest, requirement: Requirement) -> Finding:
        roles = [e for e in request.evidence if isinstance(e, ExperienceEvidence)]
        has_projects = any(isinstance(e, ProjectEvidence) for e in request.evidence)
        caveats = [PROJECT_NOT_EMPLOYMENT] if has_projects else []
        role_citations = [Citation(evidence_id=r.id, quote=r.job_title) for r in roles]
        years = _YEARS.search(requirement.text)

        if not roles:
            return _finding(
                requirement,
                "insufficient_information",
                "No professional employment is listed in your profile, so this cannot be assessed.",
                caveats=caveats,
            )
        if years:
            needed = float(years.group(1))
            months = employment_months(request)
            listed = format_years(months)
            if months >= needed * 12:
                return _finding(
                    requirement,
                    "possible",
                    f"Your listed employment totals {listed} years, "
                    f"which meets the {years.group(1)}-year amount. "
                    "Keyword rules cannot judge whether that experience is in the field "
                    "this requirement means.",
                    role_citations,
                    caveats,
                )
            return _finding(
                requirement,
                "gap",
                f"Your listed employment totals {listed} years, less than the {years.group(1)} years stated.",
                role_citations,
                caveats,
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
        wanted = degree_rank(requirement.text)
        best: tuple[EducationEvidence, bool] | None = None
        ranks: list[int | None] = []
        for entry in entries:
            level = degree_rank(entry.qualification)
            ranks.append(level[0] if level else None)
            if wanted and level and level[0] >= wanted[0]:
                field_match = bool(
                    entry.field_of_study and contains_phrase(requirement.text, entry.field_of_study)
                )
                if best is None or (field_match and not best[1]):
                    best = (entry, field_match)

        if best:
            entry, field_match = best
            citations = [Citation(evidence_id=entry.id, quote=entry.qualification)]
            if field_match and entry.field_of_study:
                citations.append(Citation(evidence_id=entry.id, quote=entry.field_of_study))
                return _finding(
                    requirement,
                    "supported",
                    f"You list a {wanted[1]} level qualification in {entry.field_of_study}.",
                    citations,
                )
            return _finding(
                requirement,
                "possible",
                f"You list a {wanted[1]} level qualification, "
                "but its field could not be matched to this requirement.",
                citations,
            )
        if wanted and ranks and all(rank is not None and rank < wanted[0] for rank in ranks):
            return _finding(
                requirement,
                "gap",
                f"This asks for a {wanted[1]} degree; your listed qualifications are at a lower level.",
                [Citation(evidence_id=e.id, quote=e.qualification) for e in entries],
            )
        return _finding(
            requirement,
            "insufficient_information",
            "Your listed education could not be compared with this requirement by keyword rules.",
        )

    def _skills(self, request: MatchRequest, requirement: Requirement) -> Finding:
        skills = [
            Citation(evidence_id=s.id, quote=s.name)
            for s in request.evidence
            if isinstance(s, SkillEvidence) and contains_phrase(requirement.text, s.name)
        ]
        if skills:
            names = ", ".join(c.quote for c in skills)
            return _finding(requirement, "supported", f"You list {names} as a skill.", skills)

        related: list[Citation] = []
        caveats: list[str] = []
        for item in request.evidence:
            if isinstance(item, ProjectEvidence):
                quotes = [s for s in item.skills if contains_phrase(requirement.text, s)]
                quotes += [
                    q
                    for text in (item.description, item.contribution, item.results)
                    if text and (q := self._shared_term(requirement.text, text))
                ]
                if quotes:
                    related.extend(Citation(evidence_id=item.id, quote=q) for q in dict.fromkeys(quotes))
                    caveats.append(PROJECT_MENTION)
            elif isinstance(item, ExperienceEvidence) and item.description:
                if quote := self._shared_term(requirement.text, item.description):
                    related.append(Citation(evidence_id=item.id, quote=quote))
        if related:
            return _finding(
                requirement,
                "possible",
                "This requirement's terms appear in your roles or projects, but not as a listed skill.",
                related,
                caveats,
            )
        return _finding(
            requirement,
            "insufficient_information",
            "No listed skill, role, or project mentions this requirement's terms. Keyword rules cannot tell "
            "whether you have it under a different name.",
        )

    @staticmethod
    def _shared_term(requirement_text: str, evidence_text: str) -> str | None:
        """A specific word or two-word phrase found in both texts, quoted exactly as in the evidence.

        Generic requirement words ("knowledge", "tools", "strong") are ignored so they cannot
        produce matches on their own. Two-word phrases are tried first.
        """
        words = re.findall(r"[A-Za-z][A-Za-z0-9+#.&-]*", requirement_text)
        for size in (2, 1):
            for i in range(len(words) - size + 1):
                window = words[i : i + size]
                if any(w.casefold() in GENERIC_WORDS or len(w) < 3 for w in window):
                    continue
                phrase = " ".join(window)
                if contains_phrase(evidence_text, phrase):
                    return find_verbatim(evidence_text, phrase)
        return None
