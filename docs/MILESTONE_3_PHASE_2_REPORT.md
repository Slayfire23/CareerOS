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
2. **Pre-existing edge case in requirement review.** Browsers submit form text with CRLF line endings, and the review compares the job description exactly. A job whose description has bare LF endings, which only happens when it's created outside the app's form (for example, my earlier demo seed), can't be re-reviewed. All jobs created in the app store CRLF and are unaffected. A fix would normalize line endings on both sides.
3. **The AI service's replay cache is in-process.** It needs one worker per instance, or shared storage, before scaling.
4. **Failed runs count toward the daily limit.** This is deliberate (it limits abuse), but a long service outage could use up a user's daily runs.
5. **The rules engine is keyword-based.** It can't recognize synonyms and never reports a skills gap. The UI says so.
6. **The open foundation security follow-ups in TASKS.md still apply.** Also still pending your approval: the production RLS migration, and a check of production Storage for leftover test fixtures.

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
