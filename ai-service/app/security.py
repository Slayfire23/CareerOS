"""Signed internal requests from the Next.js server.

Next.js signs every request with a shared secret it holds server-side only:

    canonical = f"v1:{timestamp}:{request_id}:{sha256_hex(body)}"
    X-CareerOS-Timestamp: <unix seconds>
    X-CareerOS-Request-Id: <uuid4, unique per request>
    X-CareerOS-Signature: v1=<hex HMAC-SHA256(secret, canonical)>

Checks run cheapest-first: body size, header format, timestamp window (expiry), signature
(constant time), then replay. A request id is remembered only after its signature verifies, so
unauthenticated traffic cannot fill the replay cache.

The replay cache is per process. Run one worker per instance, or move the cache to shared storage
before scaling out horizontally.
"""

import hashlib
import hmac
import threading
import time
from uuid import UUID

from fastapi import Request

from app.config import Settings
from app.errors import ServiceError

TIMESTAMP_HEADER = "x-careeros-timestamp"
REQUEST_ID_HEADER = "x-careeros-request-id"
SIGNATURE_HEADER = "x-careeros-signature"

_UNAUTHORIZED = ServiceError(401, "unauthorized", "Request signature is missing, invalid, or expired.")


def canonical_string(timestamp: str, request_id: str, body: bytes) -> str:
    return f"v1:{timestamp}:{request_id}:{hashlib.sha256(body).hexdigest()}"


def sign(secret: str, timestamp: str, request_id: str, body: bytes) -> str:
    digest = hmac.new(secret.encode(), canonical_string(timestamp, request_id, body).encode(), hashlib.sha256)
    return f"v1={digest.hexdigest()}"


class ReplayCache:
    """Remembers request ids until they could no longer pass the timestamp check."""

    def __init__(self, ttl_seconds: int, max_entries: int = 50_000) -> None:
        self._ttl, self._max = ttl_seconds, max_entries
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def check_and_remember(self, request_id: str, now: float) -> bool:
        """Return False if the id was already used within the TTL; otherwise record it."""
        with self._lock:
            if len(self._seen) >= self._max:
                self._seen = {k: t for k, t in self._seen.items() if now - t < self._ttl}
                if len(self._seen) >= self._max:
                    raise ServiceError(503, "busy", "Too many recent requests. Try again shortly.")
            seen_at = self._seen.get(request_id)
            if seen_at is not None and now - seen_at < self._ttl:
                return False
            self._seen[request_id] = now
            return True


async def read_limited_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > limit):
        raise ServiceError(413, "too_large", "Request body is too large.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise ServiceError(413, "too_large", "Request body is too large.")
    return bytes(body)


async def verify_signed_request(
    request: Request, settings: Settings, cache: ReplayCache, now: float | None = None
) -> bytes:
    """Return the raw body if the request is authentic, fresh, and not a replay."""
    body = await read_limited_body(request, settings.max_body_bytes)
    timestamp = request.headers.get(TIMESTAMP_HEADER, "")
    request_id = request.headers.get(REQUEST_ID_HEADER, "")
    signature = request.headers.get(SIGNATURE_HEADER, "")

    if not timestamp.isdigit() or not signature.startswith("v1="):
        raise _UNAUTHORIZED
    try:
        UUID(request_id, version=4)
    except ValueError:
        raise _UNAUTHORIZED from None

    current = time.time() if now is None else now
    if abs(current - int(timestamp)) > settings.signature_max_age_seconds:
        raise _UNAUTHORIZED

    expected = sign(settings.service_secret.get_secret_value(), timestamp, request_id, body)
    if not hmac.compare_digest(expected.encode(), signature.encode()):
        raise _UNAUTHORIZED

    if not cache.check_and_remember(request_id, current):
        raise ServiceError(409, "replayed", "This request id has already been used.")
    return body
