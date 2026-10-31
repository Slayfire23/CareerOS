"""Anthropic provider against a mocked Messages API. No network, no real key, fictional data only.

The mock answers with documented response and error shapes, so these tests cover how the
provider maps every outcome to a billing state, and that it never retries a possibly billed call.
"""

import json
import logging
import uuid

import httpx2
import pytest
from anthropic import AsyncAnthropic
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.anthropic import BREAKER_FAILURES, AnthropicProvider
from app.providers.rules import RulesProvider
from tests.conftest import CONTRACTS, FAKE_ANTHROPIC_KEY, SharedMemoryStore, ev, make_settings, post_match

BUDGET = {"max_input_tokens": 40_000, "max_output_tokens": 4_000}
USAGE = {"input_tokens": 1834, "output_tokens": 412}


def cloud_settings(**overrides):
    values = {
        "providers": "rules,anthropic",
        "replay_store_url": "redis://127.0.0.1:6379/0",
        "anthropic_api_key": FAKE_ANTHROPIC_KEY,
    } | overrides
    return make_settings(**values)


def message(text: str, stop_reason: str = "end_turn", usage: dict = USAGE) -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": usage,
    }


def api_error(status: int, error_type: str, details: dict | None = None, headers: dict | None = None):
    error = {"type": error_type, "message": "fictional error"} | ({"details": details} if details else {})
    body = {"type": "error", "error": error, "request_id": "req_test_error"}
    return httpx2.Response(status, json=body, headers={"request-id": "req_test_error"} | (headers or {}))


class MockAnthropic:
    """Scripted responses; records every request body it receives."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[dict] = []
        self.headers: list[dict] = []

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(json.loads(request.content))
        self.headers.append(dict(request.headers))
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        if isinstance(item, httpx2.Response):
            return item
        return httpx2.Response(200, json=item, headers={"request-id": "req_test_ok"})

    def client(self) -> AsyncAnthropic:
        return AsyncAnthropic(
            api_key=FAKE_ANTHROPIC_KEY,
            max_retries=0,
            http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(self.handler)),
        )


def golden_findings() -> list[dict]:
    """The rules engine's golden answer for the example request: known to pass validation."""
    return json.loads((CONTRACTS / "response.rules.example.json").read_text(encoding="utf-8"))["findings"]


def cloud_app(mock: MockAnthropic, settings=None, sleeps: list | None = None):
    settings = settings or cloud_settings()

    async def fake_sleep(seconds: float) -> None:
        if sleeps is not None:
            sleeps.append(seconds)

    provider = AnthropicProvider(settings, client=mock.client(), sleep=fake_sleep)
    app = create_app(
        settings,
        providers={"rules": RulesProvider(), "anthropic": provider},
        replay_store=SharedMemoryStore(),
    )
    return TestClient(app), provider


def ask(client, example_request, **changes):
    return post_match(client, {**example_request, "provider": "anthropic", "budget": BUDGET} | changes)


def test_successful_analysis_returns_validated_findings_with_usage(example_request):
    mock = MockAnthropic(message(json.dumps({"findings": golden_findings()})))
    client, _ = cloud_app(mock)
    response = ask(client, example_request)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"] == "anthropic" and body["model"] == "claude-sonnet-5-5"
    assert body["method_version"] == "claude-sonnet-5-5/prompt-v1"
    assert body["usage"] == USAGE | {"cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    assert body["provider_request_id"] == "req_test_ok"

    sent = mock.requests[0]
    assert sent["model"] == "claude-sonnet-5-5"
    assert sent["max_tokens"] == BUDGET["max_output_tokens"]
    assert sent["output_config"]["effort"] == "low"
    assert sent["output_config"]["format"]["type"] == "json_schema"
    # Sampling parameters and forced tool choice are rejected by this model; no tools are offered.
    for absent in ("temperature", "top_p", "top_k", "tool_choice", "tools", "thinking"):
        assert absent not in sent
    assert mock.headers[0]["x-api-key"] == FAKE_ANTHROPIC_KEY


def test_request_carries_only_minimized_data_inside_data_tags(example_request):
    mock = MockAnthropic(message(json.dumps({"findings": golden_findings()})))
    client, _ = cloud_app(mock)
    ask(client, example_request)
    content = mock.requests[0]["messages"][0]["content"]
    assert content.startswith("<data>\n") and content.endswith("\n</data>")
    data = json.loads(content.removeprefix("<data>\n").removesuffix("\n</data>"))
    assert set(data) == {"as_of_month", "requirements", "evidence"}
    sent = json.dumps(data)
    for never in ("request_id", "budget", "company", "institution", "email", "provider"):
        assert never not in sent
    assert "untrusted data" in mock.requests[0]["system"]


@pytest.mark.parametrize(
    ("stop_reason", "code"),
    [
        ("refusal", "provider_refused"),
        ("max_tokens", "provider_output_truncated"),
        ("pause_turn", "provider_output_rejected"),
    ],
)
def test_unusable_stop_reasons_are_billed_failures_and_never_parsed(example_request, stop_reason, code):
    mock = MockAnthropic(message(json.dumps({"findings": golden_findings()}), stop_reason=stop_reason))
    client, _ = cloud_app(mock)
    error = ask(client, example_request).json()["error"]
    assert (error["code"], error["billed"]) == (code, "yes")
    assert error["usage"]["input_tokens"] == USAGE["input_tokens"]
    assert len(mock.requests) == 1


def _tamper(mutate):
    findings = golden_findings()
    mutate(findings)
    return json.dumps({"findings": findings})


@pytest.mark.parametrize(
    "text",
    [
        "not json",
        json.dumps({"wrong": []}),
        _tamper(lambda f: f[1]["citations"][0].update(evidence_id=ev("skill", 999))),  # not supplied
        _tamper(lambda f: f[1]["citations"][0].update(quote="SolidWorks expert")),  # not verbatim
        _tamper(lambda f: f[0].update(explanation="You have nine years of design experience.")),  # invented
        _tamper(lambda f: f.pop()),  # missing a requirement
        _tamper(lambda f: f[1].update(verdict="excellent")),  # not a verdict
        # Prompt-injection outcome: everything "supported" with no evidence.
        json.dumps({"findings": [{**x, "verdict": "supported", "citations": []} for x in golden_findings()]}),
    ],
)
def test_malformed_or_unsupported_output_is_rejected_and_billed(example_request, text):
    mock = MockAnthropic(message(text))
    client, _ = cloud_app(mock)
    response = ask(client, example_request)
    assert response.status_code == 502
    error = response.json()["error"]
    assert (error["code"], error["billed"]) == ("provider_output_rejected", "yes")
    assert error["usage"]["output_tokens"] == USAGE["output_tokens"]


def test_project_counted_as_employment_is_rejected(example_request):
    project = next(e for e in example_request["evidence"] if e["kind"] == "project")

    def as_employment(findings):
        findings[0].update(
            verdict="supported",
            citations=[{"evidence_id": project["id"], "quote": project["title"]}],
            caveats=[],
        )

    mock = MockAnthropic(message(_tamper(as_employment)))
    client, _ = cloud_app(mock)
    assert ask(client, example_request).json()["error"]["code"] == "provider_output_rejected"


def test_verdict_letter_case_is_normalized(example_request):
    findings = golden_findings()
    findings[1]["verdict"] = findings[1]["verdict"].upper()
    client, _ = cloud_app(MockAnthropic(message(json.dumps({"findings": findings}))))
    assert ask(client, example_request).status_code == 200


def test_rate_limit_with_retry_after_is_retried_once(example_request):
    sleeps: list[float] = []
    mock = MockAnthropic(
        api_error(429, "rate_limit_error", headers={"retry-after": "2"}),
        message(json.dumps({"findings": golden_findings()})),
    )
    client, _ = cloud_app(mock, sleeps=sleeps)
    assert ask(client, example_request).status_code == 200
    assert sleeps == [2.0] and len(mock.requests) == 2


@pytest.mark.parametrize(
    ("response", "code", "billed"),
    [
        (api_error(429, "rate_limit_error"), "provider_busy", "no"),  # no retry-after: not retried
        (
            api_error(429, "rate_limit_error", {"error_code": "enforced_spend_limit_reached"}),
            "provider_unavailable",
            "no",
        ),
        (
            api_error(400, "invalid_request_error"),
            "provider_request_rejected",
            "no",
        ),  # includes a Console spend limit
        (api_error(401, "authentication_error"), "provider_unavailable", "no"),
        (api_error(402, "billing_error"), "provider_unavailable", "no"),
        (api_error(403, "permission_error"), "provider_unavailable", "no"),
        (api_error(404, "not_found_error"), "provider_unavailable", "no"),
        (api_error(500, "api_error"), "provider_error", "unknown"),
        (api_error(504, "timeout_error"), "provider_error", "unknown"),
        (api_error(529, "overloaded_error"), "provider_error", "unknown"),
        (httpx2.ReadTimeout("fictional timeout"), "provider_timeout", "unknown"),
        (httpx2.ConnectError("fictional connection failure"), "provider_error", "unknown"),
    ],
)
def test_api_errors_map_to_billing_states_without_retrying(example_request, response, code, billed):
    mock = MockAnthropic(response)
    client, _ = cloud_app(mock)
    error = ask(client, example_request).json()["error"]
    assert (error["code"], error["billed"]) == (code, billed)
    assert len(mock.requests) == 1  # a possibly billed call is never repeated


def test_cloud_requests_need_a_budget_and_must_fit_it(example_request):
    mock = MockAnthropic(message(json.dumps({"findings": golden_findings()})))
    client, _ = cloud_app(mock)
    missing = post_match(client, {**example_request, "provider": "anthropic"})
    assert missing.json()["error"]["code"] == "budget_required"
    tiny = ask(client, example_request, budget={"max_input_tokens": 1_000, "max_output_tokens": 4_000})
    assert tiny.status_code == 413 and tiny.json()["error"] == tiny.json()["error"] | {
        "code": "over_budget",
        "billed": "no",
    }
    assert mock.requests == []


def test_output_is_capped_at_the_configured_maximum(example_request):
    mock = MockAnthropic(message(json.dumps({"findings": golden_findings()})))
    client, _ = cloud_app(mock, settings=cloud_settings(anthropic_max_output_tokens=2_000))
    ask(client, example_request)
    assert mock.requests[0]["max_tokens"] == 2_000


def test_circuit_breaker_stops_calls_after_repeated_failures(example_request):
    mock = MockAnthropic(api_error(529, "overloaded_error"))
    client, _ = cloud_app(mock)
    for _ in range(BREAKER_FAILURES):
        ask(client, example_request)
    calls = len(mock.requests)
    error = ask(client, example_request).json()["error"]
    assert (error["code"], error["billed"]) == ("provider_unavailable", "no")
    assert len(mock.requests) == calls


def test_logs_never_contain_the_key_or_profile_text(example_request, caplog):
    caplog.set_level(logging.DEBUG)
    mock = MockAnthropic(message(json.dumps({"findings": golden_findings()})))
    client, _ = cloud_app(mock)
    ask(client, example_request)
    ask(client, example_request | {"request_id": str(uuid.uuid4())})
    text = caplog.text
    assert FAKE_ANTHROPIC_KEY not in text
    for evidence in example_request["evidence"]:
        for value in evidence.values():
            if isinstance(value, str) and len(value) > 12 and ":" not in value:
                assert value not in text


def test_rules_stays_available_beside_the_cloud_provider(example_request):
    mock = MockAnthropic(message("unused"))
    client, _ = cloud_app(mock)
    response = post_match(client, {**example_request, "provider": "rules"})
    assert response.status_code == 200 and response.json()["provider"] == "rules"
    assert mock.requests == []
