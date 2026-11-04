"""Shadow retrieval: signed, returns only ids and scores, makes no decisions, off in production. Fictional data."""

import json
import uuid

import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.providers.embedding import EmbeddingProvider
from app.providers.rules import RulesProvider
from app.schemas import RetrieveRequest
from tests.conftest import SharedMemoryStore, make_settings, signed_headers

VECTORS = {"Bookkeeping": [1.0, 0.0], "Kept the ledgers": [0.8, 0.6], "Mowed lawns": [0.0, 1.0]}


def provider(handler=None) -> tuple[EmbeddingProvider, list[dict]]:
    seen: list[dict] = []

    def default(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        seen.append(body)
        return httpx2.Response(200, json={"embeddings": [VECTORS[t] for t in body["input"]]})

    s = make_settings(providers="embedding")
    client = httpx2.AsyncClient(
        base_url="http://127.0.0.1:11434", transport=httpx2.MockTransport(handler or default)
    )
    return EmbeddingProvider(s, client=client), seen


def payload() -> dict:
    return {
        "request_id": str(uuid.uuid4()),
        "queries": [{"id": "q0", "text": "Bookkeeping"}],
        "passages": [{"id": "p0", "text": "Mowed lawns"}, {"id": "p1", "text": "Kept the ledgers"}],
        "top_k": 2,
    }


async def test_scores_rank_passages_and_contain_only_ids():
    embedding, seen = provider()
    reply = await embedding.retrieve(RetrieveRequest.model_validate(payload()))
    assert reply.status == "used"
    assert [(s.query_id, s.passage_id, s.similarity) for s in reply.scores] == [
        ("q0", "p1", 0.8),
        ("q0", "p0", 0.0),
    ]
    assert seen[0]["model"] == "bge-m3"
    assert "Kept the ledgers" not in reply.model_dump_json()


@pytest.mark.parametrize("failure", [httpx2.ConnectError("down"), httpx2.ReadTimeout("slow")])
async def test_unavailable_when_ollama_is_down_or_slow(failure):
    def handler(_: httpx2.Request) -> httpx2.Response:
        raise failure

    embedding, _ = provider(handler)
    reply = await embedding.retrieve(RetrieveRequest.model_validate(payload()))
    assert (reply.status, reply.scores) == ("unavailable", [])


async def test_wrong_number_of_vectors_is_unavailable():
    embedding, _ = provider(lambda _r: httpx2.Response(200, json={"embeddings": [[1.0, 0.0]]}))
    reply = await embedding.retrieve(RetrieveRequest.model_validate(payload()))
    assert reply.status == "unavailable"


@pytest.mark.parametrize(
    "change",
    [
        {"evidence": []},
        {"verdict": "supported"},
        {"start_month": "2020-01"},
        {"top_k": 99},
        {"queries": []},
        {"passages": [{"id": "p0", "text": "x" * 1001}]},
        {"passages": [{"id": "p0", "text": "ok text", "kind": "education"}]},
    ],
)
def test_the_request_can_carry_nothing_else(change):
    with pytest.raises(ValidationError):
        RetrieveRequest.model_validate({**payload(), **change})


def client_with(providers: dict) -> tuple[TestClient, object]:
    s = make_settings(providers=",".join(providers))
    return TestClient(create_app(s, providers=providers, replay_store=SharedMemoryStore())), s


def test_endpoint_needs_a_valid_signature():
    embedding, _ = provider()
    client, _s = client_with({"embedding": embedding})
    assert client.post("/v1/retrieve", json=payload()).status_code == 401


def test_endpoint_is_off_unless_enabled():
    client, s = client_with({"rules": RulesProvider()})
    body = payload()
    raw = json.dumps(body).encode()
    reply = client.post(
        "/v1/retrieve", content=raw, headers=signed_headers(raw, request_id=body["request_id"])
    )
    assert reply.status_code == 400
    assert reply.json()["error"]["code"] == "provider_not_enabled"


def test_refused_in_production():
    with pytest.raises(ValueError):
        make_settings(providers="embedding", environment="production")


def test_a_different_model_is_refused():
    with pytest.raises(ValueError):
        make_settings(providers="embedding", embedding_model="some-cloud-model")
