"""Build the enabled providers from configuration. Ollama arrives in a later phase."""

from app.config import Settings
from app.providers.base import MatchProvider, ProviderUnavailable
from app.providers.fake import FakeProvider
from app.providers.rules import RulesProvider


def build_provider(settings: Settings, name: str) -> MatchProvider:
    if name == "rules":
        return RulesProvider()
    if name == "fake":
        return FakeProvider()
    if name == "anthropic":
        from app.providers.anthropic import AnthropicProvider

        return AnthropicProvider(settings)
    raise ProviderUnavailable("The Ollama provider is planned for Phase 5 and is not implemented yet.")


def build_providers(settings: Settings) -> dict[str, MatchProvider]:
    return {name: build_provider(settings, name) for name in sorted(settings.enabled_providers)}
