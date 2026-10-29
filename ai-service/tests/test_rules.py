import copy

import pytest

from app.matching.evidence import PROJECT_NOT_EMPLOYMENT
from app.matching.validate import validate_findings
from app.providers.rules import RulesProvider, degree_rank
from app.schemas import MatchRequest
from tests.conftest import ev


def _requirement(text: str, category: str, index: int = 0) -> dict:
    return {"index": index, "text": text, "category": category, "priority": "Required"}


async def _assess(example: dict, text: str, category: str, evidence: list[dict] | None = None):
    data = copy.deepcopy(example)
    data["requirements"] = [_requirement(text, category)]
    if evidence is not None:
        data["evidence"] = evidence
    request = MatchRequest.model_validate(data)
    findings = await RulesProvider().match(request)
    return request, findings[0]


async def test_listed_skill_is_supported_with_exact_quote(example_request):
    _, finding = await _assess(example_request, "Advanced solidworks modelling", "Skills")
    assert finding.verdict == "supported"
    assert [(c.evidence_id, c.quote) for c in finding.citations] == [(ev("skill", 1), "SolidWorks")]


async def test_similar_names_do_not_match(example_request):
    _, finding = await _assess(
        example_request, "JavaScript", "Skills", [{"id": ev("skill", 1), "kind": "skill", "name": "Java"}]
    )
    assert finding.verdict == "insufficient_information"


async def test_skill_only_in_a_project_is_possible_not_supported(example_request):
    _, finding = await _assess(example_request, "Python scripting", "Other")
    assert finding.verdict == "possible"
    assert finding.citations[0].evidence_id == ev("project", 6)
    assert "Mentioned in a project, not listed as a skill." in finding.caveats


async def test_unknown_skill_is_insufficient_never_gap(example_request):
    _, finding = await _assess(example_request, "Kubernetes administration", "Skills")
    assert finding.verdict == "insufficient_information"


async def test_generic_words_alone_do_not_match(example_request):
    _, finding = await _assess(example_request, "Strong knowledge of related tools", "Skills")
    assert finding.verdict == "insufficient_information"


async def test_years_met_by_employment_is_possible(example_request):
    _, finding = await _assess(example_request, "3+ years of experience", "Experience")
    assert finding.verdict == "possible"
    assert "3.8 years" in finding.explanation
    assert {c.evidence_id for c in finding.citations} == {ev("experience", 3), ev("experience", 4)}


async def test_years_not_met_is_gap(example_request):
    _, finding = await _assess(example_request, "5 years of experience", "Experience")
    assert finding.verdict == "gap"
    assert "3.8 years" in finding.explanation


async def test_projects_never_count_toward_years(example_request):
    long_project = {
        "id": ev("project", 7),
        "kind": "project",
        "title": "Ten-year open source maintainer",
        "description": "Maintained a library for 10 years.",
    }
    one_role = {
        "id": ev("experience", 8),
        "kind": "experience",
        "job_title": "Designer",
        "start_month": "2026-01",
        "end_month": "2026-06",
    }
    _, finding = await _assess(
        example_request, "2 years of experience", "Experience", [long_project, one_role]
    )
    assert finding.verdict == "gap"
    assert "0.5 years" in finding.explanation
    assert PROJECT_NOT_EMPLOYMENT in finding.caveats
    assert all(c.evidence_id != ev("project", 7) for c in finding.citations)


async def test_projects_only_profile_is_insufficient_for_experience(example_request):
    project = {
        "id": ev("project", 7),
        "kind": "project",
        "title": "Robot arm",
        "description": "Built a robot arm.",
    }
    _, finding = await _assess(example_request, "3 years of experience", "Experience", [project])
    assert finding.verdict == "insufficient_information"
    assert PROJECT_NOT_EMPLOYMENT in finding.caveats


async def test_degree_with_matching_field_is_supported(example_request):
    _, finding = await _assess(example_request, "BS in Mechanical Engineering or related field", "Education")
    assert finding.verdict == "supported"


async def test_degree_with_other_field_is_possible(example_request):
    _, finding = await _assess(example_request, "Bachelor's degree in Electrical Engineering", "Education")
    assert finding.verdict == "possible"


async def test_lower_degree_is_gap(example_request):
    associate = {
        "id": ev("education", 7),
        "kind": "education",
        "qualification": "Associate degree",
        "start_month": "2018-01",
        "end_month": "2020-01",
    }
    _, finding = await _assess(
        example_request, "Master's degree in Mechanical Engineering", "Education", [associate]
    )
    assert finding.verdict == "gap"


async def test_no_education_is_insufficient(example_request):
    _, finding = await _assess(example_request, "Bachelor's degree", "Education", [])
    assert finding.verdict == "insufficient_information"


@pytest.mark.parametrize(
    ("text", "rank"),
    [
        ("B.S.", 2),
        ("BS, Mechanical", 2),
        ("Bachelor of Science", 2),
        ("M.S.", 3),
        ("MBA", 3),
        ("PhD", 4),
        ("Diploma", None),
    ],
)
def test_degree_rank(text, rank):
    result = degree_rank(text)
    assert (result[0] if result else None) == rank


async def test_rules_output_always_passes_validation_unchanged(example_request):
    request = MatchRequest.model_validate(example_request)
    findings = await RulesProvider().match(request)
    assert validate_findings(request, findings) == findings
