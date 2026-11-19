"""The local bridge to Ollama: signed, returns only pointers, makes no decisions. Fictional data only."""

import json
import uuid

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.assisted import AssistedProvider
from app.providers.ollama import OllamaProvider
from app.providers.rules import RulesProvider
from app.schemas import SuggestRequest
from tests.conftest import SharedMemoryStore, ev, make_settings, signed_headers
from tests.test_ollama_provider import chat


class ScriptedOllama:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests: list[dict] = []

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/api/tags":
            return httpx2.Response(200, json={"models": [{"name": "qwen3:8b"}]})
        self.requests.append(json.loads(request.content))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        content = reply if isinstance(reply, str) else json.dumps(reply)
        return httpx2.Response(200, json=chat(content, prompt=900, output=60))

    def provider(self) -> AssistedProvider:
        s = make_settings(providers="assisted")
        client = httpx2.AsyncClient(
            base_url="http://127.0.0.1:11434", transport=httpx2.MockTransport(self.handler)
        )
        return AssistedProvider(s, ollama=OllamaProvider(s, client=client))

    def sent(self, call: int = 0) -> str:
        return self.requests[call]["messages"][1]["content"]


def payload(n: int = 1) -> dict:
    return {
        "request_id": str(uuid.uuid4()),
        "requirements": [{"index": i, "text": f"Tableau{i}"} for i in range(n)],
        "evidence": [
            {"id": ev("skill", 1), "kind": "skill", "name": "Helmsman"},
            {
                "id": ev("experience", 1),
                "kind": "experience",
                "job_title": "Analyst",
                "description": "Built dashboards.",
            },
            {
                "id": ev("project", 1),
                "kind": "project",
                "title": "Weather",
                "description": None,
                "contribution": None,
                "results": None,
                "skills": ["Python"],
            },
        ],
    }


def connection(index: int, evidence_id: str, quote: str) -> dict:
    return {
        "requirement_index": index,
        "kind": "possible_connection",
        "evidence_id": evidence_id,
        "quote": quote,
    }


async def suggest(mock: ScriptedOllama, n: int = 1):
    return await mock.provider().suggest(SuggestRequest.model_validate(payload(n)))


async def test_returns_pointers_with_real_ids_under_short_ids_only():
    mock = ScriptedOllama({"suggestions": [connection(0, "s1", "Helmsman")]})
    result = await suggest(mock)
    assert result.ai_assist == "used"
    assert result.pointers[0].evidence_id == ev("skill", 1)
    assert ev("skill", 1) not in mock.sent()  # the model sees short ids
    assert "verdict" not in json.dumps(mock.requests[0]["format"])
    assert "verdict" not in result.model_dump_json()


@pytest.mark.parametrize(
    "item",
    [
        {"requirement_index": 9, "kind": "possible_connection", "evidence_id": "s1", "quote": "x"},
        {"requirement_index": 0, "kind": "possible_connection", "evidence_id": "s99", "quote": "x"},
        {"requirement_index": 0, "kind": "verdict", "evidence_id": "s1", "quote": "x"},
        {"requirement_index": 0, "kind": "missing_from_profile"},
        "not an object",
    ],
)
async def test_malformed_pointers_are_dropped(item):
    assert (await suggest(ScriptedOllama({"suggestions": [item]}))).pointers == []


@pytest.mark.parametrize("failure", [httpx2.ConnectError("refused"), httpx2.ReadTimeout("slow")])
async def test_when_ollama_is_off_the_answer_is_unavailable_not_an_error(failure):
    result = await suggest(ScriptedOllama(failure))
    assert result.ai_assist == "unavailable" and result.pointers == [] and result.usage is None


async def test_an_unreadable_answer_gives_nothing():
    result = await suggest(ScriptedOllama("not json"))
    assert result.pointers == [] and result.ai_assist == "used"


async def test_many_requirements_are_batched_and_an_outage_stops_further_calls():
    mock = ScriptedOllama({"suggestions": []}, httpx2.ConnectError("refused"))
    result = await suggest(mock, n=20)
    assert len(mock.requests) == 2 and result.ai_assist == "unavailable"


def test_the_request_schema_has_no_room_for_dates_education_or_verdicts():
    for extra in ("as_of_month", "findings", "verdict"):
        with pytest.raises(ValueError):
            SuggestRequest.model_validate(payload() | {extra: "x"})
    role = payload()
    role["evidence"][1]["start_month"] = "2020-01"
    with pytest.raises(ValueError):
        SuggestRequest.model_validate(role)
    education = payload()
    education["evidence"].append({"id": ev("education", 1), "kind": "education", "qualification": "B.S."})
    with pytest.raises(ValueError):
        SuggestRequest.model_validate(education)


def client(mock: ScriptedOllama, providers="assisted,rules") -> TestClient:
    s = make_settings(providers=providers)
    built = {"rules": RulesProvider(), "assisted": mock.provider()}
    return TestClient(create_app(s, providers=built, replay_store=SharedMemoryStore()))


def post(c: TestClient, body: dict, **overrides):
    raw = json.dumps(body).encode()
    return c.post(
        "/v1/suggest", content=raw, headers=signed_headers(raw, request_id=body["request_id"], **overrides)
    )


def test_endpoint_requires_a_signature_and_rejects_a_replay():
    c = client(ScriptedOllama({"suggestions": []}))
    body = payload()
    assert c.post("/v1/suggest", json=body).status_code == 401
    assert post(c, body).status_code == 200
    assert post(c, body).status_code == 409


def test_endpoint_answers_when_ollama_is_off():
    response = post(client(ScriptedOllama(httpx2.ConnectError("refused"))), payload())
    assert response.status_code == 200
    assert response.json()["ai_assist"] == "unavailable"


def test_endpoint_is_off_unless_enabled():
    s = make_settings(providers="rules")
    c = TestClient(create_app(s, providers={"rules": RulesProvider()}, replay_store=SharedMemoryStore()))
    assert post(c, payload()).status_code == 400


def test_match_endpoint_never_runs_the_bridge(example_request):
    from tests.conftest import post_match

    c = client(ScriptedOllama({"suggestions": []}))
    assert post_match(c, {**example_request, "provider": "assisted"}).status_code == 400


@pytest.mark.parametrize("providers", ["hybrid", "ollama", "rules", "assisted,rules"])
def test_production_refuses_anything_that_could_decide_a_verdict(providers):
    with pytest.raises(ValueError, match="decides verdicts"):
        make_settings(
            environment="production", providers=providers, replay_store_url="redis://127.0.0.1:6379/0"
        )


def test_production_allows_the_bridge():
    s = make_settings(
        environment="production", providers="assisted", replay_store_url="redis://127.0.0.1:6379/0"
    )
    assert s.enabled_providers == {"assisted"}
