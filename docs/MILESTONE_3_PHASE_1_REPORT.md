# Milestone 3, Phase 1 report: AI service foundation

Date: October 30, 2026. Branch: `milestone-3-ai-matching`. Commits: `74b7171` (foundation) and `dcee3a1` (verification, CI, docs, hardening). Base: `main` at `3fd846a`.
Status: **complete and awaiting owner approval.** Nothing has been pushed, merged, deployed, or migrated.

Phase 1 scope (as approved) was the Python/FastAPI foundation, configuration, provider interfaces, health checks, and tests. It contains no cloud AI calls, database migrations, matching UI, or deployment.

---

## 1. What was built

| Area | Delivered |
|---|---|
| Tooling | `ai-service/`, Python 3.13.16, uv 0.13.1 (pinned in the README, Dockerfile, and CI). `exclude-newer` limits dependencies to releases at least two weeks old; `uv.lock` is committed |
| Configuration | `AI_*` settings with startup validation (secret of 32+ characters that isn't weak). Production refuses the fake provider and disables `/docs`. Rejected values never appear in errors |
| Contract | Strict Pydantic request and response models: unknown fields are rejected, every size is capped, and evidence has a fixed kind and a `<kind>:<uuid>` id. Golden example files are in `contracts/match/` |
| Internal authentication | HMAC-SHA256 over `v1:{timestamp}:{request_id}:{sha256(body)}`, 5-minute expiry, canonical UUIDv4 request ids, replay rejection (recorded only after the signature verifies), body size limit before parsing |
| Providers | `MatchProvider` interface: a deterministic `rules` provider and a test-only `fake` provider. `anthropic` (Sonnet by default, D1) and `ollama` fail at startup until their phases |
| Validation | `validate.py` applies the same rules to every provider (§3) |
| Endpoints | `GET /health`, `GET /health/ready`, `POST /v1/match` (signed requests only) |
| Logging | Request metadata only (method, path, status, duration, length-bounded request id) |
| Container | `python:3.13-slim`, locked production-only install, non-root user (UID 10001), Docker health check, one worker, no secrets or tests in the image (68 MB) |
| CI | `.github/workflows/ai-service.yml`: SHA-pinned actions, read-only token, no secrets, `uv sync --locked`, format check, lint, tests, image build. It has not run on GitHub yet, because the branch isn't pushed |
| Docs | `ai-service/README.md`, `docs/MILESTONE_3_PLAN.md`, and updates to ARCHITECTURE.md and TASKS.md (the security follow-ups stay visible) |

The Next.js application is unchanged apart from `.gitignore` and `.vercelignore` (Vercel ignores `ai-service/`).

## 2. Test results (all run on October 30, local resources only)

| Check | Result |
|---|---|
| Python tests (`uv run pytest`) | **93 passed** (80 original plus 13 from the security review) |
| `ruff format --check`, `ruff check` | Clean |
| `uv sync --locked` (the CI install step) | Succeeds; the lockfile is current |
| Live server (uvicorn over HTTP) | Health 200, ready 200, signed match 200, replay 409, unsigned 401 |
| Docker container (production mode) | Healthy; non-root; `/docs` and `/openapi.json` return 404; the same HTTP results as above; **0 profile-text strings in the logs**; weak, short, and fake-in-production settings refused **without printing the value** |
| CI workflow YAML | Parses: 1 job, 7 steps, `contents: read` |
| Next.js TypeScript and ESLint | Passed |
| Next.js unit tests | 229 passed (17 files) |
| PostgreSQL integration (Docker, port 5433) | 25 passed |
| Playwright (local Supabase, guard enforced) | **27 passed** |
| Clean production build (fresh clone, no environment variables) | Passed (24/24 routes) |

No test used production Supabase, real user data, or any AI provider.

## 3. Rules enforced in code (not only in prompts)

1. Every citation must refer to evidence supplied in the request. Otherwise the **whole result is discarded** (502).
2. A quote must appear verbatim in the cited entry and be at least 3 characters, unless it is a whole field such as a skill named "C". Otherwise the citation is dropped, and an unsupported verdict becomes `insufficient_information`.
3. **Projects never count as professional employment.** Experience requirements without an employment citation are capped at `possible`, with a caveat. Duration totals use employment entries only, with overlapping roles merged.
4. Any number of years in an explanation ("5 years", "5-year", "five years") must match the requirement text or durations computed from the user's dates. Otherwise the verdict is downgraded.
5. A `gap` is not allowed when that part of the profile is empty.
6. Each requirement gets exactly one finding. There is no numeric score; responses only count verdicts.

The rules provider is deliberately conservative. It never claims a skills gap, and it reports a met years requirement as `possible`, because keywords cannot judge relevance.

## 4. Security review

| Area | Finding | Status |
|---|---|---|
| Secret handling | **A startup error printed the rejected secret** (Pydantic `input_value`). On a real host this would put a misconfigured production secret in platform logs | **Fixed**: `hide_input_in_errors` on settings and schemas, with tests, re-verified in the container |
| Request id | `UUID(value, version=4)` rewrites rather than validates the version, so any UUID was accepted, and the replay cache used the raw string | **Fixed**: explicit v4 and canonical-form check, with tests. Not exploitable before, because ids are covered by the signature |
| Evidence | A one-character quote could pass as verbatim evidence | **Fixed**: 3-character minimum unless the quote is a whole field |
| Duration claims | "seven years" and "7-year" escaped the duration check | **Fixed**: number words and hyphenated forms are detected |
| Logging | An unauthenticated request-id header was logged without a length limit | **Fixed**: truncated to 36 characters (HTTP headers cannot contain newlines) |
| Authentication | Constant-time comparison, expiry, replay after verification, size limit before parsing, body id bound to the signed id | No issues |
| Replay cache | In-process only; bounded at 50k entries, refuses (503) when full of fresh entries | Accepted for Phase 1. **One worker per instance** is documented and enforced in the Dockerfile |
| Errors and logs | No submitted values in responses or logs; unexpected errors return a generic 500 | No issues |
| Supply chain | Lockfile; two-week `exclude-newer`; SHA-pinned actions; CI uses `persist-credentials: false` and no secrets | No issues |
| Transport | HTTPS is not enforced by the service itself | **Phase 4**: the host must terminate TLS, and Next.js must refuse non-HTTPS `AI_SERVICE_URL` in production |

## 5. Remaining risks and limitations

- **Free-text explanations** can still contain an unsupported claim that code can't check (for example "holds a PE license" with no citation). Mitigations planned for Phase 3: the prompt forbids claims without citations, structured outputs, an evaluation set, and UI wording that labels findings as an assessment. A human review step (Agree/Disagree) arrives in Phase 2.
- **The rules engine is keyword-based.** It misses synonyms and reports "insufficient information" often. That is expected and honest; real value arrives with Phase 3.
- **The replay cache is per process.** Horizontal scaling needs shared storage, or the replay window has to be accepted per instance.
- **Clock skew** between Vercel and the AI host beyond ±5 minutes would reject requests. Both use NTP-synced platform clocks; to be monitored in Phase 4.
- **CI hasn't run on GitHub yet.** It runs on the first push.
- The **Windows uv minor-version link** couldn't be created locally (a OneDrive/junction permission issue). It's harmless, because uv uses the full interpreter path.
- **Existing items still open in TASKS.md:**
  - token expiry and refresh tests
  - crafted cross-account HTTP tests
  - used or expired email links
  - the production RLS migration
  - the leftover test-fixture check

## 6. Proposed Phase 2: Next.js integration with the rules engine (needs approval)

**Goal:** a signed-in user can run an explainable analysis of one saved job using the rules engine, review the findings, and record Agree/Disagree corrections, all against **local resources only**. No cloud AI.

**Server-only building blocks (`src/lib/ai/`)**
1. `evidence.ts`: build the evidence package from `getCurrentProfile()` and the owner-scoped job.
   - Refuse to run if the requirement review is missing or out of date.
   - Exclude email, display name, salary, location, links, career goals, and resume text.
   - Compute a profile fingerprint (SHA-256 of the canonical package).
2. `client.ts`: a signed `fetch` using the same canonical string as Python, with a 45 s timeout, typed errors, and a `crypto.randomUUID()` request id.
   - Configured by `AI_SERVICE_URL` and `AI_SERVICE_SECRET`, which are server-only and validated never to be `NEXT_PUBLIC_`.
   - Production requires `https://`.
3. `match-validation.ts`: re-validate the response, check that every cited id was in the package that was sent, and recompute the verdict counts.
4. **A shared signature test vector** (`contracts/match/signature.example.json`) checked by both pytest and Vitest, so the TypeScript and Python signing can't drift apart.

**Data (local database only; production migration later, with approval)**
- `JobMatchAnalysis`:
  - `userId`, `savedJobId` (unique; cascade on delete)
  - `requirementsVersion`, `profileFingerprint`
  - `provider`, `model`, `methodVersion`
  - `findings` and `corrections` (JSON)
  - timestamps; RLS enabled
- **Decision P2-A:** a small `AiAnalysisRun` table (`userId`, `createdAt`, `provider`, `status`, no content) to enforce the configurable **20 per user per day** limit (D9) and to keep an audit trail. The alternative is counting in `JobMatchAnalysis`, which loses re-runs.

**Actions and UI**
- `runJobMatch(jobId)`: auth → owner check → rate limit → build the package → call the service → validate → upsert. Clear errors are shown and nothing is saved on failure.
- `saveMatchCorrection(...)`: owner-scoped and checked against the analysis version.
- Page `/dashboard/jobs/[id]/match`, highlighted under "Job analysis" and linked from the requirement review and the Job analysis list. It shows:
  - verdict counts (no score)
  - findings with citations that link to the relevant profile page
  - caveats and an out-of-date banner
  - a label explaining that this is a rules-based assessment that may be wrong
- **The manual requirement review stays untouched** and keeps working when the service is down.

**Consent (D2), decision P2-B:** store `aiCloudConsentAt` on the user in Phase 2, but only **enforce** it once a cloud provider exists (Phase 3). The rules engine runs on our own service and sends nothing to a third-party AI provider.

**Local development:** run `uv run uvicorn …` beside `npm run dev`, with a local-only secret in both `.env` files.

**Tests**
- **Vitest:**
  - the evidence builder excludes PII and other users' data
  - the client signature matches the shared test vector
  - the validator rejects foreign ids and recomputes counts
  - missing configuration is handled
- **Integration (local Postgres):**
  - the analysis is owner-scoped
  - foreign jobs are rejected
  - the rate limit holds
  - out-of-date detection works
  - corrections can't touch another user's analysis
- **Playwright (local Supabase plus the local AI service running rules):**
  - run an analysis, see citations, record a correction
  - editing the job marks the analysis out of date
  - **with the AI service stopped, the manual review still works and the error is friendly**
- All existing suites and a clean no-env build still pass.

**Done when:**
- every item above is tested locally, and the existing suites still pass
- no production data or cloud calls are involved
- screenshots of the analysis page (desktop, mobile, dark) are approved by you

## 7. Decisions needed

1. **Approve Phase 1** as complete.
2. **Approve starting Phase 2** as described.
3. **P2-A:** a separate `AiAnalysisRun` table for the rate limit and audit trail (recommended).
4. **P2-B:** record consent in Phase 2 and enforce it from Phase 3 (recommended).
5. Whether to **push the branch** now so the CI workflow runs on GitHub (no merge).
