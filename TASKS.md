# CareerOS — Development Checklist

Updated October 28, 2026 (see the audit section at the end and docs/FOUNDATION_COMPLETION_REPORT.md). Milestone 1 core functionality is complete and deployed. The follow-ups below remain open; completion of the core does not imply every security scenario has been tested. Milestone 2 preferences are deployed and verified live; technical skills are deployed and verified live; professional experience is deployed and verified live; location preferences are deployed and verified live; salary expectations are deployed and verified live.

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

## Milestone 2 — Structured career profile and resumes (in progress)

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

Keep confirmed facts, preferences, and AI inferences distinct. AI matching is a later milestone.

## Later milestones

- [ ] Milestone 3: explainable job-description analysis and resume selection.
- [ ] Milestone 4: application records, status history, filtering, and feedback. Initial deployment has already happened in Milestone 1.
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
- [ ] Phase 3: further page-level tests where useful (old-address redirects and every-page sign-out redirects are already covered by e2e/navigation.spec.ts).
- [ ] Phase 4: restyle the existing section forms (borders, spacing, buttons, sign-out button) to match the new design; accessibility and mobile pass; screenshots for owner review.
- [ ] Phase 5: docs, PR, owner review. No merge or deploy without approval.
- [ ] Known, pre-existing: input typed in the first instant after a page loads can be lost while the page finishes starting up. Tests now wait for pages to settle.
