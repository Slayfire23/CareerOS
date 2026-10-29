import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.providers.base import ProviderUnavailable
from app.providers.factory import build_provider
from tests.conftest import make_settings


def test_secret_must_be_at_least_32_characters():
    with pytest.raises(ValidationError):
        make_settings(service_secret="short")


def test_weak_secret_rejected_outside_tests():
    with pytest.raises(ValidationError, match="weak"):
        make_settings(environment="development", service_secret="a" * 40)


def test_fake_provider_refused_in_production():
    with pytest.raises(ValidationError, match="fake provider"):
        make_settings(
            environment="production", provider="fake", service_secret="Zq8#xT2!pL9@vB4$nM6^kD1&hF3*wR7("
        )


@pytest.mark.parametrize("name", ["anthropic", "ollama"])
def test_future_providers_are_not_available_yet(name):
    settings = make_settings(provider=name)
    with pytest.raises(ProviderUnavailable, match="not implemented"):
        build_provider(settings)
    with pytest.raises(ProviderUnavailable):
        create_app(settings)  # fails at startup, not on the first request


def test_cloud_model_defaults_to_sonnet():
    assert make_settings().anthropic_model == "claude-sonnet-5-5"


def test_health_endpoints(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").json() == {"status": "ready", "provider": "rules"}


def test_docs_disabled_in_production():
    settings = make_settings(environment="production", service_secret="Zq8#xT2!pL9@vB4$nM6^kD1&hF3*wR7(")
    client = TestClient(create_app(settings))
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/health").status_code == 200
