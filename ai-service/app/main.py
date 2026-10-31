"""FastAPI application factory.

Endpoints:
- GET  /health        liveness, no details
- GET  /health/ready  readiness: configuration loaded, providers built, replay store reachable
- POST /v1/match      signed requests only; each request names one enabled provider
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.errors import ServiceError, error_body, install_error_handlers
from app.matching.service import run_match
from app.providers.base import MatchProvider
from app.providers.factory import build_providers
from app.schemas import MatchRequest, MatchResponse
from app.security import (
    REQUEST_ID_HEADER,
    ReplayStore,
    ReplayStoreUnavailable,
    build_replay_store,
    verify_signed_request,
)

log = logging.getLogger("careeros")


def create_app(
    settings: Settings | None = None,
    provider: MatchProvider | None = None,
    providers: dict[str, MatchProvider] | None = None,
    replay_store: ReplayStore | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # The Anthropic SDK logs whole request bodies (profile text) at DEBUG, and its HTTP client logs
    # every URL at INFO. Keep both at WARNING whatever AI_LOG_LEVEL or ANTHROPIC_LOG say.
    for noisy in ("anthropic", "httpx2", "httpx", "httpcore", "httpcore2"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    # Built eagerly so a misconfigured provider fails at startup, not on the first request.
    # Tests may pass one provider to serve every enabled name.
    if providers is None:
        providers = (
            {name: provider for name in settings.enabled_providers} if provider else build_providers(settings)
        )
    store = replay_store or build_replay_store(settings)
    started_at = time.time()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        log.info(
            "starting: environment=%s providers=%s replay_store=%s",
            settings.environment,
            ",".join(sorted(providers)),
            "shared" if store.shared else "memory",
        )
        yield

    production = settings.environment == "production"
    app = FastAPI(
        title="CareerOS AI service",
        version="0.2.0",
        lifespan=lifespan,
        docs_url=None if production else "/docs",
        redoc_url=None,
        openapi_url=None if production else "/openapi.json",
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        # Logs request metadata only: never bodies, profile text, or job text.
        started = time.perf_counter()
        response = await call_next(request)
        log.info(
            "%s %s -> %s in %.0fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
            # Caller-supplied and possibly unauthenticated: bounded to the length of a UUID.
            request.headers.get(REQUEST_ID_HEADER, "-")[:36],
        )
        return response

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready() -> JSONResponse:
        try:
            await store.ping()
        except ReplayStoreUnavailable:
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return JSONResponse({"status": "ready", "providers": sorted(providers)})

    @app.post("/v1/match", response_model=MatchResponse)
    async def match(request: Request) -> MatchResponse:
        body = await verify_signed_request(request, settings, store, started_at)
        try:
            payload = MatchRequest.model_validate_json(body)
        except ValidationError as exc:
            fields = sorted({".".join(str(p) for p in err["loc"]) or "body" for err in exc.errors()})[:10]
            raise ServiceError(422, "invalid_request", f"Invalid fields: {', '.join(fields)}") from None
        if str(payload.request_id) != request.headers.get(REQUEST_ID_HEADER, "").lower():
            raise ServiceError(
                400, "request_id_mismatch", "Body request_id must match the signed request id."
            )
        chosen = providers.get(payload.provider)
        if chosen is None:
            raise ServiceError(400, "provider_not_enabled", "That analysis provider is not enabled.")
        return await run_match(payload, chosen, settings.provider_timeout_seconds)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", exc_info=exc)
        return JSONResponse(
            error_body("internal_error", "Unexpected error.", billed="unknown"), status_code=500
        )

    return app


def app_factory() -> FastAPI:
    """Entry point for uvicorn: ``uvicorn app.main:app_factory --factory``."""
    return create_app()
