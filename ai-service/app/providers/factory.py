"""Build the enabled providers from configuration."""

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
    if name == "ollama":
        from app.providers.ollama import OllamaProvider

        return OllamaProvider(settings)
    if name == "hybrid":
        from app.providers.hybrid import HybridProvider

        return HybridProvider(settings)
    raise ProviderUnavailable(f"Unknown provider {name}.")


def build_providers(settings: Settings) -> dict[str, MatchProvider]:
    return {name: build_provider(settings, name) for name in sorted(settings.enabled_providers)}
