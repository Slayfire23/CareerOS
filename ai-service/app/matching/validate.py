"""Code-enforced rules applied to every provider's output, whatever produced it.

Reject the whole response (``InvalidProviderOutput``) when it is structurally wrong:
- a finding is missing, duplicated, or refers to a requirement that was not sent;
- a citation refers to evidence that was not supplied in this request.

Downgrade individual findings when they overreach:
- citations whose quote is not verbatim from the cited entry are dropped;
- "supported"/"possible" with no remaining citation becomes "insufficient_information";
- for Experience requirements, projects never count as employment: if no employment entry is
  cited, the verdict is at most "possible" and the project caveat is added;
- any "N years" stated in an explanation must match the requirement text or the computed
  employment durations, otherwise the finding becomes "insufficient_information";
- "gap" is not allowed when the relevant part of the profile is empty.

In strict mode (every cloud provider), any finding that would be downgraded rejects the whole
response instead: model output that overreaches is discarded, never repaired.
"""

import re

from app.matching.evidence import (
    PROJECT_NOT_EMPLOYMENT,
    employment_months,
    format_years,
    quote_is_verbatim,
    role_months,
)
from app.schemas import (
    EducationEvidence,
    ExperienceEvidence,
    Finding,
    MatchRequest,
    ProjectEvidence,
    Requirement,
    SkillEvidence,
)

UNVERIFIED_EVIDENCE = "Some cited evidence could not be verified and was removed."
UNVERIFIED_DURATION = "A stated duration could not be verified against your listed employment."
_NUMBER_WORDS = {
    word: str(number)
    for number, word in enumerate(
        "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
        "sixteen seventeen eighteen nineteen twenty".split()
    )
}
# Matches "5 years", "5+ years", "5 or more years", "5-year", and "five years".
_YEARS = re.compile(
    r"\b(\d+(?:\.\d+)?|" + "|".join(_NUMBER_WORDS) + r")\s*\+?\s*(?:or more\s+)?-?\s*years?\b",
    re.IGNORECASE,
)


def stated_years(text: str) -> set[str]:
    """Every number of years mentioned, normalized ("five" and "5.0" both become "5")."""
    values = set()
    for match in _YEARS.finditer(text):
        raw = match.group(1).casefold()
        values.add(f"{float(_NUMBER_WORDS.get(raw, raw)):g}")
    return values


class InvalidProviderOutput(Exception):
    """The provider's output cannot be trusted and must not be shown or stored."""


def _allowed_year_values(request: MatchRequest, requirement: Requirement) -> set[str]:
    values = stated_years(requirement.text)
    values.add(format_years(employment_months(request)))
    values.update(
        format_years(role_months(e, request.as_of_month))
        for e in request.evidence
        if isinstance(e, ExperienceEvidence)
    )
    return {f"{float(v):g}" for v in values}


def _area_is_empty(request: MatchRequest, requirement: Requirement) -> bool:
    kinds: tuple[type, ...]
    if requirement.category == "Experience":
        kinds = (ExperienceEvidence,)
    elif requirement.category == "Education":
        kinds = (EducationEvidence,)
    else:
        kinds = (SkillEvidence, ExperienceEvidence, ProjectEvidence)
    return not any(isinstance(e, kinds) for e in request.evidence)


def validate_findings(request: MatchRequest, findings: list[Finding], strict: bool = False) -> list[Finding]:
    requirements = {r.index: r for r in request.requirements}
    evidence = {e.id: e for e in request.evidence}

    indexes = [f.requirement_index for f in findings]
    if sorted(indexes) != sorted(requirements):
        raise InvalidProviderOutput("Findings must cover each requirement exactly once.")
    for finding in findings:
        for citation in finding.citations:
            if citation.evidence_id not in evidence:
                raise InvalidProviderOutput("A finding cites evidence that was not supplied.")

    checked = [_check(request, requirements[f.requirement_index], f, evidence) for f in findings]
    if strict and any(c is not f for c, f in zip(checked, findings, strict=True)):
        raise InvalidProviderOutput("A finding overreached its evidence and the response was discarded.")
    return sorted(checked, key=lambda f: f.requirement_index)


def _check(request: MatchRequest, requirement: Requirement, finding: Finding, evidence: dict) -> Finding:
    verdict = finding.verdict
    caveats = list(finding.caveats)
    citations = [c for c in finding.citations if quote_is_verbatim(evidence[c.evidence_id], c.quote)]
    if len(citations) < len(finding.citations):
        caveats.append(UNVERIFIED_EVIDENCE)

    if verdict in ("supported", "possible") and not citations:
        verdict = "insufficient_information"

    if requirement.category == "Experience":
        cited = [evidence[c.evidence_id] for c in citations]
        if any(isinstance(e, ProjectEvidence) for e in cited):
            caveats.append(PROJECT_NOT_EMPLOYMENT)
        if verdict in ("supported", "possible") and not any(isinstance(e, ExperienceEvidence) for e in cited):
            verdict = "possible" if verdict == "supported" else verdict
            caveats.append(PROJECT_NOT_EMPLOYMENT)

    if stated_years(finding.explanation) - _allowed_year_values(request, requirement):
        verdict = "insufficient_information"
        caveats.append(UNVERIFIED_DURATION)

    if verdict == "gap" and _area_is_empty(request, requirement):
        verdict = "insufficient_information"

    caveats = list(dict.fromkeys(caveats))[:5]
    if (
        verdict == finding.verdict
        and citations == finding.citations
        and caveats == list(dict.fromkeys(finding.caveats))
    ):
        return finding
    return finding.model_copy(update={"verdict": verdict, "citations": citations, "caveats": caveats})
