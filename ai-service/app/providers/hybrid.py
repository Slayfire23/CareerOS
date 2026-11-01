"""Hybrid provider: the rules engine decides every requirement, and local AI (Ollama) may add skill
matches the rules engine missed, such as another name for the same technology.

For each requirement:
- The rules engine's verdict is the baseline, and the only verdict for hard qualifications
  (experience, education, durations, credentials). See app/matching/hybrid_checks.py.
- Skill requirements the rules engine did not already support are sent to local AI, under short
  evidence ids, in as few calls as fit the model's context window.
- Each local-AI answer is checked on its own: code decides how far it may go and writes the
  explanation. One that fails a check, finds nothing better, or never arrives leaves the rules
  verdict in place, and the finding says so (``ai_status``).
- If local AI is down, busy, or slow, the analysis still completes with rules results only,
  each labeled as such. It never fails because of local AI.

Every finding carries ``method`` ("rules" or "local_ai"), so results are never presented as
coming from a method that did not produce them.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

from app.config import Settings
from app.errors import ServiceError
from app.matching.hybrid_checks import (
    VERDICT_RANK,
    Lowered,
    Rejection,
    check_local_finding,
    contains_instructions,
    semantic_eligible,
)
from app.matching.validate import validate_findings
from app.providers.base import ProviderOutput
from app.providers.hybrid_prompt import (
    HYBRID_PROMPT_VERSION,
    build_hybrid_message,
    hybrid_schema,
    short_ids,
    system_with_schema,
)
from app.providers.ollama import OllamaProvider, estimated_prompt_tokens
from app.providers.rules import RulesProvider
from app.schemas import AiStatus, Evidence, Finding, MatchRequest, Requirement, Usage

log = logging.getLogger("careeros.hybrid")

# Requirements per local-AI call; fewer when the profile is large.
MAX_REQUIREMENTS_PER_CALL = 8
# Output tokens allowed per requirement in one call (an answer is usually 60-150 tokens).
OUTPUT_TOKENS_PER_REQUIREMENT = 300
# Time kept back from the service timeout, so rules results are always returned in time.
DEADLINE_MARGIN_SECONDS = 5.0


@dataclass
class HybridResult:
    findings: list[Finding]
    usage: Usage | None
    calls: int = 0
    rejections: dict[int, Rejection] = field(default_factory=dict)
    lowered: dict[int, Lowered] = field(default_factory=dict)  # model "supported" shown as "possible"
    ai_error: str | None = None  # error code when local AI could not answer some requirements


class HybridProvider:
    name = "hybrid"
    local = True  # rules engine plus Ollama on CareerOS-controlled hardware; costs nothing
    generative = False  # local-AI answers are checked one by one in hybrid_checks, not here
    labels_methods = True  # sets method and ai_status on every finding

    def __init__(self, settings: Settings, ollama: OllamaProvider | None = None) -> None:
        self._settings = settings
        self._rules = RulesProvider()
        self._ollama = ollama or OllamaProvider(settings)
        self.model = self._ollama.model
        self.method_version = f"hybrid/{self._rules.method_version}+{self.model}/{HYBRID_PROMPT_VERSION}"

    async def status(self) -> str:
        return await self._ollama.status()

    async def match(self, request: MatchRequest) -> ProviderOutput:
        result = await self.assess(request)
        return ProviderOutput(findings=result.findings, usage=result.usage)

    async def assess(self, request: MatchRequest) -> HybridResult:
        baseline = {
            f.requirement_index: f for f in validate_findings(request, await self._rules.match(request))
        }
        statuses: dict[int, AiStatus] = {}
        candidates: list[Requirement] = []
        evidence = short_ids(request.evidence)
        for requirement in request.requirements:
            if contains_instructions(requirement, evidence):
                statuses[requirement.index] = "contains_instructions"
            elif not semantic_eligible(requirement):
                statuses[requirement.index] = "not_eligible"
            elif baseline[requirement.index].verdict == "supported":
                statuses[requirement.index] = "not_needed"
            else:
                candidates.append(requirement)

        accepted: dict[int, Finding] = {}
        result = HybridResult(findings=[], usage=None)
        if candidates and not evidence:
            statuses.update({r.index: "no_match" for r in candidates})  # nothing to match against
        elif candidates:
            await self._ask(request, candidates, evidence, baseline, statuses, accepted, result)

        result.findings = [
            accepted.get(r.index)
            or baseline[r.index].model_copy(update={"method": "rules", "ai_status": statuses[r.index]})
            for r in request.requirements
        ]
        log.info(
            "hybrid done calls=%s eligible=%s accepted=%s rejected=%s error=%s",
            result.calls,
            len(candidates),
            len(accepted),
            len(result.rejections),
            result.ai_error,
        )
        return result

    def _batches(
        self, candidates: list[Requirement], evidence: dict[str, Evidence]
    ) -> list[list[Requirement]] | None:
        """Group requirements into calls that fit the context window; None if even one won't fit."""
        settings = self._settings
        batches: list[list[Requirement]] = []
        current: list[Requirement] = []
        for requirement in candidates:
            trial = [*current, requirement]
            if len(trial) <= MAX_REQUIREMENTS_PER_CALL and self._fits(trial, evidence, settings):
                current = trial
                continue
            if not current:
                return None
            batches.append(current)
            current = [requirement]
            if not self._fits(current, evidence, settings):
                return None
        if current:
            batches.append(current)
        return batches

    @staticmethod
    def _output_tokens(requirements: list[Requirement], settings: Settings) -> int:
        return min(settings.ollama_num_predict, 200 + OUTPUT_TOKENS_PER_REQUIREMENT * len(requirements))

    def _fits(
        self, requirements: list[Requirement], evidence: dict[str, Evidence], settings: Settings
    ) -> bool:
        schema = hybrid_schema([r.index for r in requirements], list(evidence))
        tokens = estimated_prompt_tokens(
            build_hybrid_message(requirements, evidence), system_with_schema(schema)
        )
        return tokens + self._output_tokens(requirements, settings) <= settings.ollama_num_ctx

    async def _ask(
        self,
        request: MatchRequest,
        candidates: list[Requirement],
        evidence: dict[str, Evidence],
        baseline: dict[int, Finding],
        statuses: dict[int, AiStatus],
        accepted: dict[int, Finding],
        result: HybridResult,
    ) -> None:
        batches = self._batches(candidates, evidence)
        if batches is None:
            result.ai_error = "over_budget"
            statuses.update({r.index: "unavailable" for r in candidates})
            return
        deadline = time.monotonic() + max(
            1.0, self._settings.provider_timeout_seconds - DEADLINE_MARGIN_SECONDS
        )
        input_tokens = output_tokens = 0
        for batch in batches:
            remaining = deadline - time.monotonic()
            if result.ai_error or remaining <= 0:
                result.ai_error = result.ai_error or "provider_timeout"
                statuses.update({r.index: "unavailable" for r in batch})
                continue
            indexes = [r.index for r in batch]
            schema = hybrid_schema(indexes, list(evidence))
            try:
                content, usage = await asyncio.wait_for(
                    self._ollama.generate(
                        system_with_schema(schema),
                        build_hybrid_message(batch, evidence),
                        schema,
                        self._output_tokens(batch, self._settings),
                    ),
                    timeout=remaining,
                )
            except ServiceError as exc:
                if exc.code in ("provider_output_truncated", "provider_output_rejected"):
                    # Local AI answered, but not usably; later calls may still work.
                    statuses.update({r.index: "rejected" for r in batch})
                    result.rejections.update({r.index: "unreadable_answer" for r in batch})
                    continue
                result.ai_error = exc.code  # down, busy, or too slow: don't try the rest
                statuses.update({r.index: "unavailable" for r in batch})
                continue
            except TimeoutError:
                result.ai_error = "provider_timeout"
                statuses.update({r.index: "unavailable" for r in batch})
                continue
            result.calls += 1
            input_tokens += usage.input_tokens
            output_tokens += usage.output_tokens
            self._merge(batch, content, evidence, baseline, statuses, accepted, result)
        if result.calls:
            result.usage = Usage(input_tokens=input_tokens, output_tokens=output_tokens)

    @staticmethod
    def _merge(
        batch: list[Requirement],
        content: str,
        evidence: dict[str, Evidence],
        baseline: dict[int, Finding],
        statuses: dict[int, AiStatus],
        accepted: dict[int, Finding],
        result: HybridResult,
    ) -> None:
        by_index: dict[int, list[dict]] = {}
        try:
            items = json.loads(content)["findings"]
            if not isinstance(items, list):
                raise TypeError
        except (ValueError, KeyError, TypeError):
            items = []
        for item in items:
            if isinstance(item, dict) and isinstance(item.get("requirement_index"), int):
                by_index.setdefault(item["requirement_index"], []).append(item)

        for requirement in batch:
            answers = by_index.get(requirement.index, [])
            if len(answers) != 1:  # missing or duplicated: the answer can't be trusted
                statuses[requirement.index] = "rejected"
                result.rejections[requirement.index] = "missing_answer"
                continue
            checked = check_local_finding(requirement, answers[0], evidence)
            if checked is None:
                statuses[requirement.index] = "no_match"
            elif isinstance(checked, str):
                statuses[requirement.index] = "rejected"
                result.rejections[requirement.index] = checked
            elif VERDICT_RANK[checked[0].verdict] <= VERDICT_RANK[baseline[requirement.index].verdict]:
                statuses[requirement.index] = "no_match"  # local AI may only add a stronger match
            else:
                accepted[requirement.index] = checked[0]
                if checked[1]:
                    result.lowered[requirement.index] = checked[1]
