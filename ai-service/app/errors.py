"""Error type and JSON shape shared by every endpoint. Messages never include user content.

Every error says whether an AI provider may have charged for the request (``billed``):
``"no"`` (the provider was not called, or rejected the request before processing it), ``"yes"``
(the provider produced output, with ``usage`` when it is known), or ``"unknown"`` (a timeout or
a failure after the request may have been processed). Next.js uses this to keep its cost ledger
honest: unknown charges stay reserved until they are reconciled.
"""

from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

Billed = Literal["no", "yes", "unknown"]


class ServiceError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        billed: Billed = "no",
        usage: dict | None = None,
        provider_request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
        self.billed, self.usage, self.provider_request_id = billed, usage, provider_request_id


def error_body(
    code: str,
    message: str,
    billed: Billed = "no",
    usage: dict | None = None,
    provider_request_id: str | None = None,
) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "billed": billed,
            "usage": usage,
            "provider_request_id": provider_request_id,
        }
    }


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ServiceError)
    async def _service_error(_: Request, exc: ServiceError) -> JSONResponse:
        body = error_body(exc.code, exc.message, exc.billed, exc.usage, exc.provider_request_id)
        return JSONResponse(body, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Report where validation failed, never the submitted values.
        fields = sorted({".".join(str(p) for p in err["loc"]) for err in exc.errors()})[:10]
        return JSONResponse(
            error_body("invalid_request", f"Invalid fields: {', '.join(fields)}"), status_code=422
        )
