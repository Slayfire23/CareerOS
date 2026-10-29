"""Shared fixtures. All data is fictional; no CareerOS user data is used in tests."""

import json
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.security import sign

SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz"
CONTRACTS = Path(__file__).resolve().parents[2] / "contracts" / "match"


def make_settings(**overrides) -> Settings:
    values = {"environment": "test", "service_secret": SECRET, "provider": "rules"} | overrides
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def ev(kind: str, n: int) -> str:
    return f"{kind}:00000000-0000-4000-8000-{n:012d}"


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def client(settings) -> TestClient:
    return TestClient(create_app(settings))


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
