"""Ollama provider against a mocked Ollama API. No model, no network; fictional data only."""

import asyncio
import json
import logging

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.ollama import OllamaProvider
from app.providers.rules import RulesProvider
from tests.conftest import CONTRACTS, SharedMemoryStore, ev, make_settings, post_match


def settings(**overrides):
    return make_settings(**({"providers": "rules,ollama"} | overrides))


def golden_findings() -> list[dict]:
    return json.loads((CONTRACTS / "response.rules.example.json").read_text(encoding="utf-8"))["findings"]


def chat(content: str, done_reason: str = "stop", prompt: int = 1800, output: int = 400) -> dict:
    return {
        "model": "qwen3:8b",
        "message": {"role": "assistant", "content": content},
        "done": True,
        "done_reason": done_reason,
        "prompt_eval_count": prompt,
        "eval_count": output,
    }


class MockOllama:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[dict] = []

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/api/tags":
            return httpx2.Response(200, json={"models": [{"name": "qwen3:8b"}]})
        self.requests.append(json.loads(request.content))
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        if isinstance(item, httpx2.Response):
            return item
        return httpx2.Response(200, json=item)

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(
            base_url="http://127.0.0.1:11434", transport=httpx2.MockTransport(self.handler)
        )


def app_with(mock: MockOllama, **overrides):
    s = settings(**overrides)
    provider = OllamaProvider(s, client=mock.client())
    app = create_app(
        s, providers={"rules": RulesProvider(), "ollama": provider}, replay_store=SharedMemoryStore()
    )
    return TestClient(app), provider


def ask(client, example_request):
    return post_match(client, {**example_request, "provider": "ollama"})


def test_successful_local_analysis_is_validated_and_free(example_request):
    mock = MockOllama(chat(json.dumps({"findings": golden_findings()})))
    client, _ = app_with(mock)
    response = ask(client, example_request)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["provider"], body["model"], body["method_version"]) == (
        "ollama",
        "qwen3:8b",
        "ollama/qwen3:8b/prompt-v3",
    )
    assert body["usage"]["input_tokens"] == 1800

    sent = mock.requests[0]
    assert sent["model"] == "qwen3:8b" and sent["stream"] is False and sent["think"] is False
    assert sent["format"]["required"] == ["findings"]
    assert sent["options"] == {"temperature": 0, "seed": 42, "num_ctx": 8_192, "num_predict": 3_072}
    assert (
        sent["messages"][0]["role"] == "system" and "Respond only with JSON" in sent["messages"][0]["content"]
    )
    assert sent["messages"][1]["content"].startswith("<data>\n")


def test_overreaching_output_is_rejected_strictly(example_request):
    findings = golden_findings()
    findings[1]["citations"][0]["quote"] = "SolidWorks expert"  # not verbatim
    client, _ = app_with(MockOllama(chat(json.dumps({"findings": findings}))))
    error = ask(client, example_request).json()["error"]
    assert (error["code"], error["billed"]) == ("provider_output_rejected", "no")


@pytest.mark.parametrize(
    ("response", "status", "code"),
    [
        (chat("not json"), 502, "provider_output_rejected"),
        (chat(json.dumps({"wrong": []})), 502, "provider_output_rejected"),
        (
            chat(json.dumps({"findings": golden_findings()}), done_reason="length"),
            502,
            "provider_output_truncated",
        ),
        (
            chat(json.dumps({"findings": golden_findings()}), prompt=15_000, output=1_384),
            502,
            "provider_output_truncated",
        ),
        (httpx2.Response(404, json={"error": "model not found"}), 503, "provider_unavailable"),
        (httpx2.Response(500, json={"error": "boom"}), 502, "provider_error"),
        (httpx2.ConnectError("refused"), 503, "provider_unavailable"),
        (httpx2.ReadTimeout("slow"), 504, "provider_timeout"),
    ],
)
def test_failures_map_to_codes_and_are_never_billed(example_request, response, status, code):
    client, _ = app_with(MockOllama(response))
    result = ask(client, example_request)
    assert result.status_code == status
    assert (result.json()["error"]["code"], result.json()["error"]["billed"]) == (code, "no")


def test_requests_that_might_not_fit_the_context_window_are_refused(example_request):
    mock = MockOllama(chat(json.dumps({"findings": golden_findings()})))
    client, _ = app_with(mock, ollama_num_ctx=4_096, ollama_num_predict=4_000)
    result = ask(client, example_request)
    assert result.status_code == 413 and result.json()["error"]["code"] == "over_budget"
    assert mock.requests == []


async def test_one_generation_at_a_time_and_others_get_busy(example_request):
    from app.schemas import MatchRequest

    release = asyncio.Event()

    async def slow_handler(request: httpx2.Request) -> httpx2.Response:
        await release.wait()
        return httpx2.Response(200, json=chat(json.dumps({"findings": golden_findings()})))

    s = settings(ollama_queue_timeout_seconds=0.2)
    client = httpx2.AsyncClient(
        base_url="http://127.0.0.1:11434", transport=httpx2.MockTransport(slow_handler)
    )
    provider = OllamaProvider(s, client=client)
    request = MatchRequest.model_validate(example_request)
    first = asyncio.create_task(provider.match(request))
    await asyncio.sleep(0.05)
    with pytest.raises(Exception, match="busy"):
        await provider.match(request)
    release.set()
    assert len((await first).findings) == len(request.requirements)


def test_readiness_reports_ollama_status_without_failing_the_service():
    client, _ = app_with(MockOllama(chat("{}")))
    assert client.get("/health/ready").json() == {
        "status": "ready",
        "providers": ["ollama", "rules"],
        "provider_status": {"ollama": "ok"},
    }

    down = OllamaProvider(
        settings(),
        client=httpx2.AsyncClient(
            base_url="http://127.0.0.1:11434",
            transport=httpx2.MockTransport(lambda r: (_ for _ in ()).throw(httpx2.ConnectError("no"))),
        ),
    )
    app = create_app(
        settings(), providers={"rules": RulesProvider(), "ollama": down}, replay_store=SharedMemoryStore()
    )
    assert TestClient(app).get("/health/ready").json()["provider_status"] == {"ollama": "unreachable"}


def test_rules_still_work_when_ollama_is_down(example_request):
    client, _ = app_with(MockOllama(httpx2.ConnectError("refused")))
    assert ask(client, example_request).json()["error"]["code"] == "provider_unavailable"
    response = post_match(client, {**example_request, "provider": "rules"})
    assert response.status_code == 200 and response.json()["provider"] == "rules"


def test_logs_hold_no_profile_text(example_request, caplog):
    caplog.set_level(logging.DEBUG)
    client, _ = app_with(MockOllama(chat(json.dumps({"findings": golden_findings()}))))
    ask(client, example_request)
    for evidence in example_request["evidence"]:
        for value in evidence.values():
            if isinstance(value, str) and len(value) > 12 and ":" not in value:
                assert value not in caplog.text
    assert "ollama ok model=qwen3:8b" in caplog.text


def test_evidence_ids_in_the_fixture_are_the_expected_shape():
    assert ev("skill", 1) == "skill:00000000-0000-4000-8000-000000000001"


def test_supported_backed_by_unrelated_evidence_is_rejected(example_request):
    """Regression: an injected instruction made qwen3:8b call an unknown skill supported, citing an
    unrelated skill verbatim. Language-model output must cite evidence that mentions the requirement."""
    findings = golden_findings()
    findings[4] = {  # "Knowledge of FEA tools such as ANSYS": nothing in the profile mentions it
        "requirement_index": 4,
        "verdict": "supported",
        "explanation": "You list this skill.",
        "citations": [{"evidence_id": ev("skill", 1), "quote": "SolidWorks"}],
        "caveats": [],
    }
    findings_text = json.dumps({"findings": findings})
    client, _ = app_with(MockOllama(chat(findings_text)))
    error = ask(client, example_request).json()["error"]
    assert error["code"] == "provider_output_rejected"


def test_the_relevance_rule_accepts_synonym_prefixes_and_degree_abbreviations():
    from app.matching.evidence import shares_term

    assert shares_term("Experience with PostgreSQL databases", "Postgres")
    assert shares_term("Bachelor's degree in Computer Science", "B.S.")
    assert shares_term("Proficiency in C", "C")
    assert not shares_term("Kubernetes administration", "Excel")
    assert not shares_term("Strong skills required", "skills")  # generic words never count


async def test_the_rules_engine_is_not_subject_to_the_relevance_rule(example_request):
    """Lenient mode (the deterministic engine) behaves exactly as before."""
    from app.matching.validate import validate_findings
    from app.schemas import MatchRequest

    request = MatchRequest.model_validate(example_request)
    findings = await RulesProvider().match(request)
    assert validate_findings(request, findings) == sorted(findings, key=lambda f: f.requirement_index)
