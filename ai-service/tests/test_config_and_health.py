import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.providers.base import ProviderUnavailable
from app.providers.factory import build_provider
from app.security import MemoryReplayStore
from tests.conftest import FAKE_ANTHROPIC_KEY, make_settings

STRONG = "Zq8#xT2!pL9@vB4$nM6^kD1&hF3*wR7("
REMOTE_STORE = "rediss://replay.example.test:6380/0"


def test_secret_must_be_at_least_32_characters():
    with pytest.raises(ValidationError):
        make_settings(service_secret="short")


def test_weak_secret_rejected_outside_tests():
    with pytest.raises(ValidationError, match="weak"):
        make_settings(environment="development", service_secret="a" * 40)


def test_fake_provider_refused_in_production():
    with pytest.raises(ValidationError, match="fake provider"):
        make_settings(
            environment="production", providers="fake", service_secret=STRONG, replay_store_url=REMOTE_STORE
        )


def test_production_requires_a_shared_replay_store():
    with pytest.raises(ValidationError, match="AI_REPLAY_STORE_URL is required"):
        make_settings(environment="production", service_secret=STRONG)


def test_cloud_provider_requires_store_and_key():
    with pytest.raises(ValidationError, match="AI_REPLAY_STORE_URL is required"):
        make_settings(providers="rules,anthropic", anthropic_api_key=FAKE_ANTHROPIC_KEY)
    with pytest.raises(ValidationError, match="ANTHROPIC_API_KEY"):
        make_settings(providers="rules,anthropic", replay_store_url="redis://127.0.0.1:6379/0")
    with pytest.raises(ValidationError, match="ANTHROPIC_API_KEY"):
        make_settings(
            providers="rules,anthropic",
            replay_store_url="redis://127.0.0.1:6379/0",
            anthropic_api_key="not-a-key",
        )
    ok = make_settings(
        providers="rules,anthropic",
        replay_store_url="redis://127.0.0.1:6379/0",
        anthropic_api_key=FAKE_ANTHROPIC_KEY,
    )
    assert ok.enabled_providers == {"rules", "anthropic"}


@pytest.mark.parametrize(
    "url", ["redis://replay.example.test:6379/0", "http://127.0.0.1:6379", "memcached://127.0.0.1"]
)
def test_replay_store_must_use_tls_off_this_machine(url):
    with pytest.raises(ValidationError, match="AI_REPLAY_STORE_URL"):
        make_settings(replay_store_url=url)


def test_unknown_providers_and_other_models_are_refused():
    with pytest.raises(ValidationError, match="AI_PROVIDERS"):
        make_settings(providers="rules,gpt")
    with pytest.raises(ValidationError):
        make_settings(anthropic_model="claude-opus-5-5")  # only the approved Sonnet model


def test_ollama_is_not_available_yet():
    settings = make_settings(providers="ollama", replay_store_url="redis://127.0.0.1:6379/0")
    with pytest.raises(ProviderUnavailable, match="not implemented"):
        build_provider(settings, "ollama")
    with pytest.raises(ProviderUnavailable):
        create_app(settings)  # fails at startup, not on the first request


def test_cloud_model_defaults_to_sonnet_with_low_effort():
    settings = make_settings()
    assert (settings.anthropic_model, settings.anthropic_effort) == ("claude-sonnet-5-5", "low")
    assert settings.signature_max_age_seconds == 120


def test_health_endpoints(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").json() == {"status": "ready", "providers": ["rules"]}


def test_docs_disabled_in_production():
    settings = make_settings(environment="production", service_secret=STRONG, replay_store_url=REMOTE_STORE)
    client = TestClient(create_app(settings, replay_store=MemoryReplayStore()))
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"service_secret": "tooshort-SECRETVALUE"},
        {"environment": "development", "service_secret": "SECRETVALUE" + "a" * 30},
        {"replay_store_url": "redis://user:SECRETVALUE@replay.example.test:6379/0"},
        {
            "providers": "anthropic",
            "replay_store_url": "redis://127.0.0.1:6379",
            "anthropic_api_key": "SECRETVALUE",
        },
    ],
)
def test_rejected_secrets_never_appear_in_error_messages(overrides):
    with pytest.raises(ValidationError) as caught:
        make_settings(**overrides)
    assert "SECRETVALUE" not in str(caught.value)


def test_settings_never_print_secrets():
    settings = make_settings(
        providers="rules,anthropic",
        replay_store_url="redis://:STOREPASS@127.0.0.1:6379/0",
        anthropic_api_key=FAKE_ANTHROPIC_KEY,
    )
    text = repr(settings) + str(settings.model_dump())
    assert FAKE_ANTHROPIC_KEY not in text and "STOREPASS" not in text


def test_request_validation_errors_never_echo_values(example_request):
    from app.schemas import MatchRequest

    bad = {**example_request, "as_of_month": "PRIVATE-TEXT"}
    with pytest.raises(ValidationError) as caught:
        MatchRequest.model_validate(bad)
    assert "PRIVATE-TEXT" not in str(caught.value)


def test_production_logs_only_the_type_of_unexpected_errors(example_request, caplog):
    from tests.conftest import post_match

    class Exploding:
        name, model, method_version, local = "rules", None, "boom-v1", True

        async def match(self, request):
            raise RuntimeError("PRIVATE-PROFILE-TEXT")

    settings = make_settings(environment="production", service_secret=STRONG, replay_store_url=REMOTE_STORE)
    client = TestClient(
        create_app(settings, provider=Exploding(), replay_store=MemoryReplayStore()),
        raise_server_exceptions=False,
    )
    response = post_match(client, example_request, secret=STRONG)
    assert response.status_code == 500
    assert response.json()["error"]["billed"] == "unknown"
    assert "RuntimeError" in caplog.text and "PRIVATE-PROFILE-TEXT" not in caplog.text
