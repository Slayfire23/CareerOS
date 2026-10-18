# CareerOS — Development Checklist

Updated October 17, 2026. Milestone 1 core functionality is complete and deployed. The follow-ups below remain open; completion of the core does not imply every security scenario has been tested. Milestone 2 preferences are deployed and verified live; technical skills are deployed and verified live; professional experience is deployed and verified live; location preferences are deployed and verified live; salary expectations are deployed and verified live.

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
- [ ] Recheck dependency audit and resolve the Next.js ESLint/braces advisory. Last successful audit: 5 high affected-package entries, 0 with development dependencies omitted; see TESTING.md for dates and scope.
- [ ] Confirm email delivery for the brother's actual address if it was not one of the live test recipients; reassess default SMTP before broader public use.
- [ ] Separate development/preview data from the initial live Supabase project before risky schema or fixture work.
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
- [ ] Explicitly verify live education add/edit/remove after deployment.

### Projects and accomplishments increment

- [x] Define a fully optional cross-career section; title required only when adding an entry.
- [x] Add description, contribution, results, skills, and optional supporting links.
- [x] Implement owned add/edit/remove and local additive migration; pass 170 unit tests, 18 database tests, TypeScript, and lint.
- [x] Verify production build and all 18 browser tests (owner confirmed).
- [x] Apply hosted projects migration, deploy, and verify live save/edit/remove (owner confirmed).

### Private resumes increment

- [x] Implement authenticated PDF upload/list/download/delete and immutable upload versions.
- [x] Prepare private bucket and ownership RLS setup SQL (not applied).
- [ ] Execute storage setup and verify two-account RLS/browser tests.
- [ ] Verify production build and deploy; confirm live lifecycle.
- [ ] Revisit parsing, malware scanning, quotas, and richer version grouping before broader use.

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
- [ ] Implement upload, listing, download, and deletion with ownership checks.
- [ ] Support multiple resumes and version history without replacing older files silently.
- [ ] Test unauthorized access and document storage configuration.

Acceptance: each user can manage multiple private resume versions and cannot access another user's files.

Keep confirmed facts, preferences, and AI inferences distinct. AI matching is a later milestone.

## Later milestones

- [ ] Milestone 3: explainable job-description analysis and resume selection.
- [ ] Milestone 4: application records, status history, filtering, and feedback. Initial deployment has already happened in Milestone 1.
- [ ] Later: automatic discovery, recommendation learning, interview coaching, email integration, and background processing.
