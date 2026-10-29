"""Choose the provider from configuration. Cloud and local AI providers arrive in later phases."""

from app.config import Settings
from app.providers.base import MatchProvider, ProviderUnavailable
from app.providers.fake import FakeProvider
from app.providers.rules import RulesProvider


def build_provider(settings: Settings) -> MatchProvider:
    if settings.provider == "rules":
        return RulesProvider()
    if settings.provider == "fake":
        return FakeProvider()
    if settings.provider == "anthropic":
        raise ProviderUnavailable("The Anthropic provider is planned for Phase 3 and is not implemented yet.")
    raise ProviderUnavailable("The Ollama provider is planned for Phase 5 and is not implemented yet.")
