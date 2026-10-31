# Milestone 3, Phase 2 report: Next.js integration with the rules engine

Date: October 30, 2026. Branch: `milestone-3-ai-matching`. Status: ready for owner review. Not merged, not deployed, and no production migration applied.

## Summary

Signed-in users can now open **Requirement analysis** for a saved job whose requirements they have reviewed (`/dashboard/jobs/[id]/match`). Next.js sends the user's confirmed profile and reviewed requirements, with personal details removed, to the local AI service. The service runs the deterministic rules provider. Next.js then validates the result again before saving and showing it.

| Area | Where | What it does |
| --- | --- | --- |
| Configuration | `src/lib/ai/config.ts` | Reads `AI_SERVICE_URL`, `AI_SERVICE_SECRET` (32+ chars), `AI_ANALYSIS_PROVIDER` (only `rules` accepted), `AI_ANALYSIS_DAILY_LIMIT` (default 20, 1–1000). Requires HTTPS except on localhost; rejects URLs containing credentials, a query, or a fragment. If any setting is missing or unsafe, analysis is turned off. |
| Signing | `src/lib/ai/signing.ts` | HMAC-SHA256 over `v1:{timestamp}:{request_id}:{sha256(body)}`. A shared vector in `contracts/match/signature.example.json` is checked by both the TypeScript and Python tests. |
| Evidence builder | `src/lib/ai/evidence.ts` | Builds evidence from the owner's own profile only. Skips company, institution, links, email, name, salary, location, and resume text. Blank text becomes null, ids are prefixed by kind, and evidence is capped at 200 entries. Also computes a SHA-256 fingerprint of the evidence. |
| Client | `src/lib/ai/client.ts` | 45-second timeout, follows no redirects, caches nothing. Turns every failure into a safe error code. |
| Validation | `src/lib/ai/match-validation.ts` | Rejects the whole response for any of these: unknown or foreign citations, quotes that aren't verbatim or are too short, projects counted as employment or cited without the caveat, unverified durations, a gap reported for an empty profile area, missing or duplicate findings, wrong counts, a disallowed provider, or a mismatched request id. |
| Workflow | `src/lib/ai/analysis.ts` | Checks ownership and that the requirement review is current. Applies the consent gate (non-local providers only). Builds the evidence, reserves a run under the daily limit, makes the signed call, validates, then saves the result and the run status in one transaction. Also handles versioned feedback. |
| Server actions | `src/app/jobs/match-actions.ts` | Session check through `supabase.auth.getUser()`, strict parsing of form input, and user-friendly messages. |
| UI | `src/app/dashboard/jobs/[id]/match/page.tsx`, `src/components/job-match.tsx` | Readiness notice and a run card with remaining runs and a "What is sent" panel. Shows verdict-count tiles labelled "not a fit score", findings with verdict pills and cited evidence linked to profile pages, caveats, out-of-date banners, Agree/Disagree/Clear with an optional note, and recent runs. Links to the page were added from Job analysis, the overview, and the requirement review page. |

The manual requirement review never calls the AI service. With the service stopped, `e2e/job-requirements.spec.ts` passed. On the analysis page, running an analysis then shows: "The analysis service is unavailable. Your saved requirements are unaffected; try again later."

## Database schema changes (local databases only)

Migration `prisma/migrations/20261030010000_ai_analysis/migration.sql` has been applied to local Supabase and the local integration-test database only. Prisma reports no drift between the schema and the database.

- `User.aiCloudConsentAt timestamptz NULL`: consent timestamp, needed before any non-local provider can run.
- `SavedJob`: new unique `(id, userId)`, which the composite owner foreign keys reference.
- New enum `AiAnalysisStatus` with values STARTED, SUCCEEDED, FAILED.
- New table `AiAnalysisRun`, holding metadata only:
  - Columns: `id`, `userId`, `savedJobId` (set to null when the job is deleted, so audit rows survive), `status`, `provider`, `errorCode`, `startedAt`, `finishedAt`.
  - Foreign key `(savedJobId, userId) → SavedJob(id, userId)`.
  - CHECK constraints: the status must match `finishedAt` and `errorCode`; `errorCode` must match `^[a-z_]{1,60}$`.
  - Indexes on `(userId, startedAt)` and `(savedJobId, startedAt)`.
- New table `JobMatchAnalysis`:
  - Columns: the requirements sent, findings, verdict counts, the evidence fingerprint (not the profile itself), the requirement review version, provider, method version, `feedback` JSON, and `feedbackVersion`.
  - Foreign keys `(savedJobId, userId) → SavedJob` and `(runId, userId) → AiAnalysisRun`, with one analysis per run.
  - CHECK constraints on the JSON shapes and the fingerprint format.
- Row-level security is enabled on both new tables, with no policies. That matches the existing tables: only the server's database role can read them, never the Supabase public API.

## Test results

All tests ran against local resources only. No test touched production Supabase or any cloud AI provider.

| Check | Result |
| --- | --- |
| Python (ai-service) | 94 pytest passed; ruff lint and format clean |
| GitHub Actions, AI service workflow | Passed on `aede6b3` (https://github.com/Slayfire23/CareerOS/actions/runs/41166733968) |
| TypeScript, ESLint | Clean |
| Unit (Vitest) | 271 passed (42 new: signing vector, config, evidence minimization, 14 validator rejections, client error mapping) |
| Integration (local Postgres) | 45 passed (20 new; see below) |
| Browser (Chromium) | 28 passed, including the new `e2e/job-match.spec.ts` |
| Production build | Fresh clone, no environment variables, `prisma generate` + `next build`: passed |

The new integration tests cover:
- owner scoping and metadata-only audit rows
- cross-account refusal, and no evidence leaking between users
- unreviewed, out-of-date, and empty requirement reviews
- service down, malformed response, foreign citation, non-rules provider, and a 502 from the service
- **25 concurrent requests against a limit of 20: exactly 20 succeed and 5 are refused**
- the rolling 24-hour window and a lower configured limit
- feedback version conflicts and ownership
- out-of-date detection, the consent gate, and the "not configured" state
- database constraints, and audit rows surviving job deletion
- server actions refusing signed-out callers, malformed input, and other users' ids

Replay rejection is tested in the Python suite; the service answers a replayed request with HTTP 409.

The browser test reviews a new job and runs the analysis. It then checks:
- a Supported finding with its citation
- a Not enough information finding
- that Agree survives a reload
- that account B gets a 404
- that editing the job shows out-of-date notices and disables the run button
- that signed-out users are redirected to `/login`

## Security findings and remaining risks

Fixed or enforced in Phase 2:
- **Ownership is enforced twice:**
  - in code, through owner-scoped queries keyed by the verified Supabase user
  - in the database, through composite foreign keys that prevent cross-user links even if the code had a bug
- **A compromised or faulty AI service can't make Next.js store invented evidence**, because the whole response is checked again.
- **Logs and audit rows carry no profile or job text.** Run rows store only status, provider, error code, and times.
- **Only the rules provider can be enabled.** The consent gate is tested for any future cloud provider.
- **Playwright refuses to run against a non-local `AI_SERVICE_URL`.**

Remaining risks and items that need your decision:
1. **Pre-existing migration issue (approval needed).** Migration `20261028010000_enable_row_level_security` enables RLS on `_prisma_migrations`. That table doesn't exist when Prisma replays migrations into its temporary shadow database, so `prisma migrate dev` fails. Production `migrate deploy` is not affected. I generated Phase 2's migration with `prisma migrate diff` instead. A fix (for example, guarding that statement with `IF EXISTS`) would change a merged migration that hasn't yet been applied to production.
2. **Fixed in the stabilization pass:** jobs whose description has LF line endings couldn't be re-reviewed. See below.
3. **The AI service's replay cache is in-process.** Production must run one worker and one instance until the cache is shared; see below.
4. **Failed runs count toward the daily limit.** A change is recommended below; it hasn't been made.
5. **The rules engine is keyword-based.** It can't recognize synonyms and never reports a skills gap. The UI says so.
6. **The open foundation security follow-ups in TASKS.md still apply.** Also still pending your approval: the production RLS migration, and a check of production Storage for leftover test fixtures.

## Stabilization pass - October 30, 2026

### 1. RLS migration replay failure (investigated; no change made)

- **Cause:** I reproduced it by replaying every migration into an empty throwaway database on the local test server. Only one statement fails: `ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY` in `20261028010000_enable_row_level_security`, with `relation "_prisma_migrations" does not exist`.
  - Prisma's shadow database replays migration files without its bookkeeping table, so `prisma migrate dev` can't create new migrations.
  - `prisma migrate deploy` is not affected, because it creates that table first. Production, local Supabase, and the test database are all fine.
- **Recommended fix (needs your approval):** in that one migration file, replace the single statement with a guarded block:
  ```sql
  DO $ BEGIN
    IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
      ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
    END IF;
  END $;
  ```
  - I tested it in the throwaway database: it replays cleanly when the table is absent, and still enables RLS when the table exists. Every later migration, including `20261030010000_ai_analysis`, then applies.
  - **Why now is the safest time:** production hasn't applied this migration yet, so editing it changes no applied history there.
  - **Side effect on local machines:** local databases that already applied the original would show it as "modified" in `prisma migrate dev`. The fix there is to reset local data, or to update that row's checksum, which is local only.
  - **Alternative that leaves history untouched:** leave the file as it is and keep creating migrations with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, as Phase 2 did. That works but stays fragile for anyone using `migrate dev`.
- I haven't modified the merged migration.

### 2. Job-description line endings (fixed)

- **Cause:** browsers submit form text with CRLF line endings. The requirement review required the submitted description to equal the stored one exactly, so a job stored with LF endings could never be reviewed again.
- **Change:**
  - `sameDescription()` in `src/lib/saved-jobs.ts` compares two descriptions with CR, LF, and CRLF treated alike.
  - `saveRequirements` (`src/app/jobs/requirements-actions.ts`) loads the owner's job, compares descriptions with `sameDescription`, and records the **stored** text exactly as `reviewedDescription`. The update still requires the exact stored description and review version, so concurrent edits are still refused.
  - `saveJob` (`src/app/jobs/actions.ts`) leaves the stored description untouched when an edit changes only line endings. Saving a job without changes no longer marks its review out of date.
- No stored data is rewritten, and no migration is needed. Every other comparison remains exact and correct, including the overview's SQL count.
- **Regression tests:**
  - `tests/integration/job-review.integration.ts` (6 tests) and one unit test for `sameDescription`.
  - The three line-ending tests fail with the fix reverted and pass with it.
  - A real browser re-reviewed an LF-only demo job and ran its analysis.

### 3. Daily limit and failed runs (recommendation; behavior unchanged)

Current behavior:
- **No run is used** when a request fails a local check first: not found, not reviewed, out of date, no requirements, no profile, profile too large, or consent missing.
- **A run is used** once it is reserved, whatever happens next. That includes runs that fail because the service is down.
- **Unfinished runs:** a run that never finishes (for example, a server crash) stays STARTED and stops counting after 24 hours.

This is safe, because nothing can exceed the limit. But a service outage can use up a user's daily runs without giving them anything.

Recommended (needs approval; small change):
- **Free runs that never reached the AI service.** `service_unavailable` failures (connection refused or HTTP 503) would no longer count toward the daily limit, because no provider work or cost occurred.
- **Keep counting everything that might have reached a provider:** timeouts, rejected or invalid output, and save failures. These can incur cost with a cloud provider.
- **Add a separate cap on all attempts**, for example 3× the daily limit in 24 hours. Retrying during an outage then can't fill the audit table or hammer the service.
- **Keep the per-user advisory lock and counting inside the transaction**, so the limit stays exact under concurrency, with tests like the existing 25-concurrent-request test.

### 4. Replay-cache limitation (documented)

The new section "Replay protection in production" in `ai-service/README.md` covers:
- **Why the protection is incomplete:** with several workers or instances, and for 5 minutes after a restart.
- **What a replay can do:** repeat the same stateless analysis for someone already holding a complete signed request. With a cloud provider, that means repeated spend.
- **Required production mitigations:**
  - one worker (already set in the Dockerfile) and one instance
  - a shared store, such as Redis `SET NX EX 600` failing closed, before scaling out or adding a cloud provider
  - rejecting timestamps earlier than the process start time

ARCHITECTURE.md references it.

### Stabilization test results

All against local resources only.

| Check | Result |
| --- | --- |
| Python | 94 passed; ruff clean |
| TypeScript, lint | Clean |
| Unit | 272 passed |
| Integration | 51 passed (6 new) |
| Chromium | 27 of 28 in the full run |
| Fresh-clone production build | Passed on `d9dbd68` (no environment variables) |

About the one Chromium failure:
- The failing test was `e2e/location-preferences.spec.ts`. It passed on its own and failed 1 of 5 repeats.
- Clearing the locations field occasionally leaves text behind, because `fill("")` races the client form.
- It's a pre-existing flaky test, not a product bug: nothing it touches changed on this branch. It's listed in TASKS.md for a separate fix.

## Screenshots

Captured from the fictional local demo account. Saved outside the repository in `CareerOS/docs/screenshots/milestone-3-phase-2/`:
- `p2-01-match-desktop.png`
- `p2-02-match-desktop-dark.png`
- `p2-03-match-mobile.png`
- `p2-04-match-mobile-dark.png`
- `p2-05-job-analysis-list.png`

## Proposed Phase 3 plan (needs approval before starting)

1. **Anthropic provider** in `ai-service/app/providers/`:
   - Claude Sonnet by default (`claude-sonnet-5-5`), never Opus by default.
   - Tool-based structured output, a fixed prompt version, a temperature of 0 where supported, bounded tokens, and a timeout.
   - Its output goes through the same validators in both services; invalid output is rejected, not repaired.
2. **Consent UI:**
   - A clear consent screen naming the provider and listing exactly the fields that will be sent, plus a way to withdraw consent at any time.
   - `AI_ANALYSIS_PROVIDER=anthropic` is accepted only together with the consent gate already in place.
   - A provider name and model are recorded per analysis.
3. **Evaluation set:**
   - Fictional profiles and job postings only; no real user data ever.
   - Labelled expected verdicts, run against the rules engine and Sonnet.
   - Measures citation validity, false "supported" verdicts, and project-vs-employment errors.
   - The results are reported to you before any user-facing switch.
4. **Cost and abuse controls:** per-user and global daily limits, token budgets, and an off switch for the provider.
5. **Secrets:** the Anthropic API key exists only in the AI service's environment and is never in Next.js or the browser. The key and any spending need your approval before use.
6. Hosting, deployment, and production migrations remain Phase 4, and each step needs your approval.
