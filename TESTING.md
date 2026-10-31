# CareerOS testing

Updated October 16, 2026. These are the latest recorded results, not a new execution of every suite during this documentation update.

## Evidence

| Check | Recorded result | Evidence |
|---|---|---|
| Unit tests | 53 passed, 3 files | Executed against staged recovery implementation with installed project dependencies |
| PostgreSQL integration | 6 passed, 1 file | Owner supplied output from isolated local PostgreSQL |
| Chromium browser tests | 10 passed | Owner supplied output against localhost with real Auth |
| TypeScript | Passed | Staged checks and owner-supplied project output; final build also checked types |
| ESLint | Passed | Owner supplied final output after recovery changes |
| Production build | Passed | Owner supplied final Next.js 16.4.1 output including recovery routes |
| Live flows | Passed, user-reported | Sign-in, profile save/refresh, logout protection, fresh signup/confirmation, password recovery |

The owner explicitly confirmed rejection of the previous password during local recovery testing and later reported the live recovery sequence successful. This is manual evidence, not an automated production test.

## Unit tests

```powershell
npm test
npm run test:watch
```

Vitest tests the real server actions/readers with Supabase, Prisma, and Next response helpers replaced by test doubles. Coverage includes authentication rejection, profile field validation, ownership filters, ignored forged ownership fields, provisioning sequencing, recovery input validation, uniform provider-error responses, callback destinations, and trusted app-origin validation. No live accounts are required.

## PostgreSQL integration tests

Start the existing container:

```powershell
docker start careeros-test-db
docker exec careeros-test-db pg_isready -U careeros_test -d careeros_test
```

On a machine without that container, create it once:

```powershell
docker run --name careeros-test-db -e POSTGRES_USER=careeros_test -e POSTGRES_PASSWORD=local_test_only -e POSTGRES_DB=careeros_test -p 127.0.0.1:5433:5432 -d postgres:17
```

From the project root:

```powershell
npx prisma generate --config prisma7.config.ts
npx prisma migrate deploy --config prisma.integration.config.ts
npx vitest run --config vitest.integration.config.mts
```

The integration configuration uses only the fixed local database address from tests/support/local-database.ts; it does not load the app's .env. No reset is required. Fixtures use random identities and cleanup deletes only those generated users, with cascading profile deletion.

The six tests exercise concurrent/idempotent provisioning, separate persisted profiles, forged ownership input, unauthenticated operations, preservation of edits, and uniqueness/foreign-key constraints. Prisma and PostgreSQL are real; Supabase identity and Next response helpers are mocked. This does not test Supabase RLS or real session expiration.

## Browser tests

Install Chromium once:

```powershell
npx playwright install chromium
```

Create ignored `.env.playwright.local` with two different disposable, confirmed Supabase accounts:

```dotenv
E2E_TEST_EMAIL=first-test-account@example.com
E2E_TEST_PASSWORD=REPLACE_WITH_TEST_PASSWORD
E2E_TEST_EMAIL_B=second-test-account@example.com
E2E_TEST_PASSWORD_B=REPLACE_WITH_SECOND_TEST_PASSWORD
```

Verify these remain ignored: `git check-ignore .env .env.playwright.local`. Do not use personal accounts. Keep passwords current after manual recovery tests.

Run `npm run dev`, then in another terminal:

```powershell
npx playwright test
```

The configuration targets localhost:3000 with fresh browser sessions. It does not automatically test Vercel. Ten tests cover sign-in/out, save-and-refresh persistence, two-account isolation and switching, signed-out redirects, missing-session reads/writes, form validation, recovery navigation, protected new-password access, and a missing-code callback. Modified profiles are restored; inspect the disposable accounts if cleanup reports a failure. Traces/screenshots/videos are disabled; runner output is under the OS temporary directory.

These browser tests do not send confirmation/recovery emails or change passwords. Follow AUTH_EMAIL_SETUP.md for the manual email flow. Normal account switching does not prove resistance to crafted HTTP requests. Cookie deletion does not prove real token expiration/refresh behavior.

## Final checks and outstanding audit

```powershell
npm run typecheck
npm run lint
npm run build
```

Stop the development server before building into the same .next directory. Restart it for browser tests.

Last successful dependency audit recorded October 15, 2026: updating Prisma CLI/client/adapter to 7.10.1 resolved the Prisma-chain findings; `npm audit --omit=dev` reported 0 vulnerabilities. Full audit retained 5 high-severity affected-package entries from one braces advisory, GHSA-vfj7-8cjw-p6xm, through Next.js ESLint tooling. These are not five independent flaws. The suggested forced fix downgraded eslint-config-next to 14.2.35 and was not applied. A later audit attempt failed because the registry was unreachable; a current clean audit is not claimed.

Recheck with `npm audit` and `npm audit --omit=dev`. Track the upstream patch rather than blindly using `npm audit fix --force`.

Open scenarios: actual expired/refreshed/revoked sessions, crafted cross-account HTTP requests, real reused/expired email links, production RLS policy verification, and broader recipient delivery. See TASKS.md.

## Structured preferences increment — October 17, 2026

Directly executed: 67 unit tests across 4 files, 8 integration tests, and an existing-row migration-preservation check passed. TypeScript and lint passed. The production build was blocked by Windows sandbox junction permissions. Browser tests now total 11, but the suite has not been executed against this increment. The previous 10 passing browser tests above describe the foundation only. See STRUCTURED_PROFILE_SETUP.md for an isolated local app run before applying the hosted migration.

## Technical skills increment — October 17, 2026

Career preferences are deployed: the owner supplied passing 11-browser-test and build results, applied the hosted preferences migration, and verified live save/refresh/clear behavior. Technical skills are now implemented locally with a name and optional self-assessed proficiency. Names are normalized to prevent duplicate skills within a profile; saving an existing name updates its level. Removal enforces account ownership. The new related table and proficiency enum were migrated only to isolated local PostgreSQL. Current checks: 83 unit tests, 10 database tests, TypeScript, and lint passed. Build and the 12-test browser suite for this increment are pending. The hosted skills migration and deployment have not been performed. See TECHNICAL_SKILLS_SETUP.md.

## Professional experience — October 17, 2026

Directly executed: 95 unit tests, 12 local PostgreSQL integration tests, TypeScript, and lint passed. The new integration tests cover create/edit/delete, preserved profile fields, cross-account update/delete rejection, and expired-session rejection. Added a browser test for persistence, editing to current employment, removal, and account isolation; the owner supplied passing output for all 13 browser tests and the production build. The owner also supplied successful hosted migration output for 20261017030000_professional_experience. Professional experience deployment and live save/refresh/edit/remove were confirmed by the owner. The preceding skills increment passed build and all 12 browser tests and was verified live by the owner.

## Location and commute preferences

Directly executed: 112 unit tests, 13 local database tests, TypeScript, lint, and diff whitespace checks passed. Local migration and client generation succeeded. Browser coverage added for save/refresh/clear, zero-minute commute, and two-account isolation (14 total browser tests, execution pending). Production build, hosted migration, deployment, and live checks remain pending.

## Salary expectations

Location preferences passed the production build and all 14 browser tests; hosted migration and live save/refresh/clear were confirmed by the owner. Salary implementation passed 135 unit tests, 14 isolated PostgreSQL tests, TypeScript, and lint. All 15 browser tests and the production build passed (owner supplied output). Hosted Prisma reported no pending migrations. The owner pushed/deployed and verified salary save/refresh/edit/clear on the live site.

## Education entries

Directly executed: 148 unit tests, 16 local PostgreSQL integration tests, TypeScript, lint, and diff whitespace checks passed. Coverage includes optional field clearing, date validation, create/edit/remove, profile preservation, and rejection of foreign-account updates/deletes and expired sessions. Client generation and local migration succeeded. Added a browser test (16 total browser tests; execution pending). Production build, hosted migration, deployment, and live verification remain pending.

## Dark-mode form styling

Shared CSS now declares the active native color scheme and explicit control/option surfaces, text, placeholders, focus outlines, and readable disabled colors. Native month appearance and calendar affordances remain intact. Added e2e/dark-mode-forms.spec.ts covering dropdown options, focused/selected controls, month inputs, current-study/work disabled end dates, fieldset-disabled relocation, and a light-mode regression check. It does not save account data. TypeScript and lint passed. The initial browser run found a disabled-selector specificity issue, now corrected and verified with the current stylesheet in isolated Chromium. After the owner restarted the server, the Chromium dark-mode regression passed against the actual app. Both Education month-picker icons were clicked and native picker keyboard selection populated the input values without typing. The regression now checks this for Education and Professional Experience. No account data was saved. OS-specific popup appearance in other browsers remains unverified.

## Projects and accomplishments

Directly executed: 170 unit tests, 18 isolated PostgreSQL integration tests, TypeScript, and lint passed. Local client generation/migration succeeded. New browser test covers non-software accomplishments, save/refresh/edit/clear/remove, and two-account isolation; 18 total browser tests including the dark-mode regression, execution pending for this increment. Production build and hosted rollout remain pending.

## Private resumes

190 unit tests passed; TypeScript and lint passed. Resume unit coverage checks PDF constraints, malformed/foreign paths, unique non-overwriting uploads, owner-scoped operations, invalid sessions, storage errors, paginated listing, and private attachment response headers. Storage is mocked in these unit tests: actual RLS is not verified yet. Added a real two-account browser/Storage test (19 total browser tests) requiring supabase/resume-storage.sql setup first. Build, configured-storage tests, and hosted rollout remain pending. No Prisma migration is required. Projects build/all 18 browser tests and live save/refresh/edit/remove were confirmed by the owner.

## Resume-assisted review — October 21, 2026

Directly executed: 203 unit tests, 21 isolated PostgreSQL tests, all 20 Chromium browser tests, TypeScript, lint, and git diff whitespace checks passed. Real synthetic PDF extraction and two-account source access were exercised. Reviewed skill import leaves name/headline unchanged; database coverage verifies stale-snapshot rollback and duplicate/proficiency preservation. The browser test caught and prompted removal of a duplicate resume section after moving uploads to the top. The sandbox build was blocked by Turbopack junction permissions; the owner subsequently supplied successful production-build output on October 21, including the resume-review route. All predeployment checks passed. On October 21, the owner confirmed the changes were pushed and resume suggestions worked on the live site: only selected fields were saved, and all other profile information was preserved.


## Saved jobs and collapsible experience — October 21, 2026

213 unit tests, 22 isolated PostgreSQL integration tests, TypeScript, and lint passed. Three targeted Chromium tests passed: saved-job create/refresh/edit/link clearing/delete and two-account listing isolation; professional-experience persistence and keyboard collapse/expand; dark-mode native controls. Database tests exercise crafted foreign-ID edits/deletes, ignored supplied ownership, session loss, and unchanged foreign records. Local migration 20261021010000_saved_jobs was applied successfully. The owner supplied a successful production build including /jobs. All 21 Chromium browser tests passed (1.9 minutes). Hosted migration/deployment remain pending.


## Job requirements review - October 26, 2026

224 unit tests and 24 isolated PostgreSQL integration tests passed. TypeScript and lint passed. Database coverage verifies owner-only review updates, rejected stale review versions and changed descriptions, explicit clearing, unchanged career profiles, lost sessions, invalid excerpts, and missing confirmation. The targeted requirements browser test passed after restarting the dev server with the regenerated Prisma client and local test database settings. It verifies selective save, manual additions, edited text, persistence, changed-description warnings, clearing, foreign-account denial, and signed-out redirects. All 22 Chromium browser tests passed in 2.2 minutes on October 26. Migration 20261026010000_job_requirements has been applied only to local test PostgreSQL. The owner supplied a successful production build including /jobs/[id]/requirements. Hosted rollout remains pending.


## Foundation audit - October 28, 2026

Directly executed by the agent on branch foundation-verification: 224 unit tests (15 files), 24 local PostgreSQL integration tests, TypeScript, lint, and the production build passed. `npm audit` and `npm audit --omit=dev` reported 0 after a non-forced fast-uri 3.1.8 -> 3.1.9 lockfile patch; the braces advisory is no longer reported. The 6 signed-out Chromium tests (signed-out, recovery-pages) passed against `next start` with DATABASE_URL overridden to the local test database. After owner approval, the 16 signed-in browser tests also passed (1.6 minutes) against the same local-database server, signing in with the disposable accounts on hosted Supabase Auth; all 22 Chromium tests pass on this branch. Read-only `prisma migrate status` against the hosted database reported all 10 migrations applied. See docs/FOUNDATION_COMPLETION_REPORT.md.


## Local Supabase environment - October 28, 2026

Development and browser tests now run against a local Supabase stack (see DEV_ENVIRONMENT_SETUP.md). Directly executed: all 11 migrations applied locally; RLS enabled on all 8 public tables; anonymous and signed-in Data API reads returned no rows and a signed-in PATCH changed 0 rows; private bucket and 6 storage policies present; the Playwright guard rejected hosted Auth and hosted database URLs. All 22 Chromium tests passed (1.4 and 1.3 minutes). The app wrote only to the local database (2 local-only auth users and matching User rows). Fixed a resume fixture leak: Storage list search is a name-prefix match, so the cleanup never found UUID-prefixed fixtures. After the fix, 0 objects remain after a run. 224 unit tests, 24 integration tests, TypeScript, and lint passed. Production was checked only with read-only migrate status (10 applied, 1 pending: 20261028010000_enable_row_level_security).


## Build-only Vercel Preview - October 28, 2026

PR #1 Preview failed on Vercel. The excerpt the owner supplied showed only install warnings, so the cause is not confirmed from logs. Reproduced locally: a clean clone with no env variables failed with `DATABASE_URL is missing.` from src/lib/db.ts while collecting page data, and succeeded with the variables set. src/lib/db.ts now creates the Prisma client on first use instead of at import. There is no fallback URL; a query without DATABASE_URL still throws (new tests/db.test.ts). A clean-clone `prisma generate` + `next build` with no env variables now passes. 227 unit tests, 24 integration tests, TypeScript, lint, and 22/22 Chromium tests against local Supabase passed.

## UI redesign phases 1-2 - October 28, 2026

Directly executed on branch ui-redesign against local Supabase: 227 unit tests, 25 integration tests (new: owner-scoped overview counts, up-to-date review counting, priority counts), all 26 Chromium tests (new e2e/navigation.spec.ts: every menu link and its aria-current marking, no forms on the overview, mobile menu, signed-out redirects from every section page, and 307 redirects from old addresses), TypeScript, and lint. Existing browser specs now open the page where each feature lives and wait for the page to settle after navigation; their assertions are unchanged. The dark-mode spec visits each section page instead of one combined page. A clean clone with no environment variables built successfully; that build first caught a usePathname-outside-Suspense prerender error, which was fixed.

## UI redesign phase 4 and final refinements - October 29, 2026

Directly executed against local Supabase: 229 unit tests (new: month formatting), 25 integration tests, all 27 Chromium tests (new: e2e/confirmation.spec.ts for Cancel, Escape, focus, and confirmed removal), TypeScript, lint, and a clean no-env production build. A scripted audit of 15 pages at 375/768/1280px in light and dark mode (90 views) found no horizontal overflow, missing h1, or incorrect navigation highlighting. Browser specs use e2e/support.ts: openPage() waits for loading placeholders (aria-busy) to clear, and confirmAction() completes inline destructive confirmations.


## Milestone 3 Phase 1 - October 30, 2026 (branch milestone-3-ai-matching)

AI service (ai-service/, Python): 93 pytest tests passed; ruff format and lint clean; uv sync --locked succeeds. Verified over real HTTP with uvicorn and inside the production-mode Docker image: health 200, signed match 200, replay 409, unsigned 401, docs disabled, non-root, healthy health check, no profile text in logs, rejected secrets not printed. The CI workflow parses locally and will run on GitHub after the branch is pushed. Next.js (unchanged by Phase 1): TypeScript and lint passed; 229 unit, 25 integration, and all 27 Chromium tests passed against local Supabase; a fresh clone built with no environment variables. No test touched production Supabase or any AI provider. Details: docs/MILESTONE_3_PHASE_1_REPORT.md.

## Milestone 3 Phase 2 - October 30, 2026 (branch milestone-3-ai-matching)

All against local resources only. Python: 94 pytest tests (including the shared signature vector), ruff format and lint clean. Next.js: TypeScript and lint clean; 271 unit tests (42 new in tests/ai.test.ts: signing vector, config, evidence minimization, validator rejections, client error mapping); 45 integration tests (20 new in tests/integration/ai-analysis.integration.ts: owner scoping, cross-account refusal, malformed responses, foreign citations, disallowed provider, stale and unreviewed requirements, 25 concurrent requests against a limit of 20, feedback versioning, consent gate, database constraints, server-action input checks); 28 Chromium tests including e2e/job-match.spec.ts against the local rules service on 127.0.0.1:8010. With the AI service stopped, e2e/job-requirements.spec.ts still passed and the analysis page showed the unavailable message. Playwright refuses a non-local AI_SERVICE_URL. Replay rejection is covered by the Python tests.
