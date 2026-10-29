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
_YEARS = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:or more\s+)?years?", re.IGNORECASE)


class InvalidProviderOutput(Exception):
    """The provider's output cannot be trusted and must not be shown or stored."""


def _allowed_year_values(request: MatchRequest, requirement: Requirement) -> set[str]:
    values = {m.group(1) for m in _YEARS.finditer(requirement.text)}
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


def validate_findings(request: MatchRequest, findings: list[Finding]) -> list[Finding]:
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

    stated = {f"{float(m.group(1)):g}" for m in _YEARS.finditer(finding.explanation)}
    if stated - _allowed_year_values(request, requirement):
        verdict = "insufficient_information"
        caveats.append(UNVERIFIED_DURATION)

    if verdict == "gap" and _area_is_empty(request, requirement):
        verdict = "insufficient_information"

    if verdict == finding.verdict and citations == finding.citations and caveats == finding.caveats:
        return finding
    return finding.model_copy(
        update={"verdict": verdict, "citations": citations, "caveats": list(dict.fromkeys(caveats))[:5]}
    )
