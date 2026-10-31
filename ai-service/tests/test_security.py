import json
import time
import uuid

import pytest

from app.errors import ServiceError
from app.security import ReplayCache
from tests.conftest import post_match, signed_headers


def _body(example_request: dict, request_id: str) -> bytes:
    return json.dumps({**example_request, "request_id": request_id}).encode()


def test_valid_signed_request_is_accepted(client, example_request):
    response = post_match(client, example_request)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("missing", ["x-careeros-timestamp", "x-careeros-request-id", "x-careeros-signature"])
def test_missing_signature_headers_are_rejected(client, example_request, missing):
    request_id = str(uuid.uuid4())
    body = _body(example_request, request_id)
    headers = signed_headers(body, request_id=request_id)
    del headers[missing]
    response = client.post("/v1/match", content=body, headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_wrong_secret_is_rejected(client, example_request):
    response = post_match(client, example_request, secret="another-secret-0123456789-abcdefghijklmnop")
    assert response.status_code == 401


def test_tampered_body_is_rejected(client, example_request):
    request_id = str(uuid.uuid4())
    body = _body(example_request, request_id)
    headers = signed_headers(body, request_id=request_id)
    tampered = body.replace(b"SolidWorks", b"CATIA_____")
    assert client.post("/v1/match", content=tampered, headers=headers).status_code == 401


@pytest.mark.parametrize("offset", [-301, 301])
def test_expired_or_future_timestamps_are_rejected(client, example_request, offset):
    response = post_match(client, example_request, timestamp=int(time.time()) + offset)
    assert response.status_code == 401


def test_timestamp_inside_window_is_accepted(client, example_request):
    assert post_match(client, example_request, timestamp=int(time.time()) - 200).status_code == 200


def test_replayed_request_is_rejected(client, example_request):
    request_id = str(uuid.uuid4())
    body = _body(example_request, request_id)
    headers = signed_headers(body, request_id=request_id)
    assert client.post("/v1/match", content=body, headers=headers).status_code == 200
    replay = client.post("/v1/match", content=body, headers=headers)
    assert replay.status_code == 409
    assert replay.json()["error"]["code"] == "replayed"


def test_unsigned_requests_cannot_burn_a_request_id(client, example_request):
    request_id = str(uuid.uuid4())
    body = _body(example_request, request_id)
    forged = signed_headers(body, request_id=request_id, secret="attacker-secret-0123456789-abcdefghijkl")
    assert client.post("/v1/match", content=body, headers=forged).status_code == 401
    genuine = signed_headers(body, request_id=request_id)
    assert client.post("/v1/match", content=body, headers=genuine).status_code == 200


def test_request_id_must_be_uuid4(client, example_request):
    request_id = "not-a-uuid"
    body = json.dumps(example_request).encode()
    headers = signed_headers(body, request_id=request_id)
    assert client.post("/v1/match", content=body, headers=headers).status_code == 401


def test_body_request_id_must_match_signed_id(client, example_request):
    response = post_match(client, {**example_request, "request_id": str(uuid.uuid4())}, keep_body_id=True)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "request_id_mismatch"


def test_oversized_body_is_rejected_before_parsing(client):
    body = b"{" + b" " * 300_000 + b"}"
    response = client.post("/v1/match", content=body, headers=signed_headers(body))
    assert response.status_code == 413


def test_replay_cache_forgets_after_ttl():
    cache = ReplayCache(ttl_seconds=600)
    assert cache.check_and_remember("a", now=1000)
    assert not cache.check_and_remember("a", now=1599)
    assert cache.check_and_remember("a", now=1601)


def test_replay_cache_refuses_when_full_of_fresh_entries():
    cache = ReplayCache(ttl_seconds=600, max_entries=2)
    cache.check_and_remember("a", now=1000)
    cache.check_and_remember("b", now=1000)
    with pytest.raises(ServiceError):
        cache.check_and_remember("c", now=1001)
    assert cache.check_and_remember("c", now=1700)  # old entries are pruned once expired


@pytest.mark.parametrize(
    "request_id",
    [
        "11111111-1111-1111-8111-111111111111",  # version 1, not 4
        "11111111-1111-4111-8111-11111111111A".upper(),  # not canonical lowercase
        "{11111111-1111-4111-8111-111111111111}",  # braces
        "11111111111141118111111111111111",  # no hyphens
    ],
)
def test_request_id_must_be_canonical_uuid4(client, example_request, request_id):
    body = json.dumps({**example_request, "request_id": request_id}).encode()
    headers = signed_headers(body, request_id=request_id)
    assert client.post("/v1/match", content=body, headers=headers).status_code == 401
