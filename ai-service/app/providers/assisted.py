"""A thin bridge from Next.js to local AI (Ollama) for suggestions. It makes no decisions.

Next.js decides every verdict on its own server and saves it first. It then sends this service only
what local AI may see, with remarks and claims already removed: what each unsettled requirement
requests, and the profile's skills, roles, and projects. There are no dates, education, skill levels,
or verdicts in the request, by construction of its schema, and none in the response.

The answers are untrusted pointers. This service checks only their shape; Next.js checks each one
against the person's own profile and writes every word shown (src/lib/ai/rules/suggestions.ts).

When Ollama is down, slow, or busy, the response says ``ai_assist="unavailable"`` with whatever
arrived so far. There is no fallback to any other provider.
"""

import asyncio
import json
import logging
import time

from app.config import Settings
from app.errors import ServiceError
from app.providers.assisted_prompt import ASSIST_PROMPT_VERSION, assist_message, assist_schema, assist_system
from app.providers.ollama import OllamaProvider, estimated_prompt_tokens
from app.schemas import Pointer, SuggestRequest, SuggestRequirement, SuggestResponse, Usage

log = logging.getLogger("careeros.assisted")

MAX_REQUIREMENTS_PER_CALL = 8
OUTPUT_TOKENS_PER_REQUIREMENT = 200
DEADLINE_MARGIN_SECONDS = 5.0
_PREFIXES = {"skill": "s", "experience": "x", "project": "p"}


def _views(request: SuggestRequest) -> tuple[dict[str, str], list[dict]]:
    """Short id -> real id, and what the model sees of each entry under its short id."""
    counters = dict.fromkeys(_PREFIXES.values(), 0)
    ids: dict[str, str] = {}
    views: list[dict] = []
    for item in request.evidence:
        prefix = _PREFIXES[item.kind]
        counters[prefix] += 1
        short = f"{prefix}{counters[prefix]}"
        ids[short] = item.id
        fields = item.model_dump(exclude={"id", "kind"})
        if item.kind == "skill":
            fields = {"skill": item.name}
        views.append({"id": short} | {k: v for k, v in fields.items() if v})
    return ids, views


class AssistedProvider:
    name = "assisted"
    local = True
    generative = False

    def __init__(self, settings: Settings, ollama: OllamaProvider | None = None) -> None:
        self._settings = settings
        self._ollama = ollama or OllamaProvider(settings)
        self.model = self._ollama.model
        self.method_version = f"assist/{self.model}/{ASSIST_PROMPT_VERSION}"

    async def status(self) -> str:
        return await self._ollama.status()

    async def suggest(self, request: SuggestRequest) -> SuggestResponse:
        ids, views = _views(request)
        pointers: list[Pointer] = []
        input_tokens = output_tokens = calls = malformed = 0
        error: str | None = None
        batches = self._batches(request.requirements, views, ids)
        if request.requirements and views and not batches:
            error = "over_budget"
        deadline = time.monotonic() + max(
            1.0, self._settings.provider_timeout_seconds - DEADLINE_MARGIN_SECONDS
        )
        for batch in batches:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                error = "provider_timeout"
                break
            schema = assist_schema([r.index for r in batch], list(ids))
            try:
                content, usage = await asyncio.wait_for(
                    self._ollama.generate(
                        assist_system(schema),
                        assist_message(batch, views),
                        schema,
                        self._output_tokens(batch),
                    ),
                    timeout=remaining,
                )
            except ServiceError as exc:
                if exc.code in ("provider_output_truncated", "provider_output_rejected"):
                    malformed += 1
                    continue
                error = exc.code  # down, busy, or too slow: don't try the rest
                break
            except TimeoutError:
                error = "provider_timeout"
                break
            calls += 1
            input_tokens += usage.input_tokens
            output_tokens += usage.output_tokens
            found, bad = self._pointers(batch, content, ids)
            pointers += found
            malformed += bad
        log.info(
            "suggest done calls=%s sent=%s pointers=%s malformed=%s error=%s",
            calls,
            len(request.requirements),
            len(pointers),
            malformed,
            error,
        )
        return SuggestResponse(
            request_id=request.request_id,
            model=self.model,
            method_version=self.method_version,
            # Partly answered still counts as unavailable, so the page can say some may be missing.
            ai_assist="unavailable" if error else "used",
            pointers=pointers,
            usage=Usage(input_tokens=input_tokens, output_tokens=output_tokens) if calls else None,
        )

    def _output_tokens(self, requirements: list[SuggestRequirement]) -> int:
        limit = self._settings.ollama_num_predict
        return min(limit, 200 + OUTPUT_TOKENS_PER_REQUIREMENT * len(requirements))

    def _fits(self, requirements: list[SuggestRequirement], views: list[dict], ids: dict[str, str]) -> bool:
        schema = assist_schema([r.index for r in requirements], list(ids))
        tokens = estimated_prompt_tokens(assist_message(requirements, views), assist_system(schema))
        return tokens + self._output_tokens(requirements) <= self._settings.ollama_num_ctx

    def _batches(
        self, candidates: list[SuggestRequirement], views: list[dict], ids: dict[str, str]
    ) -> list[list[SuggestRequirement]]:
        if not views:
            return []
        batches: list[list[SuggestRequirement]] = []
        current: list[SuggestRequirement] = []
        for requirement in candidates:
            trial = [*current, requirement]
            if len(trial) <= MAX_REQUIREMENTS_PER_CALL and self._fits(trial, views, ids):
                current = trial
            elif current and self._fits([requirement], views, ids):
                batches.append(current)
                current = [requirement]
            elif not current:
                continue  # too large on its own; it simply gets no suggestions
            else:
                batches.append(current)
                current = []
        if current:
            batches.append(current)
        return batches

    @staticmethod
    def _pointers(
        batch: list[SuggestRequirement], content: str, ids: dict[str, str]
    ) -> tuple[list[Pointer], int]:
        """Well-formed pointers with real evidence ids. Whether each one is right is Next.js's call."""
        try:
            items = json.loads(content)["suggestions"]
            if not isinstance(items, list):
                raise TypeError
        except (ValueError, KeyError, TypeError):
            return [], 1
        indexes = {r.index for r in batch}
        found: list[Pointer] = []
        malformed = 0
        for item in items:
            if not isinstance(item, dict) or item.get("requirement_index") not in indexes:
                malformed += 1
                continue
            kind, quote, term = item.get("kind"), item.get("quote"), item.get("term")
            real = ids.get(item.get("evidence_id"))  # type: ignore[arg-type]
            if kind == "possible_connection" and real and isinstance(quote, str) and 1 <= len(quote) <= 300:
                found.append(
                    Pointer(
                        requirement_index=item["requirement_index"], kind=kind, evidence_id=real, quote=quote
                    )
                )
            elif kind == "missing_from_profile" and isinstance(term, str) and 1 <= len(term) <= 100:
                found.append(Pointer(requirement_index=item["requirement_index"], kind=kind, term=term))
            else:
                malformed += 1
        return found, malformed
