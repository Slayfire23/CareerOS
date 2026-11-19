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
- [x] Done in Phase 3: failures that never reached an analysis don't count toward the daily limit; an attempt cap (3x) applies to every run.
- [x] Fixed in Phase 3: the flaky e2e/location-preferences.spec.ts (openPage now waits for forms to hydrate; 10 of 10 repeats pass).

### Phase 3: Anthropic provider (plan approved October 30, 2026; docs/MILESTONE_3_PHASE_3_PLAN.md)

- [x] Anthropic model, structured outputs, errors, pricing, and spend limits verified against official documentation (docs/ANTHROPIC_VERIFIED_FACTS.md).
- [x] Replay-store options and costs evaluated (docs/REPLAY_STORE_OPTIONS.md); local development uses a free Valkey container.
- [x] App-level CI (.github/workflows/app.yml), a secret check, and a migration replay check; Valkey added to the AI service workflow. Not yet run on GitHub (branch not pushed).
- [x] Failed-run limits and attempt cap, safe under concurrency.
- [x] Shared, fail-closed replay store (Redis-compatible), 120-second signature window.
- [x] Contract v2: per-request provider, token budget, usage, billed = no | yes | unknown.
- [x] Cost ledger with reserved, confirmed, and unresolved charges; per-user daily, global daily, and global monthly caps under advisory locks. Migration 20261031010000_ai_cost_ledger applied to local databases only.
- [x] Cloud redaction of names, employers, schools, emails, phone numbers, and links.
- [x] Claude Sonnet 5.5 provider tested only against mocked responses; strict validation; no fallback model.
- [x] Versioned consent, allow-list, and method choice (the rules engine stays a separate option); cloud off by default.
- [x] Offline evaluation harness with 16 fictional cases (rules baseline, mock, replay).
- [ ] Live evaluation: needs separate owner approval (proposal in docs/MILESTONE_3_PHASE_3_REPORT.md). No paid call has been made.
- [ ] Operator procedure for reconciling unresolved charges in production (the function exists; tooling belongs to Phase 4).
- [ ] Rules engine ignores proficiency ("Expert-level Java" with a beginner skill is "supported"); found by the evaluation baseline.

### Later phases (not started)

- [ ] Phase 4: hosting comparison, deployment, and production migration (each step needs approval).
- [ ] Phase 5: Ollama provider for local use.

The open foundation security follow-ups near the top of this file remain open and still apply.

### Local AI with Ollama (strategy change, October 31, 2026)

- [x] Claude provider kept but disabled; the Anthropic live evaluation was cancelled and never run; no paid call made.
- [x] Ollama 0.40.6 installed natively, bound to 127.0.0.1 only; qwen3:8b and qwen3.5:9b downloaded and evaluated.
- [x] Ollama provider with strict validation, a relevance rule for all language models, prompt v3 with computed facts, and a "Local AI" method in Next.js (off unless enabled and allow-listed).
- [x] Evaluation: qwen3:8b is best for this hardware (82% agreement, 0 false "supported", 25% of responses discarded). Not yet accurate enough to offer; see docs/MILESTONE_3_OLLAMA_REPORT.md.
- [x] Hybrid design approved and built: rules engine decides, qwen3:8b only proposes skill matches it missed, code decides each finding, every finding labeled; short evidence ids; "Rules + local AI" in the app.
- [x] Held-out evaluation sets A (48 cases) and B (27 cases, untouched). Hybrid on B: 94.2% vs rules 84.9%, never worse than rules on any requirement. See docs/MILESTONE_3_HYBRID_REPORT.md.
- [x] Fixes built and frozen (c119428): untrusted-text segmentation, word sense, education equivalency, more relations, "Experience with X" as a skill. Dev/A/B now 0 false "supported", 0 injections.
- [x] Held-out set C (52 cases, untouched): hybrid 88.3% vs rules 80.2%; see docs/MILESTONE_3_HYBRID_V3_REPORT.md.
- [x] Milestone 4 (frozen 360ae09/5ffeefa): structural requirement validation, all-mandatory-items, stricter technical context, category and label bugs fixed, relations and degree equivalence. See docs/MILESTONE_4_REPORT.md.
- [x] Milestone 5 (frozen 13f85d6): structured requirements, "needs confirmation" for instruction-like requirements (confirmation is never evidence), no hybrid contamination, legitimate-match fixes. See docs/MILESTONE_5_REPORT.md.
- [ ] Not ready for controlled remote-access testing of hybrid: on untouched set E, hybrid 89.6% (rules 84.9%, local AI alone 48.8%) with 4 false "supported" requirements and 3 of 10 injections. Next steps and a new set F proposed.
- [x] Intermittent cloud integration failure: reproduced; a random UUID containing "555" failed the redaction check (fixed, regression test), and concurrent runs interfered (run lock added). Original output never captured.
- [x] Milestone 6 (frozen a9e3d52): rules are the only verdict authority; Ollama only adds separate, code-checked suggestions; verdicts identical with Ollama on or off; hybrid retired. See docs/MILESTONE_6_REPORT.md.
- [ ] Readiness bar not met: on untouched set F (67 cases), agreement 96.9%, but 1 false "supported" and 1 of 14 injections (a claim inside an education field). Not fixed, because F has been seen. Suggestions were 54% useful by the frozen labels.
- [x] Milestone 7 (frozen c7acdcd): rules engine moved to Next.js, so rules-only analysis works with the laptop off; typed profile fields; FastAPI is only a bridge for suggestions; a Vercel build problem fixed. See docs/MILESTONE_7_REPORT.md.
- [ ] Readiness bar still not met: on untouched set G (138 cases, written independently), agreement 71.2%, 1 false "supported" (of 153), and 3 of 34 injections reaching "possible" (none "supported"). Not fixed, because G has been seen. Suggestions were 68% useful.
- [x] Milestone 8 (frozen fdff413): education status, negation, untrusted claims, years tied to the field, and degree names without invented equivalence. See docs/MILESTONE_8_REPORT.md.
- [ ] Safety target still not met: on untouched set H (174 cases, AI-written, second AI rater), accuracy 76.8%, 0 of 33 injections, but 3 false "supported" of 190. Not fixed, because H has been seen.
- [ ] Decide on a private Vercel Preview: needs an isolated Supabase project, Preview-only variables, and Deployment Protection (docs/MILESTONE_8_REPORT.md section 6). Needs approval.
- [x] Milestone 9 (frozen 772c01f, rules-v9): Set H's false "supported" verdicts fixed; non-software coverage; the owner's 26 decisions stored and applied as general rules (direct evidence in work, explicit absence, relevant experience). See docs/MILESTONE_9_REPORT.md.
- [ ] Criteria not met on untouched set I (242 cases, AI-written, AI-labeled blind): 57.3% accuracy, 3 false "supported" of 276, 1 of 36 injections, 37% of legitimate matches missed. Not tuned. Rules availability, citations, and AI independence held.
- [x] Milestone 10 (frozen e4a68e0, rules-v10): safety fixes, clarification workflow with "Supported — Self-reported", terminology prototype, the owner's Set I audit. See docs/MILESTONE_10_REPORT.md.
- [ ] Criteria not met on untouched Set J (236 cases, AI-written, AI-labeled blind): 62.6% accuracy, 1 false "supported" of 254, 2 of 32 injections reaching Possible, 51% of legitimate matches missed. Not tuned.
- [x] Milestone 11, Phase 2: typed evidence layer and bge-m3 retrieval in shadow, occurrence fix in production (rules-v11), curated layer. See docs/MILESTONE_11_PHASE_2_REPORT.md.
- [x] Milestone 11, Phase 3: rules-v12 fixes for six false Supported patterns, a conservative language gate, shadow-layer corrections. See docs/MILESTONE_11_PHASE_3_REPORT.md.
- [x] Milestone 11, Phase 4 (rules-v13): clarification-first review behind `CLARIFICATION_REVIEW_ENABLED`, off by default. See docs/MILESTONE_11_PHASE_4_REPORT.md.
- [ ] Not safe to enable. On the sealed check: 1 false Supported from a negated answer, third-party, vague, and injected answers reaching Possible, 7 of 9 attacks saved, 0 of 29 paraphrases at Supported. Blockers are listed in the report. Not tuned.
- [x] Phase 4 safety remediation (rules-v14): saved-answer bypass closed, shared evidence boundary, English-only answer reading, table can't grant Supported until approved. See docs/MILESTONE_11_PHASE_4_REMEDIATION_REPORT.md.
- [ ] Still not ready to enable: no independent evidence, honest paraphrases 0 of 18 on both new splits, hosted retention unverified.
- [x] Milestone 11, Phase 5 design and shadow proof of concept: a local model reads answers, and code decides what that's worth. See docs/MILESTONE_11_PHASE_5_DESIGN.md. Not integrated.
- [x] Phase 5 production fixes (rules-v15) and local shadow run behind INTERPRETATION_SHADOW_ENABLED, off by default. See docs/MILESTONE_11_PHASE_5_SHADOW_REPORT.md.
- [x] Follow-up workflow for local testing behind FOLLOW_UP_WORKFLOW_ENABLED (rules-v16), with the delegation fix. See docs/MILESTONE_11_PHASE_5_FOLLOW_UP_REPORT.md.
- [x] Phase 5 fix round (rules-v17): contextual corrections, brief exposure kept but limited, time claims longer than listed roles ask for earlier roles, hand-off replies refused. New 100-scenario blind split: 1 false Supported, 7 unsafe Possible remain. See docs/PHASE5_FIX_ROUND_REPORT.md and docs/MULTILINGUAL_ANSWERS_INVESTIGATION.md.
- [x] Phase 5.2 (rules-v18): clause reader (clauses.ts), involvement from the main verb, corrections that retract only what they contradict, refusal messages by cause, code-chosen follow-up questions, replies that cannot reverse the answer. Sealed split m11_followup3 (120): criteria not met (3 false Supported, 7 unsafe hands-on Possible, 2 bad replies accepted, recognition 35 vs 37 of 75). See docs/PHASE5_2_EVALUATION_REPORT.md.
- [x] Phase 5.3 (rules-v19), local and unpushed, flags off: Stage 1 title and date credit (docs/PHASE5_3_STAGE1_REPORT.md), Stage 2 follow-up validation (docs/PHASE5_3_STAGE2_REPORT.md), Stage 3 parser evaluation, no parser adopted (docs/PHASE5_3_STAGE3_PARSER_REPORT.md), Stage 4A structured ownership design (docs/PHASE5_3_STAGE4A_STRUCTURED_OWNERSHIP_DESIGN.md), description simulation, no rule adopted (docs/PHASE5_3_DESCRIPTION_SIMULATION_REPORT.md). Sealed split m11_followup4 still unopened.
- [x] Equivalence batch 1 (finance and office): 8 groups approved as revised, budgeting rejected (owner decision 2026-11-07). See docs/EQUIVALENCE_REVIEW_BATCH1.md and tests/ai-equivalence-batch1.test.ts.
- [ ] Equivalence batches 2–4 (42 groups in all) and batch 5 (two proposed groups, kept separate), each for the owner's decision.
- [ ] Reader issues found in equivalence review, recorded for later and not yet fixed (owner, 2026-11-07):
  - Payroll processing credited Supported from collecting timesheets and sending them to the payroll company: the requirement's word appears only in someone else's name.
  - Budgeting credited Supported from managing a small office holiday-party budget.
  - Accounts payable missed: "I paid vendor invoices" is dropped by the done-elsewhere rule, which reads "paid … vendor" as outsourcing.
  - Medication administration missed: "I passed medications" (a medication pass) is read as handing things over (assisted).
  - Medication administration credited Supported from "give medications back to the pharmacy for disposal" and "administer the medication reimbursement forms".
- [ ] Recognition losses from the batch 1 revisions, to revisit with recognition work: "Kept the books for three family restaurants" (bookkeeping) and "matched the statement activity … to the ledger" (bank reconciliation) now get nothing.
- [ ] Owner labels the 30-scenario blind packet (docs/PHASE5_BLIND_LABEL_PACKET.md) before any blind results are opened.
- [ ] Blind split: 2 false Supported and 7 unsafe Possible of 80, from the answer reader, against agent labels. Decide whether to keep patching word lists.
- [ ] Production migrations now include 20261104010000 and 20261105010000. Needs approval.
- [ ] Owner sign-off on the 42 equivalence groups (docs/EQUIVALENCE_REVIEW_PACKET.md); none are owner-reviewed yet.
- [ ] Semantic promotion stays disabled. Waiting on the owner's two review packets and decision before any Set K freeze.
- [ ] Retire the frozen Python rules after set H confirms the TypeScript engine. Needs approval.
- [ ] Production migrations before any deploy: 20261028010000, 20261030010000, 20261031010000, 20261102010000, 20261103010000, 20261104010000. Needs approval.
- [ ] Remote access: plan only (docs/REMOTE_ACCESS_PLAN.md); nothing is configured. Needs approval.
