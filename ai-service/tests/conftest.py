"""Shared fixtures. All data is fictional; no CareerOS user data is used in tests."""

import json
import socket
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.security import MemoryReplayStore, sign

SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz"
# Fictional, never valid. Dots keep it from looking like a real key to the secret scanner.
FAKE_ANTHROPIC_KEY = "sk-ant-test.not.a.real.key.000000000000000000"
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


@pytest.fixture(autouse=True)
def _no_real_credentials_or_network(monkeypatch):
    """Tests never hold a real Anthropic key and never reach a non-local host."""
    for name in ("ANTHROPIC_API_KEY", "AI_ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "AI_PROVIDERS"):
        monkeypatch.delenv(name, raising=False)
    real_getaddrinfo, real_connect = socket.getaddrinfo, socket.socket.connect

    def guarded_getaddrinfo(host, *args, **kwargs):
        if host not in LOCAL_HOSTS:
            raise RuntimeError(f"Tests must not resolve non-local hosts ({host})")
        return real_getaddrinfo(host, *args, **kwargs)

    def guarded_connect(sock, address):
        if isinstance(address, tuple) and address[0] not in LOCAL_HOSTS:
            raise RuntimeError("Tests must not connect to non-local hosts")
        return real_connect(sock, address)

    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)
    monkeypatch.setattr(socket.socket, "connect", guarded_connect)


CONTRACTS = Path(__file__).resolve().parents[2] / "contracts" / "match"


def make_settings(**overrides) -> Settings:
    values = {"environment": "test", "service_secret": SECRET, "providers": "rules"} | overrides
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def ev(kind: str, n: int) -> str:
    return f"{kind}:00000000-0000-4000-8000-{n:012d}"


@pytest.fixture
def settings() -> Settings:
    return make_settings()


class SharedMemoryStore(MemoryReplayStore):
    """Behaves like the shared store (no restart guard) without needing a server."""

    shared = True


@pytest.fixture
def client(settings) -> TestClient:
    return TestClient(create_app(settings, replay_store=SharedMemoryStore()))


def signed_headers(
    body: bytes, request_id: str | None = None, timestamp: int | None = None, secret: str = SECRET
) -> dict:
    request_id = request_id or str(uuid.uuid4())
    timestamp_text = str(int(time.time()) if timestamp is None else timestamp)
    return {
        "content-type": "application/json",
        "x-careeros-timestamp": timestamp_text,
        "x-careeros-request-id": request_id,
        "x-careeros-signature": sign(secret, timestamp_text, request_id, body),
    }


def post_match(client: TestClient, payload: dict, keep_body_id: bool = False, **header_overrides):
    """Sign and send a match request. The body request_id follows the signed id unless keep_body_id."""
    request_id = header_overrides.pop("request_id", None) or str(uuid.uuid4())
    if not keep_body_id:
        payload = {**payload, "request_id": request_id}
    body = json.dumps(payload).encode()
    headers = signed_headers(body, request_id=request_id, **header_overrides)
    return client.post("/v1/match", content=body, headers=headers)


@pytest.fixture
def example_request() -> dict:
    return json.loads((CONTRACTS / "request.example.json").read_text(encoding="utf-8"))
