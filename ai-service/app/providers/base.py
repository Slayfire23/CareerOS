"""Provider interface. Every provider's output goes through the same validation before use."""

from typing import Protocol

from app.schemas import Finding, MatchRequest


class ProviderUnavailable(Exception):
    """The configured provider cannot run (not implemented yet, or misconfigured)."""


class MatchProvider(Protocol):
    name: str
    model: str | None  # model identifier for AI providers; None for deterministic ones
    method_version: str  # stored with every result so outputs can be traced and compared

    async def match(self, request: MatchRequest) -> list[Finding]:
        """Return one finding per requirement. Output is untrusted until validated."""
        ...
