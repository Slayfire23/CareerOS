import copy

import pytest
from pydantic import ValidationError

from app.matching.evidence import (
    contains_phrase,
    employment_months,
    format_years,
    quote_is_verbatim,
    role_months,
)
from app.schemas import MatchRequest
from tests.conftest import ev, post_match


def _request(example: dict) -> MatchRequest:
    return MatchRequest.model_validate(example)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda r: r["requirements"][0].update(extra="field"),
        lambda r: r["evidence"][0].update(id=ev("project", 1)),  # id prefix does not match kind
        lambda r: r["requirements"].append(dict(r["requirements"][0])),  # duplicate index
        lambda r: r["evidence"].append(dict(r["evidence"][0])),  # duplicate evidence id
        lambda r: r["evidence"][2].update(start_month="2027-01"),  # current role starts after as_of
        lambda r: r["evidence"][3].update(end_month="2021-01"),  # ends before it starts
        lambda r: r["requirements"][0].update(category="Salary"),
        lambda r: r.update(requirements=[]),
        lambda r: r.update(requirements=[{**r["requirements"][0], "index": i} for i in range(51)]),
        lambda r: r.update(as_of_month="2026-13"),
    ],
)
def test_invalid_requests_are_rejected(example_request, mutate):
    bad = copy.deepcopy(example_request)
    mutate(bad)
    with pytest.raises(ValidationError):
        _request(bad)


def test_validation_errors_do_not_echo_submitted_values(client, example_request):
    bad = copy.deepcopy(example_request)
    bad["requirements"][0]["category"] = "PRIVATE-VALUE-SHOULD-NOT-ECHO"
    response = post_match(client, bad)
    assert response.status_code == 422
    assert "PRIVATE-VALUE" not in response.text
    assert "requirements.0.category" in response.json()["error"]["message"]


def test_role_months_are_inclusive_and_current_roles_run_to_as_of(example_request):
    request = _request(example_request)
    current, internship = request.evidence[2], request.evidence[3]
    assert role_months(internship, request.as_of_month) == 4  # May-Aug 2022
    assert role_months(current, request.as_of_month) == 41  # Jun 2023 - Oct 2026


def test_employment_months_merge_overlaps_and_ignore_projects(example_request):
    data = copy.deepcopy(example_request)
    data["evidence"].append(
        {
            "id": ev("experience", 9),
            "kind": "experience",
            "job_title": "Part-time tutor",
            "start_month": "2024-01",
            "end_month": "2024-12",
        }
    )
    request = _request(data)
    assert employment_months(request) == 45  # overlap with the current role adds nothing
    assert format_years(45) == "3.8"


def test_projects_alone_give_zero_employment(example_request):
    data = copy.deepcopy(example_request)
    data["evidence"] = [e for e in data["evidence"] if e["kind"] != "experience"]
    assert employment_months(_request(data)) == 0


@pytest.mark.parametrize(
    ("text", "phrase", "expected"),
    [
        ("Proficiency in SolidWorks", "solidworks", True),
        ("Strong JavaScript skills", "Java", False),
        ("C++ and C# required", "C++", True),
        ("C++ and C# required", "C#", True),
        ("Knowledge of GD&T", "GD&T", True),
        ("Python scripting", "Python scripting", True),
        ("Python", "Python scripting", False),
    ],
)
def test_contains_phrase(text, phrase, expected):
    assert contains_phrase(text, phrase) is expected


def test_quotes_must_be_verbatim(example_request):
    request = _request(example_request)
    role = request.evidence[2]
    assert quote_is_verbatim(role, "injection molding fixtures")
    assert not quote_is_verbatim(role, "Injection Molding Fixtures")  # case must match the entry
    assert not quote_is_verbatim(role, "led a team of ten")  # invented text
