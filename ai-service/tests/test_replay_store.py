"""Replay protection: shared across processes and restarts, and fail-closed. Fictional data only.

Tests marked ``redis`` use a real Redis-compatible server named by ``AI_TEST_REPLAY_STORE_URL``
(a local Valkey container in development and CI) and are skipped when it is not set.
"""

import os
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.security import MemoryReplayStore, RedisReplayStore, ReplayStoreUnavailable
from tests.conftest import SharedMemoryStore, make_settings, post_match

REDIS_URL = os.environ.get("AI_TEST_REPLAY_STORE_URL")
redis_only = pytest.mark.skipif(not REDIS_URL, reason="AI_TEST_REPLAY_STORE_URL is not set")


class DownStore:
    shared = True

    async def claim(self, request_id: str, ttl_seconds: int) -> bool:
        raise ReplayStoreUnavailable("ConnectionError")

    async def ping(self) -> None:
        raise ReplayStoreUnavailable("ConnectionError")


class SpyProvider:
    name, model, method_version, local = "rules", None, "spy-v1", True

    def __init__(self) -> None:
        self.calls = 0

    async def match(self, request):
        self.calls += 1
        return []


def test_store_outage_fails_closed_before_any_provider_call(example_request):
    spy = SpyProvider()
    client = TestClient(create_app(make_settings(), provider=spy, replay_store=DownStore()))
    response = post_match(client, example_request)
    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "replay_store_unavailable",
        "message": "The service cannot verify requests right now. Try again shortly.",
        "billed": "no",
        "usage": None,
        "provider_request_id": None,
    }
    assert spy.calls == 0
    assert client.get("/health/ready").status_code == 503


def test_shared_store_refuses_a_replay_sent_to_another_instance(example_request):
    store = SharedMemoryStore()
    first = TestClient(create_app(make_settings(), replay_store=store))
    second = TestClient(create_app(make_settings(), replay_store=store))  # another process or a restart
    request_id = str(uuid.uuid4())
    assert post_match(first, example_request, request_id=request_id).status_code == 200
    replay = post_match(second, example_request, request_id=request_id)
    assert replay.status_code == 409 and replay.json()["error"]["code"] == "replayed"


def test_memory_store_refuses_requests_signed_before_the_process_started(example_request):
    client = TestClient(create_app(make_settings(), replay_store=MemoryReplayStore()))
    old = post_match(client, example_request, timestamp=int(time.time()) - 30)
    assert old.status_code == 401
    assert post_match(client, example_request).status_code == 200


def test_unknown_provider_is_refused_without_cost(example_request):
    client = TestClient(create_app(make_settings(), replay_store=SharedMemoryStore()))
    response = post_match(client, {**example_request, "provider": "anthropic"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "provider_not_enabled"
    assert response.json()["error"]["billed"] == "no"


@redis_only
async def test_redis_store_claims_once_across_clients_with_expiry():
    request_id = str(uuid.uuid4())
    a, b = RedisReplayStore(REDIS_URL), RedisReplayStore(REDIS_URL)  # two processes
    try:
        assert await a.claim(request_id, 600)
        assert not await b.claim(request_id, 600)
        assert not await a.claim(request_id, 600)
        ttl = await a._client.ttl(f"careeros:replay:{request_id}")
        assert 0 < ttl <= 600
        await a.ping()
    finally:
        await a.close()
        await b.close()


@redis_only
async def test_restart_does_not_reopen_the_replay_window(example_request):
    request_id = str(uuid.uuid4())
    before = TestClient(create_app(make_settings(replay_store_url=REDIS_URL)))
    assert post_match(before, example_request, request_id=request_id).status_code == 200
    after_restart = TestClient(create_app(make_settings(replay_store_url=REDIS_URL)))
    assert post_match(after_restart, example_request, request_id=request_id).status_code == 409


async def test_unreachable_redis_raises_quickly():
    store = RedisReplayStore("redis://127.0.0.1:1/0", timeout_seconds=0.3)  # nothing listens on port 1
    started = time.perf_counter()
    with pytest.raises(ReplayStoreUnavailable):
        await store.claim(str(uuid.uuid4()), 600)
    assert time.perf_counter() - started < 2
    await store.close()
