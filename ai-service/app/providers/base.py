"""Provider interface. Every provider's output goes through the same validation before use."""

from dataclasses import dataclass
from typing import Protocol

from app.schemas import Finding, MatchRequest, Usage


class ProviderUnavailable(Exception):
    """The configured provider cannot run (not implemented yet, or misconfigured)."""


@dataclass(frozen=True)
class ProviderOutput:
    findings: list[Finding]  # untrusted until validated
    usage: Usage | None = None
    provider_request_id: str | None = None


class MatchProvider(Protocol):
    name: str
    model: str | None  # model identifier for AI providers; None for deterministic ones
    method_version: str  # stored with every result so outputs can be traced and compared
    local: bool  # True when the provider runs here and costs nothing (rules, fake)

    async def match(self, request: MatchRequest) -> list[Finding] | ProviderOutput:
        """Return one finding per requirement. Output is untrusted until validated.

        Cloud providers raise ``ServiceError`` with an accurate ``billed`` value on failure.
        """
        ...
