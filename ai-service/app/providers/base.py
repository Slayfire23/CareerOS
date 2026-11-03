"""Provider interface. Every provider's output goes through the same validation before use."""

from dataclasses import dataclass
from typing import Protocol

from app.schemas import Finding, MatchRequest, Suggestion, Usage


class ProviderUnavailable(Exception):
    """The configured provider cannot run (not implemented yet, or misconfigured)."""


@dataclass(frozen=True)
class ProviderOutput:
    findings: list[Finding]  # untrusted until validated
    usage: Usage | None = None
    provider_request_id: str | None = None
    suggestions: list[Suggestion] | None = None  # AI suggestions; never change findings
    ai_assist: str | None = None


class MatchProvider(Protocol):
    name: str
    model: str | None  # model identifier for AI providers; None for deterministic ones
    method_version: str  # stored with every result so outputs can be traced and compared
    local: bool  # True when it runs on CareerOS-controlled hardware and costs nothing (rules, fake, ollama)
    generative: bool  # True for language models: their output is always strictly validated

    async def match(self, request: MatchRequest) -> list[Finding] | ProviderOutput:
        """Return one finding per requirement. Output is untrusted until validated.

        Cloud providers raise ``ServiceError`` with an accurate ``billed`` value on failure.
        """
        ...
