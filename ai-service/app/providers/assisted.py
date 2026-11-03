"""AI-assisted analysis: the rules engine decides every verdict, and local AI (Ollama) adds suggestions.

Verdicts come only from the rules engine, and the provider returns its findings untouched. Local AI
never sees them change: its answers go through app/matching/suggestions.py and into a separate list.
So verdicts are identical whether local AI answers, fails, or is off.

- Local AI sees only requirements the rules engine did not support, and did not flag for
  confirmation, that can be judged from skills and work: no durations, credentials, or education.
- It sees what the requirement requests and the profile's skills, roles, and projects, under short
  ids, with any text aimed at an evaluator masked. The output schema lists the only ids that exist.
- When Ollama is down, slow, or busy, the result is the rules findings with no suggestions and
  ``ai_assist="unavailable"``. There is no fallback to any other provider.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

from app.config import Settings
from app.errors import ServiceError
from app.matching.requirement_structure import listed_terms, parse
from app.matching.requirement_text import QUALIFICATION_WORDS
from app.matching.suggestions import check_suggestion
from app.matching.validate import required_months, validate_findings
from app.providers.assisted_prompt import ASSIST_PROMPT_VERSION, assist_message, assist_schema, assist_system
from app.providers.base import ProviderOutput
from app.providers.hybrid_prompt import short_ids
from app.providers.ollama import OllamaProvider, estimated_prompt_tokens
from app.providers.rules import RulesProvider
from app.schemas import (
    Evidence,
    Finding,
    MatchRequest,
    ProjectEvidence,
    Requirement,
    SkillEvidence,
    Suggestion,
    Usage,
)

log = logging.getLogger("careeros.assisted")

MAX_REQUIREMENTS_PER_CALL = 8
OUTPUT_TOKENS_PER_REQUIREMENT = 200
MAX_SUGGESTIONS_PER_REQUIREMENT = 3
DEADLINE_MARGIN_SECONDS = 5.0


@dataclass
class AssistResult:
    findings: list[Finding]
    suggestions: list[Suggestion] = field(default_factory=list)
    usage: Usage | None = None
    ai_assist: str = "not_needed"
    calls: int = 0
    rejected: dict[str, int] = field(default_factory=dict)
    ai_error: str | None = None


def _sendable(requirement: Requirement, finding: Finding) -> bool:
    """Suggestions help where the rules engine didn't settle a skill question. Hard qualifications
    and requirements awaiting confirmation stay out."""
    return (
        finding.verdict != "supported"
        and not finding.review
        and requirement.category != "Education"
        and required_months(requirement.text) is None
        and not QUALIFICATION_WORDS.search(requirement.text)
    )


class AssistedProvider:
    name = "assisted"
    local = True
    generative = False

    def __init__(self, settings: Settings, ollama: OllamaProvider | None = None) -> None:
        self._settings = settings
        self._rules = RulesProvider()
        self._ollama = ollama or OllamaProvider(settings)
        self.model = self._ollama.model
        self.method_version = f"assisted/{self._rules.method_version}+{self.model}/{ASSIST_PROMPT_VERSION}"

    async def status(self) -> str:
        return await self._ollama.status()

    async def match(self, request: MatchRequest) -> ProviderOutput:
        result = await self.assess(request)
        return ProviderOutput(
            findings=result.findings,
            usage=result.usage,
            suggestions=result.suggestions,
            ai_assist=result.ai_assist,
        )

    async def assess(self, request: MatchRequest) -> AssistResult:
        # Validated and finished before local AI is involved: nothing below can reach these.
        findings = validate_findings(request, await self._rules.match(request))
        findings = [f.model_copy(update={"method": "rules"}) for f in findings]
        result = AssistResult(findings=findings)
        by_index = {f.requirement_index: f for f in findings}
        evidence = short_ids(request.evidence)
        candidates = [r for r in request.requirements if _sendable(r, by_index[r.index])]
        if candidates and evidence:
            await self._ask(candidates, evidence, by_index, result)
        log.info(
            "assisted done calls=%s sent=%s suggestions=%s rejected=%s error=%s",
            result.calls,
            len(candidates),
            len(result.suggestions),
            sum(result.rejected.values()),
            result.ai_error,
        )
        return result

    def _batches(
        self, candidates: list[Requirement], evidence: dict[str, Evidence]
    ) -> list[list[Requirement]]:
        batches: list[list[Requirement]] = []
        current: list[Requirement] = []
        for requirement in candidates:
            trial = [*current, requirement]
            if len(trial) <= MAX_REQUIREMENTS_PER_CALL and self._fits(trial, evidence):
                current = trial
            elif current and self._fits([requirement], evidence):
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

    def _output_tokens(self, requirements: list[Requirement]) -> int:
        limit = self._settings.ollama_num_predict
        return min(limit, 200 + OUTPUT_TOKENS_PER_REQUIREMENT * len(requirements))

    def _fits(self, requirements: list[Requirement], evidence: dict[str, Evidence]) -> bool:
        schema = assist_schema([r.index for r in requirements], list(evidence))
        tokens = estimated_prompt_tokens(assist_message(requirements, evidence), assist_system(schema))
        return tokens + self._output_tokens(requirements) <= self._settings.ollama_num_ctx

    async def _ask(
        self,
        candidates: list[Requirement],
        evidence: dict[str, Evidence],
        by_index: dict[int, Finding],
        result: AssistResult,
    ) -> None:
        batches = self._batches(candidates, evidence)
        if not batches:
            result.ai_assist, result.ai_error = "unavailable", "over_budget"
            return
        deadline = time.monotonic() + max(
            1.0, self._settings.provider_timeout_seconds - DEADLINE_MARGIN_SECONDS
        )
        input_tokens = output_tokens = 0
        for batch in batches:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                result.ai_error = "provider_timeout"
                break
            schema = assist_schema([r.index for r in batch], list(evidence))
            try:
                content, usage = await asyncio.wait_for(
                    self._ollama.generate(
                        assist_system(schema),
                        assist_message(batch, evidence),
                        schema,
                        self._output_tokens(batch),
                    ),
                    timeout=remaining,
                )
            except ServiceError as exc:
                if exc.code in ("provider_output_truncated", "provider_output_rejected"):
                    result.rejected["unreadable_answer"] = result.rejected.get("unreadable_answer", 0) + 1
                    continue
                result.ai_error = exc.code  # down, busy, or too slow: don't try the rest
                break
            except TimeoutError:
                result.ai_error = "provider_timeout"
                break
            result.calls += 1
            input_tokens += usage.input_tokens
            output_tokens += usage.output_tokens
            self._merge(batch, content, evidence, by_index, result)
        if result.calls:
            result.usage = Usage(input_tokens=input_tokens, output_tokens=output_tokens)
        # Partly answered still counts as unavailable, so the page can say suggestions may be incomplete.
        result.ai_assist = "unavailable" if result.ai_error else "used"

    @staticmethod
    def _merge(
        batch: list[Requirement],
        content: str,
        evidence: dict[str, Evidence],
        by_index: dict[int, Finding],
        result: AssistResult,
    ) -> None:
        try:
            items = json.loads(content)["suggestions"]
            if not isinstance(items, list):
                raise TypeError
        except (ValueError, KeyError, TypeError):
            result.rejected["unreadable_answer"] = result.rejected.get("unreadable_answer", 0) + 1
            return
        requirements = {r.index: r for r in batch}
        names = [e.name for e in evidence.values() if isinstance(e, SkillEvidence)]
        names += [n for e in evidence.values() if isinstance(e, ProjectEvidence) for n in e.skills]
        listed = listed_terms(names)
        counts: dict[int, int] = {}
        seen: set[tuple] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            requirement = requirements.get(item.get("requirement_index"))  # type: ignore[arg-type]
            if requirement is None:
                continue
            structure = parse(requirement.text, listed, requirement.confirmed)
            finding = by_index[requirement.index]
            cited = {(c.evidence_id, c.quote) for c in finding.citations}
            checked = check_suggestion(requirement, structure, item, evidence, cited)
            if isinstance(checked, str):
                result.rejected[checked] = result.rejected.get(checked, 0) + 1
                continue
            key = (checked.requirement_index, checked.kind, checked.term, checked.citation)
            if key in seen or counts.get(requirement.index, 0) >= MAX_SUGGESTIONS_PER_REQUIREMENT:
                continue
            seen.add(key)
            counts[requirement.index] = counts.get(requirement.index, 0) + 1
            result.suggestions.append(checked)
