"""Anthropic provider: Claude Sonnet 5.5 with structured output (decision D1).

Cost and safety rules enforced here:
- Exactly one billable call per request. The SDK's automatic retries are off; the only retry is
  after a rate-limit response (429, not processed, not billed) that tells us when to retry and
  still fits inside the deadline. A failure that may have been billed is never retried.
- The prompt must fit inside the token budget Next.js reserved money for, measured by a byte
  bound that can only over-estimate tokens, and output is capped at the reserved maximum.
- ``stop_reason`` is checked before the output is parsed. Refusals and truncated output are
  failures (billed), never repaired, and no fallback model is used.
- Logs carry error classes, status codes, and Anthropic request ids only, never prompt text,
  profile or job text, error messages, or the API key.
"""

import asyncio
import json
import logging
import time
from collections import deque

import httpx2
from anthropic import APIConnectionError, APIStatusError, APITimeoutError, AsyncAnthropic
from pydantic import ValidationError

from app.config import Settings
from app.errors import ServiceError
from app.providers.anthropic_prompt import (
    OUTPUT_SCHEMA,
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_message,
    prompt_size_bound,
)
from app.providers.base import ProviderOutput
from app.schemas import Finding, MatchRequest, Usage

log = logging.getLogger("careeros.anthropic")

# Circuit breaker: after this many provider failures in the window, stop calling for a while.
BREAKER_FAILURES = 5
BREAKER_WINDOW_SECONDS = 120.0
BREAKER_OPEN_SECONDS = 60.0
# A retry needs at least this much of the deadline left.
RETRY_MIN_REMAINING_SECONDS = 15.0


def _usage(raw) -> Usage | None:
    if raw is None:
        return None
    return Usage(
        input_tokens=raw.input_tokens or 0,
        output_tokens=raw.output_tokens or 0,
        cache_read_input_tokens=raw.cache_read_input_tokens or 0,
        cache_creation_input_tokens=raw.cache_creation_input_tokens or 0,
    )


def _is_spend_cap(exc: APIStatusError) -> bool:
    body = exc.body if isinstance(exc.body, dict) else {}
    error = body.get("error") if isinstance(body.get("error"), dict) else {}
    details = error.get("details") if isinstance(error.get("details"), dict) else {}
    return details.get("error_code") == "enforced_spend_limit_reached"


class AnthropicProvider:
    name = "anthropic"
    local = False

    def __init__(
        self,
        settings: Settings,
        client: AsyncAnthropic | None = None,
        clock=time.monotonic,
        sleep=asyncio.sleep,
        retry_rate_limits: bool = True,
    ) -> None:
        self.model = settings.anthropic_model
        self.method_version = f"{self.model}/{PROMPT_VERSION}"
        self._settings = settings
        self._clock, self._sleep = clock, sleep
        self._retry_rate_limits = retry_rate_limits  # off for evaluations: one request per call
        self._failures: deque[float] = deque()
        self._open_until = 0.0
        if client is None:
            key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else ""
            client = AsyncAnthropic(
                api_key=key,
                base_url=settings.anthropic_base_url,  # None means the real API
                max_retries=0,  # retries are decided here, so a possibly billed call is never repeated
                timeout=httpx2.Timeout(settings.provider_timeout_seconds - 5, connect=5.0),
            )
        self._client = client

    # --- circuit breaker -------------------------------------------------------------------

    def _breaker_open(self) -> bool:
        return self._clock() < self._open_until

    def _record_failure(self) -> None:
        now = self._clock()
        self._failures.append(now)
        while self._failures and now - self._failures[0] > BREAKER_WINDOW_SECONDS:
            self._failures.popleft()
        if len(self._failures) >= BREAKER_FAILURES:
            self._open_until = now + BREAKER_OPEN_SECONDS
            self._failures.clear()
            log.warning("circuit breaker open for %.0fs", BREAKER_OPEN_SECONDS)

    # --- the call --------------------------------------------------------------------------

    async def match(self, request: MatchRequest) -> ProviderOutput:
        budget = request.budget
        if budget is None:
            raise ServiceError(400, "budget_required", "A token budget is required for this provider.")
        if self._breaker_open():
            raise ServiceError(503, "provider_unavailable", "The AI provider is not available right now.")

        user_message = build_user_message(request)
        input_bound = prompt_size_bound(user_message)
        if input_bound > min(budget.max_input_tokens, self._settings.anthropic_max_input_tokens):
            raise ServiceError(413, "over_budget", "This analysis is too large for its budget.")
        max_tokens = min(budget.max_output_tokens, self._settings.anthropic_max_output_tokens)

        started = self._clock()
        attempt = 0
        while True:
            attempt += 1
            try:
                response = await self._client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_message}],
                    output_config={
                        "effort": self._settings.anthropic_effort,
                        "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
                    },
                )
                break
            except APITimeoutError:
                log.warning("anthropic timeout")
                raise ServiceError(
                    504, "provider_timeout", "The analysis took too long. Please try again.", billed="unknown"
                ) from None
            except APIConnectionError:
                # The request may or may not have reached Anthropic.
                log.warning("anthropic connection error")
                raise ServiceError(
                    502, "provider_error", "The AI provider could not be reached.", billed="unknown"
                ) from None
            except APIStatusError as exc:
                status = exc.status_code
                log.warning(
                    "anthropic error status=%s class=%s request=%s",
                    status,
                    type(exc).__name__,
                    exc.request_id,
                )
                if status == 429 and not _is_spend_cap(exc):
                    retry_after = _retry_after_seconds(exc)
                    remaining = self._settings.provider_timeout_seconds - (self._clock() - started)
                    if (
                        self._retry_rate_limits
                        and attempt == 1
                        and retry_after is not None
                        and remaining - retry_after >= RETRY_MIN_REMAINING_SECONDS
                    ):
                        await self._sleep(retry_after)
                        continue
                    self._record_failure()
                    raise ServiceError(
                        503, "provider_busy", "The AI provider is busy. Try again later."
                    ) from None
                if status in (401, 402, 403, 404, 429):
                    raise ServiceError(
                        503, "provider_unavailable", "The AI provider is not available right now."
                    ) from None
                if status < 500:
                    # Includes 400 for a spend limit set in the Anthropic Console. Not processed.
                    raise ServiceError(
                        503, "provider_request_rejected", "The AI provider is not available right now."
                    ) from None
                # 500, 503, 504 and 529: not documented as unbilled, so treated as unknown.
                self._record_failure()
                raise ServiceError(
                    502, "provider_error", "The AI provider had a problem. Try again later.", billed="unknown"
                ) from None

        usage = _usage(response.usage)
        usage_dict = usage.model_dump() if usage else None
        request_id = getattr(response, "_request_id", None)
        log.info(
            "anthropic ok stop=%s input=%s output=%s request=%s",
            response.stop_reason,
            usage.input_tokens if usage else "-",
            usage.output_tokens if usage else "-",
            request_id,
        )
        if response.stop_reason == "refusal":
            raise ServiceError(
                502, "provider_refused", "This analysis couldn't be completed.", "yes", usage_dict, request_id
            )
        if response.stop_reason == "max_tokens":
            raise ServiceError(
                502,
                "provider_output_truncated",
                "The analysis could not be verified and was discarded.",
                "yes",
                usage_dict,
                request_id,
            )
        if response.stop_reason != "end_turn":
            raise ServiceError(
                502,
                "provider_output_rejected",
                "The analysis could not be verified and was discarded.",
                "yes",
                usage_dict,
                request_id,
            )

        try:
            text = next(block.text for block in response.content if block.type == "text")
            raw = json.loads(text)
            items = raw["findings"]
            if not isinstance(items, list):
                raise TypeError("findings is not a list")
            # Structured output may return an enum value in different letter case.
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("verdict"), str):
                    item["verdict"] = item["verdict"].lower()
            findings = [Finding.model_validate(item) for item in items]
        except (StopIteration, json.JSONDecodeError, KeyError, TypeError, ValidationError):
            raise ServiceError(
                502,
                "provider_output_rejected",
                "The analysis could not be verified and was discarded.",
                "yes",
                usage_dict,
                request_id,
            ) from None
        return ProviderOutput(findings=findings, usage=usage, provider_request_id=request_id)


def _retry_after_seconds(exc: APIStatusError) -> float | None:
    value = exc.response.headers.get("retry-after")
    try:
        seconds = float(value) if value is not None else None
    except ValueError:
        return None
    return seconds if seconds is not None and 0 <= seconds <= 30 else None
