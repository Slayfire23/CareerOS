"""Service configuration, read from environment variables (prefix ``AI_``) or ``ai-service/.env``.

The service holds no database or Supabase credentials. Its only secret in Phase 1 is the shared
key Next.js uses to sign requests; provider API keys arrive with the providers that need them.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["rules", "fake", "anthropic", "ollama"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    # Shared HMAC key for Next.js -> FastAPI requests. Must be long and random.
    service_secret: SecretStr = Field(min_length=32)
    # A signed request is accepted only within this many seconds of its timestamp.
    signature_max_age_seconds: int = Field(default=300, ge=30, le=900)
    # Upper bound on request bodies, checked before parsing.
    max_body_bytes: int = Field(default=256_000, ge=1_000, le=2_000_000)

    provider: ProviderName = "rules"
    provider_timeout_seconds: float = Field(default=40.0, gt=0, le=120)
    # Recorded now so later phases have one place to change it. No cloud calls exist in Phase 1.
    anthropic_model: str = "claude-sonnet-5-5"

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    @model_validator(mode="after")
    def _guard_production(self) -> "Settings":
        if self.environment == "production" and self.provider == "fake":
            raise ValueError("The fake provider is for tests only and cannot run in production.")
        secret = self.service_secret.get_secret_value()
        if self.environment != "test" and len(set(secret)) < 16:
            raise ValueError("AI_SERVICE_SECRET looks weak; generate a random value of 32+ characters.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
