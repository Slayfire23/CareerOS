# CareerOS AI service

A small, stateless FastAPI service that compares a saved job's **user-confirmed requirements** with
**evidence from the user's own CareerOS profile**. It returns an explained verdict for each
requirement, with citations to exact profile entries.

**Phase 1 status (Milestone 3):** foundation only.
- The only real provider is a deterministic **rules engine**. There are **no cloud or local AI
  calls**: the Anthropic provider is planned for Phase 3 and Ollama for Phase 5.
- The Next.js app doesn't call this service yet (Phase 2).
- Not deployed anywhere.

See [`docs/MILESTONE_3_PLAN.md`](../docs/MILESTONE_3_PLAN.md) for the full plan.

## How it fits into CareerOS

```
Browser → Next.js (auth + owner-scoped data) → signed HTTPS request → AI service → validated findings
```

- **Next.js stays the security boundary.** It checks the session, loads only the signed-in
  user's job and profile, and sends a minimal evidence package.
- **This service holds no database or Supabase credentials and never learns who the user is.**
  It can only see what Next.js sends in each request.
- **Requests are signed** with a shared secret (HMAC-SHA256) over the timestamp, a unique request
  ID, and a hash of the body:
  - requests older than 5 minutes are rejected
  - reused request IDs are rejected (replay protection)
- **Every provider's output is validated in code** before it's returned. Rules in
  `app/matching/validate.py`:
  - every citation must refer to evidence that was sent, and quote it word for word (at least
    three characters, unless the quote is a whole field such as a skill named "C")
  - projects never count as professional employment
  - any stated number of years must match the dates provided
  - a "gap" isn't allowed when that part of the profile is empty
  - anything that fails is downgraded, or the whole result is discarded
- **No numeric fit score.** The response includes counts per verdict only.

## Requirements

- **Python 3.13**, managed by [uv](https://docs.astral.sh/uv/). The project pins **uv 0.13.1**,
  which is also what CI and the Dockerfile use.
- **Docker** (optional), to build and run the container.

```powershell
py -m pip install --user uv==0.13.1   # or any uv install method, same version
uv python install 3.13
```

## Setup

From `ai-service/`:

```powershell
uv sync                    # creates .venv from uv.lock (includes dev tools)
copy .env.example .env     # then set AI_SERVICE_SECRET
uv run python -c "import secrets; print(secrets.token_urlsafe(48))"   # generate a secret
```

`.env` is ignored by Git. Never commit real secrets or reuse a production secret locally.

### Environment variables

All variables use the `AI_` prefix and are read from the environment or `ai-service/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `AI_SERVICE_SECRET` | *(required)* | Shared HMAC key used by Next.js to sign requests. At least 32 random characters; weak values are refused outside tests |
| `AI_ENVIRONMENT` | `development` | `development`, `test`, or `production`. Production disables `/docs` and `/openapi.json` and refuses the `fake` provider |
| `AI_PROVIDER` | `rules` | `rules` (deterministic) or `fake` (tests only). `anthropic` and `ollama` fail at startup until their phases |
| `AI_SIGNATURE_MAX_AGE_SECONDS` | `300` | How old a signed request may be (30–900) |
| `AI_MAX_BODY_BYTES` | `256000` | Request size limit, checked before parsing |
| `AI_PROVIDER_TIMEOUT_SECONDS` | `40` | Time allowed for the provider before a 504 |
| `AI_ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Reserved for Phase 3. Nothing calls it yet |
| `AI_LOG_LEVEL` | `INFO` | Log level. Logs contain request metadata only, never profile or job text |

Settings errors never print the rejected value: `hide_input_in_errors` is enabled, and a test
covers it.

## Run locally

```powershell
uv run uvicorn app.main:app_factory --factory --reload --port 8000
```

- **Health:** `GET http://127.0.0.1:8000/health` returns `{"status":"ok"}`.
- **Readiness:** `GET /health/ready` returns `{"status":"ready","provider":"rules"}`.
- **API docs:** in development only, at http://127.0.0.1:8000/docs.

### Calling `POST /v1/match`

Every request needs these headers:

```
X-CareerOS-Timestamp:  <unix seconds>
X-CareerOS-Request-Id: <new UUIDv4 per request; must equal request_id in the body>
X-CareerOS-Signature:  v1=<hex HMAC-SHA256(secret, "v1:{timestamp}:{request_id}:{sha256_hex(body)}")>
```

The body follows `app/schemas.py`. A complete example request and the expected rules response are
in [`contracts/match/`](../contracts/match/). Both the Python and the future TypeScript tests use
those files. The `sign()` helper in `app/security.py` shows the exact signing steps.

| Status | Meaning |
|---|---|
| 200 | Validated findings |
| 400 | Body `request_id` doesn't match the signed ID |
| 401 | Missing, invalid, or expired signature |
| 409 | Request ID already used (replay) |
| 413 | Body too large |
| 422 | Invalid fields. Field names only; values are never echoed |
| 502 | Provider output failed validation and was discarded |
| 504 | Provider timed out |

All errors share one shape: `{"error": {"code", "message"}}`.

## Docker

```powershell
docker build -t careeros-ai-service .
docker run --rm -p 127.0.0.1:8000:8000 -e AI_SERVICE_SECRET=<secret> careeros-ai-service
```

- **Runtime:** `python:3.13-slim` with a locked, production-only install, running as the non-root
  user `service` (UID 10001).
- **Configuration:** `AI_ENVIRONMENT=production` is set by default. Secrets are passed at runtime
  and never built into the image, and the image includes no tests.
- **Health:** a Docker `HEALTHCHECK` calls `/health`.
- **One worker per container**, because the replay cache is in-process (see Limitations).

## Tests and checks

```powershell
uv run pytest -q             # unit, security, contract and API tests (no network, no AI, no Supabase)
uv run ruff format --check .
uv run ruff check .
```

CI runs the same steps plus a Docker build in
[`.github/workflows/ai-service.yml`](../.github/workflows/ai-service.yml). It runs on pushes and
pull requests that touch `ai-service/` or `contracts/`, with no secrets.

| Test file | Covers |
|---|---|
| `test_config_and_health.py` | Settings validation, secret handling, production guards, health endpoints, future providers refused |
| `test_security.py` | Valid signatures, missing headers, wrong secret, tampered body, expiry, replay, forged IDs can't use up a request ID, size limit |
| `test_schemas_and_evidence.py` | Contract validation, values never echoed, duration maths, phrase matching, verbatim quotes |
| `test_rules.py` | Rules engine verdicts, projects never counted as employment, degree levels, rules output always passes validation |
| `test_validation_and_api.py` | Validator rules against deliberately bad provider output, the golden contract response, timeouts |

## Project layout

```
app/
  main.py            app factory, endpoints, metadata-only access log
  config.py          settings (AI_* environment variables)
  security.py        request signing, expiry, replay cache, body size limit
  errors.py          error shape and handlers
  schemas.py         request/response contract (Pydantic, unknown fields rejected)
  matching/
    evidence.py      durations, phrase matching, citable text per evidence kind
    validate.py      code-enforced rules applied to every provider
    service.py       timeout → validate → response
  providers/
    base.py          provider interface
    rules.py         deterministic keyword and date rules
    fake.py          scripted provider for tests
    factory.py       picks the provider from AI_PROVIDER
tests/               pytest suite
```

Since Phase 2 the Next.js app calls this service from the requirement analysis page and re-validates every response itself (src/lib/ai/). contracts/match/signature.example.json is a shared signing vector checked by both test suites.

## Known limitations

- **The replay cache is per process.** Run one worker per instance, or move the cache to shared
  storage (for example Redis) before scaling out.
- **The rules engine is keyword-based.**
  - It can't recognize synonyms.
  - It never reports a skills "gap", because keywords can't prove something is absent.
  - It caps a met years-of-experience requirement at "possible", because it can't judge relevance.
- **Raw resume text isn't used** (decision D5). Only confirmed profile entries count as evidence.
