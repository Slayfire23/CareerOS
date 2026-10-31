# Milestone 3, Phase 3 report: Anthropic provider (development complete, live evaluation pending)

Date: October 31, 2026. Branch: `milestone-3-ai-matching`, local commits only.

**Nothing has been pushed, merged, or deployed. No production migration has been applied. No paid Anthropic call has been made.** Every cloud code path was tested against mocked API responses or the local mock API, using fictional data.

## What was built

| Area | Change |
| --- | --- |
| Verification | The model ID, structured outputs, error behavior, spend limits, and pricing were checked against Anthropic's official documentation before the provider was written (docs/ANTHROPIC_VERIFIED_FACTS.md). Corrections versus the plan: a spend limit set in the Console returns **400**, not 402; cache reads for Sonnet 5.5 are **$0.10**/MTok. |
| CI | `.github/workflows/app.yml` checks the Next.js app:<br>• types, lint, unit tests, a build with no env, and a secret check<br>• fresh-Postgres migrations, a shadow-database replay and drift check, and integration tests<br>• the full browser suite against local Supabase, on pull requests<br>The AI service workflow gains a Valkey service. Actions are pinned to commit SHAs and no secrets are used. |
| Flaky test | `e2e/location-preferences.spec.ts` failed because typing raced React hydration. `openPage` now waits for forms to hydrate. 10 of 10 repeats pass. |
| Failed-run limits | Failures that never reached an analysis don't use up the daily limit. An attempt cap (3× the daily limit) counts every run. Runs still in flight count toward both limits. Runs abandoned by a crash are closed on the next reservation. |
| Replay protection | Shared Redis-compatible store (`SET NX EX`) that fails closed: if it's unreachable, the request is refused before any provider is called. Required for cloud providers and in production, with TLS off this machine. The signature window is now 120 s. Hosting options and costs are in docs/REPLAY_STORE_OPTIONS.md. |
| Contract v2 | Each signed request names its provider and, for cloud, a token budget. Responses and errors carry usage, the provider request id, and `billed` (no, yes, or unknown). The evidence contract now refuses `company` and `institution` fields outright. |
| Cost ledger | New `AiAnalysisRun` columns: billing state, reserved and confirmed micro-USD, token counts, provider request id. Migration `20261031010000_ai_cost_ledger` is applied to local databases only. CHECK constraints keep the states consistent; a held state can never carry a confirmed amount. |
| Budgets | Per-user daily ($1), global daily ($3), and global monthly ($25) caps, checked under advisory locks before every cloud call, plus the count limits. Unresolved charges stay held against the caps until reconciled. |
| Redaction | Before any cloud call, free text is stripped of:<br>• the profile name<br>• employers, schools, and the saved job's company<br>• the account email<br>• any email address, phone number, or link<br>Dates and durations survive. The "profile changed" fingerprint still uses the unredacted profile. |
| Provider | Claude Sonnet 5.5 (`claude-sonnet-5-5`) with structured output and low effort. No sampling parameters, no forced tools, no fallback model.<br>• One billable call per request.<br>• `stop_reason` is checked first.<br>• A circuit breaker stops calls after repeated failures.<br>• Strict validation: any overreaching finding discards the whole response.<br>• SDK request-body logging is suppressed. |
| Consent and UI | Versioned consent with exact lists of what is and isn't sent, and grant/withdraw. The rules engine stays the default and a separate choice. The cloud option is offered only to allow-listed accounts and stays blocked until consent is given. Results and run history name the method used. Screenshots are in `CareerOS/docs/screenshots/milestone-3-phase-3/`. |
| Local mock | `ai-service/devtools/mock_anthropic.py` stands in for the Messages API locally, for browser tests. Playwright refuses to run if the AI service could reach a real provider. |
| Evaluation | `ai-service/evals/`: 16 fictional cases and a harness with four modes:<br>• rules baseline, mock, and replay: offline<br>• live: guarded, and not run |

## Test results (all local)

| Check | Result |
| --- | --- |
| Python (AI service) | **152 passed**, including real-Valkey tests and a full SDK round trip against the mock; ruff clean |
| TypeScript, ESLint | Clean |
| Unit (Vitest) | **304 passed** (31 new cloud tests: pricing, redaction, configuration, consent, validation, billing classification) |
| Integration (local Postgres) | **69 passed** (19 new cloud tests, plus 6 line-ending tests from Phase 2) |
| Browser (Chromium) | **29 passed**, including the new consent and cloud-run test through the real AI service and SDK against the mock |
| Migrations | All 13 replay into a fresh shadow database with no drift; local databases up to date |
| Secret check | Passed on all tracked files; it catches planted keys, database passwords, and env files |
| Docker image | Builds; contains `app/` only (no mock, no evals); non-root user |
| Clean clone build | Passed on `bea27cc` with no environment variables (`prisma generate` + `next build`) |

Key concurrency results:
- **Global cap:** 25 simultaneous cloud requests from five users, with every call ending "billed: unknown". Exactly ⌊cap ÷ reservation⌋ runs were reserved, the total held never exceeded the cap, and the API was called only for reserved runs.
- **Outage storm:** 25 simultaneous requests during an outage never created more runs than the attempt cap.

Repeated three times with the same results.

## Security review

Verified by tests or inspection:
- **The Anthropic key never leaves the AI service environment.**
  - Next.js has no Anthropic configuration.
  - CI has no key.
  - The secret scanner blocks key patterns, and tests assert the key never appears in settings output or logs.
  - The only key in local files is a fictional one that the mock accepts and the real API would reject.
- **No paid call is possible from tests.**
  - Python tests unset credentials and fail on any non-local DNS lookup or connection.
  - Playwright refuses to run if the AI service could reach a real provider.
  - Integration tests use an in-process fake service.
- **What leaves CareerOS for the cloud:**
  - only reviewed requirement text and minimized, redacted profile evidence
  - never the job description, names, company or school fields, contact details, resumes, salary, or location
- **Isolation is unchanged:**
  - owner-scoped queries and composite foreign keys
  - cross-account runs return `not_found`
  - consent actions act on the signed-in user only
- **Validation stays strict in both services.** Any overreach discards the response, and a model or provider other than the one requested is rejected.
- **Logs carry metadata only:**
  - SDK DEBUG logging, which would include request bodies, is pinned off.
  - In production, unexpected errors log the exception type only. This was found and fixed in this review.
- **Concurrency-safe:** limits and budgets are enforced inside locked transactions.

Remaining concerns:
1. **Redaction catches known values and patterns, not every name.** It can't recognize other people's names, or client and company names that aren't in the user's own records, written into free text. The consent screen says what is sent. A stronger option would be a review step showing the redacted text before sending.
2. **CI workflows haven't run on GitHub.** The branch wasn't pushed, as instructed. Every job's commands were run locally, but `app.yml` is unverified on GitHub runners; the e2e job (Supabase CLI in CI) carries the most risk.
3. **Unresolved charges need an operator.** They are held until someone reconciles them (`reconcileUnresolvedRun`). A user can reach the per-user cap through unresolved holds. Production needs a reconciliation procedure and alerting (Phase 4).
4. **Two weaker guarantees:**
   - The AI service enforces per-request budgets, but only Next.js enforces the global caps. A stolen signing secret could bypass them, so the Console spend limit is the only hard backstop then.
   - The SDK is 1.13 (an older API version; it sends no sampling parameters anyway). Upgrade to 2.x deliberately later.

## Deployment readiness

**Not ready for production deployment**, and it isn't requested yet. Blockers, each needing your approval:
1. Live evaluation results (proposal below).
2. Phase 4 hosting choice for the AI service, plus a managed Redis-compatible store (Upstash recommended at about $0/month at expected volume).
3. Production migrations, in order:
   - `20261028010000_enable_row_level_security`
   - `20261030010000_ai_analysis`
   - `20261031010000_ai_cost_ledger`
4. Secrets in the hosts' secret stores. The Anthropic key goes only into the AI service host, in a dedicated workspace with the $30 Console spend limit.
5. GitHub Actions passing on the pushed branch (needs your approval to push).
6. Vercel function duration confirmed at 45 seconds or more for the analysis server action.
7. Reconciliation procedure and alerts for unresolved charges and the circuit breaker.
8. A review of Anthropic's current commercial data terms against the consent text.

The cloud provider stays disabled by default everywhere. Production would start with the allow-list containing only your account.

## Proposed live evaluation (needs your approval; not started)

| Item | Proposal |
| --- | --- |
| Model | `claude-sonnet-5-5` (Claude Sonnet 5.5), effort `low`, `max_tokens` 6,000, structured output, no caching, no fallback |
| Verified pricing | $2 per million input tokens, $10 per million output tokens; thinking tokens are billed as output (Anthropic pricing and thinking docs, checked October 30, 2026) |
| Cases | The 16 fictional cases in `ai-service/evals/cases.json`, plus a generated contract-maximum case (50 requirements, 200 evidence entries) |
| Runs | 3 per case (48 calls) to measure variation |
| Criteria | • Responses rejected by validators ≤ 5%<br>• **0** false "supported"<br>• **0** injection cases that change a verdict<br>• Verdict agreement ≥ 80% (reported per verdict)<br>• p95 latency ≤ 30 s<br>• Mean cost ≤ $0.06 per analysis<br>• Variation across the 3 runs reported |
| Maximum possible cost | **$3.69**: every call at its worst case (the byte bound on input plus the full 6,000 output tokens). Typical cost is expected to be well under that. The harness stops before any call whose worst case would exceed the approved amount. |
| Proposed approval | Runner cap **$4.00**, and an evaluation-workspace Console spend limit of **$10** as the backstop |
| Credentials | You create an Anthropic Console workspace (for example `careeros-eval`) with a $10 workspace spend limit, and an API key in that workspace. Set it only in your shell session as `EVAL_ANTHROPIC_API_KEY`: not in any file, not in CI, not in `ai-service/.env`. Revoke it after the run. |
| Infrastructure | Nothing new. It runs locally from `ai-service/`: `uv run python -m evals.run_eval --mode live --runs 3 --approve-spend-usd 4 --confirm-live --report evals/recordings/report.json`. Recordings (fictional data plus model output) stay in the git-ignored `evals/recordings/` until you review them; they can then be replayed for free. |
| Remaining concerns | • Typing the key into a command line can land it in shell history; set it through a prompt, then clear it.<br>• Anthropic processes only fictional data in this run.<br>• The results are judged against labels written for this test; a passing run is necessary, not sufficient, for production. |

The rules baseline, run offline for comparison, agrees on 95.7% of verdicts. It has **1 false "supported"**: it ignores proficiency, so "Expert-level Java" with a beginner skill comes back as supported. It also misses synonyms (Postgres vs PostgreSQL). These are known keyword-rule limits, now measured.
