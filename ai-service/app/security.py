"""Signed internal requests from the Next.js server.

Next.js signs every request with a shared secret it holds server-side only:

    canonical = f"v1:{timestamp}:{request_id}:{sha256_hex(body)}"
    X-CareerOS-Timestamp: <unix seconds>
    X-CareerOS-Request-Id: <uuid4, unique per request>
    X-CareerOS-Signature: v1=<hex HMAC-SHA256(secret, canonical)>

Checks run cheapest-first: body size, header format, timestamp window (expiry), signature
(constant time), then replay. A request id is claimed only after its signature verifies, so
unauthenticated traffic cannot fill the replay store.

Replay protection uses a shared store (Redis-compatible, ``SET NX EX``) so a request id is
accepted once across every process and restart. If the store cannot be reached, requests are
refused (fail closed) and no provider is called. The in-memory store is for local development
with the deterministic provider only; it also refuses requests signed before the process started,
because its memory does not survive a restart.
"""

import asyncio
import hashlib
import hmac
import threading
import time
from typing import Protocol
from uuid import UUID

from fastapi import Request

from app.config import Settings
from app.errors import ServiceError

TIMESTAMP_HEADER = "x-careeros-timestamp"
REQUEST_ID_HEADER = "x-careeros-request-id"
SIGNATURE_HEADER = "x-careeros-signature"

_UNAUTHORIZED = ServiceError(401, "unauthorized", "Request signature is missing, invalid, or expired.")
_STORE_DOWN = ServiceError(
    503, "replay_store_unavailable", "The service cannot verify requests right now. Try again shortly."
)


def canonical_string(timestamp: str, request_id: str, body: bytes) -> str:
    return f"v1:{timestamp}:{request_id}:{hashlib.sha256(body).hexdigest()}"


def sign(secret: str, timestamp: str, request_id: str, body: bytes) -> str:
    digest = hmac.new(secret.encode(), canonical_string(timestamp, request_id, body).encode(), hashlib.sha256)
    return f"v1={digest.hexdigest()}"


class ReplayStoreUnavailable(Exception):
    """The replay store could not be reached or did not answer in time."""


class ReplayStore(Protocol):
    shared: bool  # True when the store survives restarts and is shared between processes

    async def claim(self, request_id: str, ttl_seconds: int) -> bool:
        """Record the id. Return False if it was already used; raise ReplayStoreUnavailable on failure."""
        ...

    async def ping(self) -> None:
        """Raise ReplayStoreUnavailable if the store cannot be reached."""
        ...


class MemoryReplayStore:
    """Per-process store for local development and tests. Not shared, not durable."""

    shared = False

    def __init__(self, max_entries: int = 50_000, clock=time.monotonic) -> None:
        self._max, self._clock = max_entries, clock
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    async def claim(self, request_id: str, ttl_seconds: int) -> bool:
        now = self._clock()
        with self._lock:
            if len(self._seen) >= self._max:
                self._seen = {k: t for k, t in self._seen.items() if now - t < ttl_seconds}
                if len(self._seen) >= self._max:
                    raise ServiceError(503, "busy", "Too many recent requests. Try again shortly.")
            seen_at = self._seen.get(request_id)
            if seen_at is not None and now - seen_at < ttl_seconds:
                return False
            self._seen[request_id] = now
            return True

    async def ping(self) -> None:
        return None


class RedisReplayStore:
    """Shared store on a Redis-compatible server (Redis, Valkey, Upstash). Fails closed."""

    shared = True

    def __init__(self, url: str, timeout_seconds: float = 0.5) -> None:
        from redis.asyncio import Redis  # imported lazily so the rules-only service needs no store

        self._timeout = timeout_seconds
        self._client = Redis.from_url(
            url,
            socket_timeout=timeout_seconds,
            socket_connect_timeout=timeout_seconds,
            retry_on_timeout=False,
        )

    async def claim(self, request_id: str, ttl_seconds: int) -> bool:
        try:
            created = await asyncio.wait_for(
                self._client.set(f"careeros:replay:{request_id}", "1", nx=True, ex=ttl_seconds),
                timeout=self._timeout,
            )
        except Exception as exc:  # any client, network, or timeout error means "cannot verify"
            raise ReplayStoreUnavailable(type(exc).__name__) from None
        return bool(created)

    async def ping(self) -> None:
        try:
            await asyncio.wait_for(self._client.ping(), timeout=self._timeout)
        except Exception as exc:
            raise ReplayStoreUnavailable(type(exc).__name__) from None

    async def close(self) -> None:
        await self._client.aclose()


def build_replay_store(settings: Settings) -> ReplayStore:
    if settings.replay_store_url is not None:
        return RedisReplayStore(settings.replay_store_url.get_secret_value())
    return MemoryReplayStore()


async def verify_signed_request(
    request: Request,
    settings: Settings,
    store: ReplayStore,
    started_at: float = 0.0,
    now: float | None = None,
) -> bytes:
    """Return the raw body if the request is authentic, fresh, and not a replay."""
    body = await read_limited_body(request, settings.max_body_bytes)
    timestamp = request.headers.get(TIMESTAMP_HEADER, "")
    request_id = request.headers.get(REQUEST_ID_HEADER, "")
    signature = request.headers.get(SIGNATURE_HEADER, "")

    if not timestamp.isdigit() or not signature.startswith("v1="):
        raise _UNAUTHORIZED
    # Must be a canonical, lowercase UUIDv4. (UUID(value, version=4) would silently rewrite the
    # version bits instead of checking them, so the version is checked explicitly.)
    try:
        parsed = UUID(request_id)
    except ValueError:
        raise _UNAUTHORIZED from None
    if parsed.version != 4 or str(parsed) != request_id:
        raise _UNAUTHORIZED

    current = time.time() if now is None else now
    if abs(current - int(timestamp)) > settings.signature_max_age_seconds:
        raise _UNAUTHORIZED
    # An in-memory store forgets ids on restart, so it cannot vouch for requests signed earlier.
    if not store.shared and int(timestamp) < int(started_at):
        raise _UNAUTHORIZED

    expected = sign(settings.service_secret.get_secret_value(), timestamp, request_id, body)
    if not hmac.compare_digest(expected.encode(), signature.encode()):
        raise _UNAUTHORIZED

    try:
        # Remember ids for twice the signature window, so an id cannot be reused while valid.
        claimed = await store.claim(request_id, 2 * settings.signature_max_age_seconds)
    except ReplayStoreUnavailable:
        raise _STORE_DOWN from None
    if not claimed:
        raise ServiceError(409, "replayed", "This request id has already been used.")
    return body


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
