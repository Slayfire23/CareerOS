"""Service configuration, read from environment variables (prefix ``AI_``) or ``ai-service/.env``.

The service holds no database or Supabase credentials. Its secrets are the shared key Next.js
uses to sign requests, the replay store URL (which may contain a password), and, only when the
Anthropic provider is enabled, ``ANTHROPIC_API_KEY``. None of them is ever logged or echoed.
"""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["rules", "fake", "anthropic", "ollama"]
PROVIDER_NAMES: tuple[str, ...] = ("rules", "fake", "anthropic", "ollama")
LOCAL_PROVIDERS = frozenset({"rules", "fake"})
# Only this model is approved (decision D1). Changing it needs a reviewed code change.
ApprovedAnthropicModel = Literal["claude-sonnet-5-5"]


class Settings(BaseSettings):
    # hide_input_in_errors: a rejected value (such as a short secret) must never appear in error output.
    model_config = SettingsConfigDict(
        env_prefix="AI_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )

    environment: Literal["development", "test", "production"] = "development"

    # Shared HMAC key for Next.js -> FastAPI requests. Must be long and random.
    service_secret: SecretStr = Field(min_length=32)
    # A signed request is accepted only within this many seconds of its timestamp.
    signature_max_age_seconds: int = Field(default=120, ge=30, le=900)
    # Upper bound on request bodies, checked before parsing.
    max_body_bytes: int = Field(default=256_000, ge=1_000, le=2_000_000)

    # Comma-separated providers this instance serves; each request names one of them.
    providers: str = "rules"
    provider_timeout_seconds: float = Field(default=35.0, gt=0, le=120)

    # Shared replay store (redis:// locally, rediss:// elsewhere). Required for cloud providers
    # and in production; without it a per-process memory store is used.
    replay_store_url: SecretStr | None = None

    anthropic_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("ANTHROPIC_API_KEY", "anthropic_api_key")
    )
    anthropic_model: ApprovedAnthropicModel = "claude-sonnet-5-5"
    anthropic_effort: Literal["low", "medium", "high"] = "low"
    # Development and tests only: send Anthropic requests to a local mock API instead (no cost).
    anthropic_base_url: str | None = None
    # Hard ceilings; each request also carries its own (lower or equal) budget from Next.js.
    anthropic_max_input_tokens: int = Field(default=40_000, ge=1_000, le=200_000)
    anthropic_max_output_tokens: int = Field(default=6_000, ge=1_000, le=32_000)

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    @property
    def enabled_providers(self) -> frozenset[str]:
        return frozenset(p.strip() for p in self.providers.split(",") if p.strip())

    @model_validator(mode="after")
    def _guard(self) -> "Settings":
        enabled = self.enabled_providers
        if not enabled or not enabled <= set(PROVIDER_NAMES):
            raise ValueError("AI_PROVIDERS must list one or more of: rules, fake, anthropic, ollama.")
        if self.environment == "production" and "fake" in enabled:
            raise ValueError("The fake provider is for tests only and cannot run in production.")
        secret = self.service_secret.get_secret_value()
        if self.environment != "test" and len(set(secret)) < 16:
            raise ValueError("AI_SERVICE_SECRET looks weak; generate a random value of 32+ characters.")

        cloud = enabled - LOCAL_PROVIDERS
        if (cloud or self.environment == "production") and self.replay_store_url is None:
            raise ValueError("AI_REPLAY_STORE_URL is required for cloud providers and in production.")
        if self.replay_store_url is not None:
            parts = urlsplit(self.replay_store_url.get_secret_value())
            local = parts.hostname in {"127.0.0.1", "localhost", "::1"}
            if parts.scheme not in {"redis", "rediss"} or (not local and parts.scheme != "rediss"):
                raise ValueError(
                    "AI_REPLAY_STORE_URL must be redis:// on this machine or rediss:// (TLS) elsewhere."
                )
        if self.anthropic_base_url is not None:
            base = urlsplit(self.anthropic_base_url)
            if self.environment == "production" or base.hostname not in {"127.0.0.1", "localhost", "::1"}:
                raise ValueError("AI_ANTHROPIC_BASE_URL is for a local mock API outside production only.")
        if "anthropic" in enabled:
            key = self.anthropic_api_key.get_secret_value() if self.anthropic_api_key else ""
            if not key.startswith("sk-ant-") or len(key) < 40:
                raise ValueError("ANTHROPIC_API_KEY is missing or malformed.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
