"""The validator, exercised with a scripted (fake) provider that makes the mistakes an AI model could."""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.matching.evidence import PROJECT_NOT_EMPLOYMENT
from app.matching.validate import (
    UNVERIFIED_DURATION,
    UNVERIFIED_EVIDENCE,
    InvalidProviderOutput,
    validate_findings,
)
from app.providers.fake import FakeProvider
from app.schemas import Citation, Finding, MatchRequest
from tests.conftest import CONTRACTS, ev, make_settings, post_match


def _f(index, verdict="supported", explanation="Explained.", citations=(), caveats=()):
    return Finding(
        requirement_index=index,
        verdict=verdict,
        explanation=explanation,
        citations=[Citation(evidence_id=i, quote=q) for i, q in citations],
        caveats=list(caveats),
    )


def _all_insufficient(request: MatchRequest) -> list[Finding]:
    return [_f(r.index, "insufficient_information") for r in request.requirements]


@pytest.fixture
def request_model(example_request) -> MatchRequest:
    return MatchRequest.model_validate(example_request)


def test_citation_to_unsupplied_evidence_rejects_everything(request_model):
    findings = _all_insufficient(request_model)
    findings[1] = _f(1, citations=[(ev("skill", 999), "SolidWorks")])
    with pytest.raises(InvalidProviderOutput, match="not supplied"):
        validate_findings(request_model, findings)


@pytest.mark.parametrize("problem", ["missing", "duplicate", "unknown"])
def test_findings_must_cover_each_requirement_once(request_model, problem):
    findings = _all_insufficient(request_model)
    if problem == "missing":
        findings = findings[1:]
    elif problem == "duplicate":
        findings.append(findings[0])
    else:
        findings.append(_f(42, "insufficient_information"))
    with pytest.raises(InvalidProviderOutput):
        validate_findings(request_model, findings)


def test_non_verbatim_quote_is_dropped_and_verdict_downgraded(request_model):
    invented = _f(1, "supported", citations=[(ev("skill", 1), "SolidWorks expert, 10 certifications")])
    findings = _all_insufficient(request_model)
    findings[1] = invented
    result = validate_findings(request_model, findings)[1]
    assert result.verdict == "insufficient_information"
    assert result.citations == []
    assert UNVERIFIED_EVIDENCE in result.caveats


def test_project_cannot_support_an_employment_requirement(request_model):
    project_as_job = _f(
        0, "supported", "Your project shows this.", [(ev("project", 6), "Low-cost prosthetic hand")]
    )
    findings = _all_insufficient(request_model)
    findings[0] = project_as_job
    result = validate_findings(request_model, findings)[0]
    assert result.verdict == "possible"
    assert PROJECT_NOT_EMPLOYMENT in result.caveats


def test_invented_duration_is_downgraded(request_model):
    claim = _f(
        0,
        "supported",
        "You have 7 years of design experience.",
        [(ev("experience", 3), "Mechanical Engineer")],
    )
    findings = _all_insufficient(request_model)
    findings[0] = claim
    result = validate_findings(request_model, findings)[0]
    assert result.verdict == "insufficient_information"
    assert UNVERIFIED_DURATION in result.caveats


def test_durations_from_requirement_or_computed_totals_are_allowed(request_model):
    claim = _f(
        0,
        "possible",
        "You list 3.8 years against the 3 years asked.",
        [(ev("experience", 3), "Mechanical Engineer")],
    )
    findings = _all_insufficient(request_model)
    findings[0] = claim
    assert validate_findings(request_model, findings)[0].verdict == "possible"


def test_gap_is_not_allowed_for_an_empty_profile_area(example_request):
    data = dict(
        example_request, evidence=[e for e in example_request["evidence"] if e["kind"] != "education"]
    )
    request = MatchRequest.model_validate(data)
    findings = _all_insufficient(request)
    findings[2] = _f(2, "gap", "No degree.")
    assert validate_findings(request, findings)[2].verdict == "insufficient_information"


def test_valid_findings_pass_through_unchanged(request_model):
    good = _f(1, "supported", "You list SolidWorks.", [(ev("skill", 1), "SolidWorks")])
    findings = _all_insufficient(request_model)
    findings[1] = good
    assert validate_findings(request_model, findings)[1] is good


# --- Through the API ---------------------------------------------------------------------------


def test_rules_response_matches_contract_fixture(client, example_request):
    response = post_match(client, example_request, request_id=example_request["request_id"])
    assert response.status_code == 200
    expected = json.loads((CONTRACTS / "response.rules.example.json").read_text(encoding="utf-8"))
    assert response.json() == expected
    assert sum(expected["verdict_counts"].values()) == len(example_request["requirements"])


def test_untrustworthy_provider_output_is_discarded(example_request):
    def fabricate(request):
        return [
            _f(r.index, "supported", citations=[(ev("skill", 777), "Made up")]) for r in request.requirements
        ]

    client = TestClient(create_app(make_settings(), provider=FakeProvider(fabricate)))
    response = post_match(client, example_request)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "provider_output_rejected"
    assert "Made up" not in response.text


def test_slow_provider_times_out(example_request):
    class Slow(FakeProvider):
        async def match(self, request):
            await asyncio.sleep(1)
            return await super().match(request)

    client = TestClient(create_app(make_settings(provider_timeout_seconds=0.05), provider=Slow()))
    response = post_match(client, example_request)
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "provider_timeout"


def test_single_letter_quotes_are_not_evidence(request_model):
    findings = _all_insufficient(request_model)
    findings[1] = _f(1, "supported", "Listed.", [(ev("skill", 1), "S")])
    result = validate_findings(request_model, findings)[1]
    assert result.verdict == "insufficient_information"
    assert UNVERIFIED_EVIDENCE in result.caveats


def test_short_whole_field_quotes_are_allowed(example_request):
    data = dict(example_request, evidence=[{"id": ev("skill", 1), "kind": "skill", "name": "C"}])
    request = MatchRequest.model_validate(data)
    findings = _all_insufficient(request)
    findings[1] = _f(1, "supported", "You list C.", [(ev("skill", 1), "C")])
    assert validate_findings(request, findings)[1].verdict == "supported"


@pytest.mark.parametrize(
    "explanation",
    ["You have seven years of experience.", "A 7-year track record.", "Over 9.5 years in design."],
)
def test_invented_durations_in_any_format_are_caught(request_model, explanation):
    findings = _all_insufficient(request_model)
    findings[0] = _f(0, "possible", explanation, [(ev("experience", 3), "Mechanical Engineer")])
    result = validate_findings(request_model, findings)[0]
    assert result.verdict == "insufficient_information"
    assert UNVERIFIED_DURATION in result.caveats


def test_spelled_out_requirement_durations_are_allowed(example_request):
    data = dict(example_request)
    data["requirements"] = [{**example_request["requirements"][0], "text": "Three years of design work"}]
    request = MatchRequest.model_validate(data)
    findings = [
        _f(
            0,
            "possible",
            "The posting asks for 3 years; you list 3.8 years.",
            [(ev("experience", 3), "Mechanical Engineer")],
        )
    ]
    assert validate_findings(request, findings)[0].verdict == "possible"
