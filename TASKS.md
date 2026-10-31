# CareerOS — Development Checklist

Updated October 29, 2026. Milestones 1 and 2 (current scope) and the UI/UX redesign are complete, deployed, and verified in production. Milestone 3 (AI job analysis, the AI Engineering phase) and Milestone 4 (application tracking) are planned and not started; no AI features exist in the product yet. Earlier status follows. Milestone 1 core functionality is complete and deployed. The follow-ups below remain open; completion of the core does not imply every security scenario has been tested. Milestone 2 preferences are deployed and verified live; technical skills are deployed and verified live; professional experience is deployed and verified live; location preferences are deployed and verified live; salary expectations are deployed and verified live.

## Milestone 1 — Foundation completed

- [x] Initialize Next.js/TypeScript, Git, ignores, and a committed dependency lockfile.
- [x] Configure Supabase Auth and PostgreSQL with Prisma and its PostgreSQL adapter.
- [x] Create User/CareerProfile models, uniqueness and ownership constraints, and the initial migration.
- [x] Provision profiles idempotently without overwriting existing edits.
- [x] Implement signup, email confirmation, sign-in, sign-out, and password recovery.
- [x] Protect the dashboard and validate private reads/writes on the server.
- [x] Save display name, headline, and career goals with validation and ownership filtering.
- [x] Add 53 passing Vitest unit tests (directly executed against staged implementation).
- [x] Add 6 PostgreSQL integration tests; owner supplied passing output.
- [x] Add 10 Playwright browser tests; owner supplied passing output.
- [x] Verify two-account browser isolation, profile persistence, sign-out protection, and session-cookie loss.
- [x] Verify forged ownership inputs cannot change another profile in database integration tests.
- [x] Pass TypeScript, lint, and production build checks after recovery changes.
- [x] Push application changes to GitHub and deploy to Vercel.
- [x] Owner verifies live sign-in, save/refresh persistence, and logout redirects.
- [x] Owner verifies live signup/confirmation/profile creation and password recovery.
- [x] Document local configuration, migrations, testing, deployment, and email setup.
- [x] Update requirements and architecture to reflect the implemented application.

## Open foundation follow-ups

- [ ] Exercise real access-token expiration, refresh success/failure, and revoked sessions. Clearing browser cookies is not equivalent.
- [ ] Exercise crafted cross-account HTTP/server-action requests. Existing browser tests cover normal saves and account switching; forged ownership is covered at the database-function boundary.
- [ ] Verify real used/expired email-link rejection. Current automated callback tests cover absent/invalid mocked codes; live happy paths were manually tested.
- [x] Recheck dependency audit (October 28): braces advisory no longer reported; one moderate fast-uri advisory fixed with non-forced `npm audit fix`; full and --omit=dev audits report 0. Previous note: Last successful audit: 5 high affected-package entries, 0 with development dependencies omitted; see TESTING.md for dates and scope.
- [ ] Confirm email delivery for the brother's actual address if it was not one of the live test recipients; reassess default SMTP before broader public use.
- [x] Separate development/test data from the live Supabase project (October 28: local Supabase stack via the pinned CLI; see DEV_ENVIRONMENT_SETUP.md).
- [x] Commit and push this documentation reconciliation.

## Milestone 2 — Structured career profile and resumes (complete for current scope; unchecked items below are later enhancements or superseded checkpoints)

First increment: target roles, industries, work arrangements, and employment types. Remaining field design stays open. See STRUCTURED_PROFILE_SETUP.md for verification and rollout.

- [x] Implement optional preference lists and checkbox choices with separate save action.
- [x] Preserve existing profile text and enforce server-side ownership.
- [x] Test additive migration against an existing fixture in isolated PostgreSQL.
- [x] Pass 67 unit tests, 8 database tests, TypeScript, and lint.
- [x] Run the production build outside the sandbox (junction permission blocked the agent).
- [x] Run all 11 browser tests against the app configured with local test PostgreSQL.
- [x] Apply reviewed hosted migration after local verification.
- [x] Commit/push, deploy, and smoke-test new preferences.

### Technical skills increment

- [x] Define a skill name and optional self-assessed Beginner/Intermediate/Advanced level.
- [x] Implement add/update/remove with account ownership and duplicate prevention.
- [x] Apply the additive skills migration to local PostgreSQL; pass 83 unit tests, 10 database tests, TypeScript, and lint.
- [x] Verify build and all 12 browser tests for the skills increment (owner supplied results).
- [x] Apply hosted skills migration, deploy, and verify live (owner confirmed).

### Professional experience increment

- [x] Define required title/company, month dates, current employment, and optional responsibilities/accomplishments.
- [x] Implement account-scoped add/edit/remove; pass 95 unit tests, 12 database tests, TypeScript, and lint.
- [x] Verify validation and database isolation; owner supplied passing production build and all 13 browser tests.
- [x] Apply hosted professional experience migration (owner supplied successful output).
- [x] Commit/push, deploy, and verify professional experience live (owner confirmed save/refresh/edit/remove).

### Location and commute increment

- [x] Define optional preferred locations, relocation willingness, and maximum one-way commute.
- [x] Implement validation, ownership, persistence, and clearing; pass 112 unit tests, 13 database tests, TypeScript, and lint.
- [x] Verify all 14 browser tests and production build (owner confirmed).
- [x] Apply hosted migration and verify live save/refresh/clear (owner confirmed).

### Salary expectations increment

- [x] Define optional base-pay range, currency, and hourly/monthly/yearly period.
- [x] Implement validation, clearing, and account isolation; pass 135 unit tests, 14 database tests, TypeScript, and lint.
- [x] Verify production build and all 15 browser tests (owner supplied passing output).
- [x] Confirm hosted migrations are up to date, deploy, and verify salary save/refresh/edit/clear live (owner confirmed).

### Education increment

- [x] Define institution, qualification/program, optional field of study, month dates/current study, and optional details.
- [x] Implement account-scoped add/edit/remove and additive local migration.
- [x] Complete education build and all 16 browser tests (owner confirmed).
- [x] Apply hosted education migration (owner confirmed).
- [x] Explicitly verify live education add/edit/remove after deployment (owner confirmed October 28).

### Projects and accomplishments increment

- [x] Define a fully optional cross-career section; title required only when adding an entry.
- [x] Add description, contribution, results, skills, and optional supporting links.
- [x] Implement owned add/edit/remove and local additive migration; pass 170 unit tests, 18 database tests, TypeScript, and lint.
- [x] Verify production build and all 18 browser tests (owner confirmed).
- [x] Apply hosted projects migration, deploy, and verify live save/edit/remove (owner confirmed).

### Private resumes increment

- [x] Implement authenticated PDF upload/list/download/delete and immutable upload versions.
- [x] Configure private bucket and ownership RLS (owner executed SQL successfully).
- [x] Execute storage setup and verify all 19 browser tests, including two-account RLS (owner confirmed).
- [x] Verify production build, deploy, and confirm live upload/download/version deletion (owner confirmed).
- [ ] Revisit parsing, malware scanning, quotas, and richer version grouping before broader use.

### Resume-assisted profile setup (October 21, 2026)

- [x] Move resume uploads before profile fields and retain manual entry.
- [x] Extract text locally from owned PDFs; suggest name/headline and explicit skills sections.
- [x] Require explicit selection/editing before saving; preserve existing skill proficiency and reject stale profile snapshots atomically.
- [x] Pass 203 unit tests, 21 database tests, TypeScript, and lint; targeted browser review test passes.
- [x] Run all 20 browser tests successfully (directly executed October 21).
- [x] Run production build outside the sandbox (owner supplied successful output October 21).
- [x] Verify live review and selective save after deployment (owner confirmed October 21: only selected fields saved; all other profile information preserved).
- [ ] Later: structured experience/education/project suggestions, OCR, and improved layout parsing.

### Dark-mode form styling

- [x] Fix native color scheme, shared control colors, placeholders, focus, and disabled states.
- [x] Verify native month picker selection and dark-mode browser regression.
- [x] Deploy and confirm live styling (owner confirmed).

### Checkpoint 1: agree on the profile model

- [ ] Define target roles and related career paths.
- [x] Define technical skills and professional experience fields.
- [x] Define work arrangement, industries, and location/commute preferences.
- [x] Define salary range, currency, and pay period.
- [ ] Decide which fields are optional and how users edit or remove values.
- [x] Preserve existing careerGoals text; do not silently convert it into verified facts.

Acceptance: the field definitions and migration approach are documented before schema changes begin.

### Checkpoint 2: persist and edit structured profiles

- [ ] Add reviewed Prisma migrations without deleting existing profiles.
- [ ] Add server validation, ownership-scoped queries, and editable forms.
- [ ] Verify existing accounts retain their saved information after migration.
- [ ] Add validation, database-isolation, and two-account browser tests for new fields.
- [ ] Run TypeScript, lint, build, and relevant tests; update documentation.

Acceptance: each user can save, reopen, change, and clear their own structured fields without affecting another account.

### Checkpoint 3: projects, education, and resumes

- [x] Implement education entries; see verification details above.
- [x] Add optional projects and accomplishments with descriptions, contributions, results, skills, and links.
- [x] Choose private Supabase Storage, PDF only, 2 MiB per upload.
- [x] Implement upload, listing, download, and deletion with ownership checks.
- [x] Preserve each upload as a separate immutable version; richer grouping remains a follow-up.
- [x] Test unauthorized access and document storage configuration.

Acceptance: each user can manage multiple private resume versions and cannot access another user's files.

Keep confirmed facts, preferences, and AI inferences distinct. AI matching is a later milestone (Milestone 3, planned, not started).

## Later milestones

- [ ] Milestone 3 (AI Engineering phase, in progress; see the Milestone 3 section at the end): explainable job-description analysis and resume selection.
- [ ] Milestone 4 (planned, not started): application records, status history, filtering, and feedback. Initial deployment has already happened in Milestone 1.
- [ ] Later: automatic discovery, recommendation learning, interview coaching, email integration, and background processing.


## Saved jobs — October 21, 2026

- [x] Add private saved jobs with title, company, optional posting link, and pasted description.
- [x] Add authenticated create/edit/delete actions and an ownership-scoped /jobs page linked from the dashboard.
- [x] Add migration 20261021010000_saved_jobs without changing existing profile data; apply to isolated local PostgreSQL only.
- [x] Collapse the Add experience form by default; keep saved summaries visible and existing edit forms collapsible.
- [x] Pass 213 unit tests, 22 database tests, TypeScript, lint, and targeted saved-jobs/experience/dark-mode browser checks.
- [x] Complete production build (owner supplied successful output including /jobs).
- [x] Complete the full browser suite: all 21 Chromium tests passed.
- [x] Apply the saved-jobs migration to Supabase, deploy, and verify live save/refresh/edit/delete (owner confirmed everything working).
- [ ] Next increment: explainable job-requirement analysis against confirmed profile information.


## Job requirements review - October 26, 2026

- [x] Collapse education/project add forms; existing targeted browser checks passed.
- [x] Add source-backed, editable requirement suggestions and manual additions.
- [x] Require explicit selection and confirmation; preserve the original job description.
- [x] Save private reviewed requirements with description snapshots and optimistic review versions.
- [x] Reject foreign records, stale descriptions, stale reviews, invalid excerpts, and lost sessions.
- [x] Apply migration 20261026010000_job_requirements to local test PostgreSQL.
- [x] Pass 224 unit tests, 24 database tests, TypeScript, and lint.
- [x] Complete production build (owner supplied successful output with the requirements route).
- [x] Complete browser verification: all 22 Chromium tests passed (October 26).
- [x] Apply hosted migration 20261026010000_job_requirements (read-only `prisma migrate status` on October 28 reports 10/10 applied).
- [x] Deploy (October 28: live /jobs/[id]/requirements route serves and redirects signed-out users to /login).
- [x] Owner verifies live review/selective save/edit/clear, including the changed-description warning (owner confirmed October 28).
- [ ] Later: compare confirmed requirements with profile evidence; no match scores yet.

## Foundation audit - October 28, 2026

Directly executed on branch foundation-verification; details in docs/FOUNDATION_COMPLETION_REPORT.md.

- [x] 224 unit tests, 24 local PostgreSQL integration tests, TypeScript, lint, and production build passed.
- [x] 6 signed-out Chromium tests passed against the production build using the local test database.
- [x] Run the 16 signed-in Chromium tests (owner approved October 28): all 16 passed in 1.6 minutes; the full suite is 22/22 on this branch.
- [x] Fixed Windows-1252 em-dash bytes in TASKS.md, TESTING.md, ARCHITECTURE.md; untracked debug.log; patched fast-uri.
- [x] B1: development and all browser tests now use a local Supabase stack (Auth, Storage, PostgreSQL). Guard rejects hosted projects; migrations, RLS (anon and signed-in Data API reads/writes denied), storage policies, and 22/22 browser tests verified locally.
- [x] Fixed browser-test resume cleanup: Storage search is a name-prefix match, so one fixture PDF leaked per resumes.spec run. Now lists the folder; verified 0 objects left.
- [ ] Owner checks production Storage for leftover fixture PDFs (names ending _resume_test_<32 hex>.pdf in the old test account folder) from earlier hosted test runs; delete only with approval.
- [ ] Apply migration 20261028010000_enable_row_level_security to production (idempotent; production already has RLS on; needs owner approval).
- [x] B3/B4: owner confirmed live job-requirements review and education add/edit/remove (October 28). Foundation recommendation: GO.

## UI/UX redesign - October 28, 2026 (branch ui-redesign)

- [x] Phase 1: shared /dashboard layout (desktop sidebar, mobile menu, skip link), real home page, "CareerOS" titles, light/dark tokens with one blue accent.
- [x] Phase 1 refinements (owner-requested): compact overview, saved jobs first with real counts, single profile summary card with progress and missing-section chips, icon quick actions, distinctive landing page.
- [x] Phase 2: dedicated pages for profile, preferences, skills, experience, education, projects, resumes, saved jobs, and job analysis; forms removed from the overview; 307 redirects from old addresses.
- [x] 227 unit tests, 25 integration tests, 26 Chromium tests (4 new navigation tests), TypeScript, lint, and a clean no-env production build passed.
- [x] Phase 3: navigation, redirect, mobile-menu, and confirmation tests added.
- [x] Phase 4: restyled all forms and key pages (Resumes, Saved Jobs, Job Analysis, requirement review), sign-out, auth pages, loading/empty states; responsive audit of 90 page views; owner approved the design.
- [x] Final refinements: full values on the mobile dashboard, roomier mobile requirement controls, "Jun 2023 – Present" dates (storage unchanged), inline confirmation for every destructive action (Cancel/Escape covered by e2e/confirmation.spec.ts).
- [x] Phase 5: PR #2 merged October 29, 2026 (a3cb6fd); Vercel production deployment Ready.
- [x] Production verification: signed-out checks (new home page and titles, /login redirects from all 11 section pages, 307 redirects from old addresses, 404 for unknown pages) and owner-confirmed signed-in checks (overview data, navigation highlighting, save/refresh, confirmation Cancel/remove, job analysis, friendly dates, mobile menu, dark mode).
- [ ] Next: AI Engineering phase may begin. Still awaiting owner approval: production RLS migration 20261028010000_enable_row_level_security, and a check of production Storage for leftover test-fixture PDFs.
- [x] Investigated the suspected input-loss issue: not a product bug. React 19 holds streamed section content in a hidden container behind the loading placeholder for about 300ms before revealing it. Users cannot see or type into the form until then; tests were acting on the hidden copy. Loading placeholders now carry aria-busy, and e2e/support.ts openPage() waits for the reveal (no fixed delays or networkidle).

## Milestone 3: AI Engineering - started October 29, 2026 (branch milestone-3-ai-matching)

Plan approved with decisions D1-D11 (docs/MILESTONE_3_PLAN.md): rules engine first, then Claude Sonnet as the first cloud provider; explicit consent before any cloud AI use; no numeric fit score; raw resume text excluded; separate analysis page; 20 analyses per user per day (configurable); manual requirement review stays independent of AI. Development and tests never use production data.

### Phase 1: AI service foundation

- [x] ai-service/ with Python 3.13 and uv 0.13.1; dependencies resolved only from releases at least two weeks old (exclude-newer).
- [x] Settings with startup validation (secret length and strength, production guards); rejected values never appear in errors.
- [x] Strict request/response contract; example request and golden rules response in contracts/match/.
- [x] Signed internal requests: HMAC-SHA256, 5-minute expiry, canonical UUIDv4 request ids, replay rejection, body size limit.
- [x] Provider interface with deterministic rules and test-only fake providers; Anthropic and Ollama refused until their phases.
- [x] Code-enforced validation: supplied, verbatim citations; projects never count as employment; verified durations; no gap for empty areas.
- [x] Health and readiness endpoints; metadata-only logging; docs disabled in production.
- [x] 93 pytest tests, ruff format and lint clean; verified over real HTTP with uvicorn and inside the Docker image (healthy, non-root, no content in logs).
- [x] Security review fixes: secrets no longer printed on startup errors; strict UUIDv4 check; minimum quote length; spelled-out and hyphenated durations detected; bounded request-id logging.
- [x] GitHub Actions workflow for the Python service (runs after the branch is pushed).
- [x] Existing Next.js suites re-run on this branch (see TESTING.md).
- [x] Owner approval of Phase 1 (October 30, 2026); branch pushed and the Python workflow passed on GitHub Actions.

### Phase 2: Next.js integration with the rules engine

- [x] Evidence builder: loads only the signed-in user's confirmed profile and reviewed requirements; sends no names, companies, institutions, links, contact details, salary, location, or resume text.
- [x] Signed client: HMAC-SHA256 with timestamp and request id, 45-second timeout, no redirects; shared signature vector checked by both TypeScript and Python tests.
- [x] Next.js re-validates every response (supplied, verbatim citations; projects never employment; verified durations; recomputed counts; provider allow-list) and rejects the whole response on any violation.
- [x] AiAnalysisRun (audit and rate limit) and JobMatchAnalysis (results and feedback) tables; ownership enforced by composite foreign keys, RLS enabled with no policies, CHECK constraints. Migration 20261030010000_ai_analysis applied to local databases only.
- [x] 20 analyses per user per rolling 24 hours (AI_ANALYSIS_DAILY_LIMIT), serialized with a per-user advisory lock; failed runs count.
- [x] Consent tracking prepared (User.aiCloudConsentAt); enforced for any non-local provider. The rules engine needs none; only the rules provider can be enabled.
- [x] Dedicated page /dashboard/jobs/[id]/match with verdict counts (no fit score), cited evidence, out-of-date notices, Agree/Disagree feedback with optional note, and recent-run history.
- [x] Manual requirement review verified with the AI service stopped.
- [x] 42 unit, 20 integration, and 1 browser test added; all suites pass (see TESTING.md).
- [x] Owner approval of Phase 2 (October 30, 2026), after the stabilization pass. Production migrations, merge, and deployment remain on hold and need separate approval.
- [x] Fixed with owner approval (October 30, 2026): migration 20261028010000_enable_row_level_security now guards its _prisma_migrations statement with to_regclass, so `prisma migrate dev` shadow replay works again. Production has not applied this migration yet, so no applied history changed there; local databases had their recorded checksum updated. Applying it to production still needs separate approval.
- [x] Stabilization: requirement reviews and job edits compare descriptions with line endings normalized and keep the stored text, so jobs with LF or CRLF descriptions can be re-reviewed; regression tests added.
- [x] Stabilization: replay-cache limitation and production mitigations documented (ai-service/README.md).
- [ ] Recommended, needs approval: stop counting runs that never reached the AI service (service_unavailable) toward the daily limit, with a separate cap on total attempts.
- [ ] Pre-existing flaky browser test: e2e/location-preferences.spec.ts fails about 1 run in 6 when clearing the locations field leaves text behind (fill races the client form). Not caused by Milestone 3.

### Later phases (not started)

- [ ] Phase 3: Claude Sonnet provider behind the interface, with an approved evaluation run. Plan proposed in docs/MILESTONE_3_PHASE_3_PLAN.md (app CI, failed-run limits, shared replay store, cost ledger and budgets, consent, mocked provider tests, fictional evaluation); awaiting owner approval. No paid API calls without separate authorization.
- [ ] Phase 4: hosting comparison, deployment, and production migration (each step needs approval).
- [ ] Phase 5: Ollama provider for local use.

The open foundation security follow-ups near the top of this file remain open and still apply.
