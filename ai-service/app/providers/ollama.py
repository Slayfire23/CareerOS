"""Ollama provider: a free language model running on CareerOS-controlled hardware.

Same prompt (v1) and output schema as every language-model provider, and the same strict
validation: any finding that overreaches its evidence discards the whole response. Rules:
- One generation at a time (an 8 GB GPU cannot run two well); others wait briefly, then get 503.
- Deterministic settings: temperature 0, a fixed seed, thinking off, schema-constrained output.
- The prompt must fit the context window with room for the answer. Ollama silently truncates
  prompts that don't fit, so requests that might not fit are refused, and a response whose token
  counts reach the window is rejected.
- Nothing is billed. Errors still say billed "no" so the shared contract stays uniform.
- Logs carry the model, token counts, and timings only, never prompt or profile text.
"""

import asyncio
import json
import logging
import time

import httpx2
from pydantic import ValidationError

from app.config import Settings
from app.errors import ServiceError
from app.providers.base import ProviderOutput
from app.providers.prompt import OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT, build_user_message
from app.schemas import Finding, MatchRequest, Usage

log = logging.getLogger("careeros.ollama")

# Characters per token never falls below this for the English and JSON text we send, so it gives a
# safe over-estimate of the prompt's token count.
CHARS_PER_TOKEN_FLOOR = 2.0
# Kept in the system message too, as Ollama recommends, so the model sees the exact shape.
SCHEMA_TEXT = json.dumps(OUTPUT_SCHEMA, separators=(",", ":"))
SYSTEM_WITH_SCHEMA = f"{SYSTEM_PROMPT}\n\nRespond only with JSON that matches this schema:\n{SCHEMA_TEXT}"


def estimated_prompt_tokens(user_message: str) -> int:
    return int((len(SYSTEM_WITH_SCHEMA) + len(user_message)) / CHARS_PER_TOKEN_FLOOR) + 64


class OllamaProvider:
    name = "ollama"
    local = True  # runs on CareerOS-controlled hardware; costs nothing
    generative = True  # language-model output: always strictly validated

    def __init__(self, settings: Settings, client: httpx2.AsyncClient | None = None) -> None:
        self.model = settings.ollama_model
        self.method_version = f"ollama/{self.model}/{PROMPT_VERSION}"
        self._settings = settings
        self._client = client or httpx2.AsyncClient(
            base_url=settings.ollama_url,
            timeout=httpx2.Timeout(settings.provider_timeout_seconds, connect=3.0),
        )
        self._gpu = asyncio.Semaphore(1)

    async def status(self) -> str:
        """'ok', 'model_missing', or 'unreachable' (for readiness reporting)."""
        try:
            response = await self._client.get("/api/tags", timeout=3.0)
            response.raise_for_status()
            names = {m.get("name") for m in response.json().get("models", [])}
        except (httpx2.HTTPError, ValueError):
            return "unreachable"
        return "ok" if self.model in names else "model_missing"

    async def match(self, request: MatchRequest) -> ProviderOutput:
        settings = self._settings
        user_message = build_user_message(request)
        if estimated_prompt_tokens(user_message) + settings.ollama_num_predict > settings.ollama_num_ctx:
            raise ServiceError(
                413, "over_budget", "This analysis is too large for the local model's context window."
            )

        try:
            await asyncio.wait_for(self._gpu.acquire(), timeout=settings.ollama_queue_timeout_seconds)
        except TimeoutError:
            raise ServiceError(
                503, "provider_busy", "The local AI is busy with another analysis. Try again shortly."
            ) from None
        started = time.perf_counter()
        try:
            response = await self._client.post(
                "/api/chat",
                json={
                    "model": self.model,
                    "stream": False,
                    "think": False,
                    "keep_alive": settings.ollama_keep_alive,
                    "format": OUTPUT_SCHEMA,
                    "messages": [
                        {"role": "system", "content": SYSTEM_WITH_SCHEMA},
                        {"role": "user", "content": user_message},
                    ],
                    "options": {
                        "temperature": 0,
                        "seed": 42,
                        "num_ctx": settings.ollama_num_ctx,
                        "num_predict": settings.ollama_num_predict,
                    },
                },
            )
        except httpx2.TimeoutException:
            log.warning("ollama timeout model=%s", self.model)
            raise ServiceError(
                504, "provider_timeout", "The local AI took too long. Please try again."
            ) from None
        except httpx2.HTTPError as exc:
            log.warning("ollama unreachable class=%s", type(exc).__name__)
            raise ServiceError(
                503, "provider_unavailable", "The local AI is not available right now."
            ) from None
        finally:
            self._gpu.release()

        if response.status_code == 404:  # the model is not installed
            log.error("ollama model missing model=%s", self.model)
            raise ServiceError(503, "provider_unavailable", "The local AI model is not installed.")
        if response.status_code != 200:
            log.warning("ollama error status=%s", response.status_code)
            raise ServiceError(502, "provider_error", "The local AI had a problem. Try again later.")

        try:
            body = response.json()
            content = body["message"]["content"]
            prompt_tokens, output_tokens = (
                int(body.get("prompt_eval_count", 0)),
                int(body.get("eval_count", 0)),
            )
        except (ValueError, KeyError, TypeError):
            raise ServiceError(
                502, "provider_output_rejected", "The analysis could not be verified and was discarded."
            ) from None
        usage = Usage(input_tokens=prompt_tokens, output_tokens=output_tokens)
        usage_dict = usage.model_dump()
        log.info(
            "ollama ok model=%s done=%s prompt=%s output=%s seconds=%.1f",
            self.model,
            body.get("done_reason"),
            prompt_tokens,
            output_tokens,
            time.perf_counter() - started,
        )
        if body.get("done_reason") == "length" or prompt_tokens + output_tokens >= settings.ollama_num_ctx:
            raise ServiceError(
                502,
                "provider_output_truncated",
                "The analysis could not be verified and was discarded.",
                "no",
                usage_dict,
            )

        try:
            raw = json.loads(content)
            items = raw["findings"]
            if not isinstance(items, list):
                raise TypeError("findings is not a list")
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("verdict"), str):
                    item["verdict"] = item["verdict"].lower()
            findings = [Finding.model_validate(item) for item in items]
        except (json.JSONDecodeError, KeyError, TypeError, ValidationError):
            raise ServiceError(
                502,
                "provider_output_rejected",
                "The analysis could not be verified and was discarded.",
                "no",
                usage_dict,
            ) from None
        return ProviderOutput(findings=findings, usage=usage)
