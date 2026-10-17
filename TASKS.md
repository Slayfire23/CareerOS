# CareerOS — Development Checklist

Updated October 17, 2026. Milestone 1 core functionality is complete and deployed. The follow-ups below remain open; completion of the core does not imply every security scenario has been tested. Milestone 2 preferences are deployed and verified live; technical skills are deployed and verified live; professional experience is in progress.

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
- [ ] Commit/push, deploy, and verify professional experience live.

### Checkpoint 1: agree on the profile model

- [ ] Define target roles and related career paths.
- [ ] Define technical skills and professional experience fields.
- [ ] Define work arrangement, industries, and location/commute preferences.
- [ ] Define salary range, currency, and pay period.
- [ ] Decide which fields are optional and how users edit or remove values.
- [ ] Preserve existing careerGoals text; do not silently convert it into verified facts.

Acceptance: the field definitions and migration approach are documented before schema changes begin.

### Checkpoint 2: persist and edit structured profiles

- [ ] Add reviewed Prisma migrations without deleting existing profiles.
- [ ] Add server validation, ownership-scoped queries, and editable forms.
- [ ] Verify existing accounts retain their saved information after migration.
- [ ] Add validation, database-isolation, and two-account browser tests for new fields.
- [ ] Run TypeScript, lint, build, and relevant tests; update documentation.

Acceptance: each user can save, reopen, change, and clear their own structured fields without affecting another account.

### Checkpoint 3: projects, education, and resumes

- [ ] Add projects and education where needed by the agreed profile design.
- [ ] Choose private resume storage and permitted file types/size limits.
- [ ] Implement upload, listing, download, and deletion with ownership checks.
- [ ] Support multiple resumes and version history without replacing older files silently.
- [ ] Test unauthorized access and document storage configuration.

Acceptance: each user can manage multiple private resume versions and cannot access another user's files.

Keep confirmed facts, preferences, and AI inferences distinct. AI matching is a later milestone.

## Later milestones

- [ ] Milestone 3: explainable job-description analysis and resume selection.
- [ ] Milestone 4: application records, status history, filtering, and feedback. Initial deployment has already happened in Milestone 1.
- [ ] Later: automatic discovery, recommendation learning, interview coaching, email integration, and background processing.
