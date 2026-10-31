# CareerOS — Architecture

Status: implemented foundation, October 16, 2026. Milestone 2 is in progress; preferences and technical skills are deployed and verified by the owner.

## Runtime and structure

One Next.js 16.4.1 application uses React 19.3 and TypeScript, Supabase Auth, and Supabase-hosted PostgreSQL through Prisma 7.10.1 and @prisma/adapter-pg. Vercel serves the deployed application. Cache Components is enabled.

```text
src/app/auth/actions.ts           Signup, sign-in, sign-out server actions
src/app/auth/recovery-actions.ts  Reset-email request and password update
src/app/auth/callback/route.ts    PKCE code exchange and fixed destinations
src/app/dashboard/layout.tsx     Shared signed-in layout: sidebar, mobile menu, account box (presentation only)
src/app/dashboard/page.tsx       Overview: summaries of the user's own data, no forms
src/app/dashboard/<section>/     profile, preferences, skills, experience, education, projects, resumes,
                                 jobs (+ [id]/requirements), analysis. Each page verifies the session itself
src/app/dashboard/*-actions.ts   Profile section server actions
src/app/jobs/*actions.ts         Saved-job and requirement-review server actions (no pages; /jobs redirects)
src/lib/sections.ts              Section addresses used by navigation and links
src/lib/overview.ts              Owner-scoped saved-job summary for the overview and Job analysis
src/components/                  Authentication, recovery, and profile forms
src/lib/supabase/                 Browser/server Auth client factories
src/lib/db.ts                    Prisma client with PostgreSQL adapter
src/lib/ensure-profile.ts        Idempotent user/profile provisioning
src/lib/profile.ts               Current-user profile reader
src/lib/app-origin.ts            Validated configured application origin
src/proxy.ts                     Session refresh and private/no-store headers
prisma/                          Schema and committed migrations
tests/                           Unit tests and isolated database integration tests
e2e/                             Chromium browser tests
```

## Identity and authorization

Supabase owns passwords and sessions. The server client uses cookies; the proxy refreshes sessions. Private page content and actions verify identity on the server with getUser. Dynamic dashboard and password-update content use connection() inside Suspense boundaries.

CareerOS owns record authorization. Profile queries derive their scope from the verified Supabase identity. The save action ignores client-provided ownership fields and explicitly writes only displayName, headline, and careerGoals. Form validation enforces trimmed lengths of 1–100, 0–200, and 0–5000 respectively; empty optional fields become null.

Direct Prisma queries use the configured database role. Supabase Data API restrictions or RLS must not be assumed to protect a privileged direct database connection. The server ownership filter is essential; current tests do not prove production RLS policies.

## Persisted model

- User: UUID primary key, unique UUID supabaseAuthId, timestamps.
- CareerProfile: UUID primary key, unique userId foreign key, displayName, optional headline and careerGoals, timestamps.
- Deleting a User cascades to its CareerProfile.
- ensureCurrentUserProfile uses a transaction, uniqueness constraints, and createMany/skipDuplicates so repeated or overlapping provisioning creates one user/profile without overwriting edits.
- Initial migration: 20261015041846_init_users_profiles.

The current careerGoals field is free text. Structured roles, skills, experience, work arrangement, salary, industries, and location preferences belong to Milestone 2. No resume or job-analysis tables exist yet.

## Email confirmation and recovery

Signup passes an explicit callback URL to Supabase. Standard confirmation emails return a code to /auth/callback, which exchanges it for a cookie session and provisions a profile. Recovery requests return through that callback to /update-password; the action verifies the session before updating the password and attempts local sign-out. An already authenticated user can also access the password-update page.

PKCE links require the browser that initiated the request. Missing/invalid codes go to /auth/link-error. The callback accepts only dashboard or update-password destinations, uses the configured APP_URL rather than request host headers, and sends no-store/no-referrer headers. Recovery request responses do not reveal account existence or promise delivery.

The default Supabase sender remains in use. Delivery worked for the addresses tested locally and live, as reported by the owner; general delivery to every recipient is not established. See AUTH_EMAIL_SETUP.md.

## Environments

Secrets stay in ignored .env files or Vercel variables. Generated Prisma output is ignored and generated during builds. Local app runtime historically uses the existing hosted Supabase project; deployment uses the same configured project, not a demonstrated independent production database. Database integration tests are isolated in Docker PostgreSQL 17 at 127.0.0.1:5433/careeros_test, with fixed test-only credentials and no app .env loading.

Browser tests run against localhost:3000 and real Supabase authentication with two disposable accounts. They restore modified profile fields but are not isolated from the app's hosted database in the same way as the integration suite.

## Verification and deferred services

Evidence and limits are recorded in TESTING.md. Actual access-token expiration/refresh, replay of real used/expired email links, and crafted cross-account HTTP requests remain follow-ups. Normal two-account browser isolation and forged ownership fields against real local PostgreSQL have passed.

Object storage, resume processing, AI services, queues, Redis, and background jobs have not been added. Choose them when their milestone requires them.

## Local structured-preferences increment — October 17, 2026

CareerProfile now includes targetRoles, industries, workArrangements, and employmentTypes as PostgreSQL text arrays with empty defaults. A separate preferences form and authenticated server action validate and update only these fields. The existing basic-profile action preserves them. Migration 20261017010000_career_preferences has been applied and tested only in isolated local PostgreSQL. Hosted migration and browser/build verification remain pending; see STRUCTURED_PROFILE_SETUP.md.

## Technical skills increment — October 17, 2026

Career preferences are deployed: the owner supplied passing 11-browser-test and build results, applied the hosted preferences migration, and verified live save/refresh/clear behavior. Technical skills are now implemented locally with a name and optional self-assessed proficiency. Names are normalized to prevent duplicate skills within a profile; saving an existing name updates its level. Removal enforces account ownership. The new related table and proficiency enum were migrated only to isolated local PostgreSQL. Current checks: 83 unit tests, 10 database tests, TypeScript, and lint passed. Build and the 12-test browser suite for this increment are pending. The hosted skills migration and deployment have not been performed. See TECHNICAL_SKILLS_SETUP.md.

## Professional experience — October 17, 2026

Supersedes the pending skills rollout status above: the owner confirmed the build, 12 browser tests, hosted skills migration, and live feature verification. ProfessionalExperience is a separate profile-owned table with title, company, start/end month strings, and optional description. A null endMonth means current employment. Both server validation and database constraints reject invalid/reversed month ranges. Updates and deletes filter by verified identity and record ID; creation derives profileId on the server. Duplicate jobs are allowed. The migration passed local checks and was subsequently applied to hosted Supabase, confirmed by owner-supplied output. Professional experience deployment and live save/refresh/edit/remove were confirmed by the owner.

## Location and commute preferences

CareerProfile now has preferredLocations (text array, empty by default), relocationWillingness (nullable yes/no/undecided), and maxCommuteMinutes (nullable integer, 0–300). Separate authenticated action updates only these fields. Server validation rejects malformed or duplicate scalar inputs; database constraints enforce relocation choices and commute range. Locations are free-text preferences without geocoding. Migration 20261017040000_location_preferences was applied only to isolated local PostgreSQL.

## Salary expectations

Nullable salaryMinCents/salaryMaxCents integers hold exact hundredths for supported USD/CAD/EUR/GBP currencies. salaryCurrency and salaryPeriod accompany any amount; periods are hour/month/year, with no conversion. Server validation and database checks enforce nonnegative bounds, ordered ranges, valid choices, and consistent nullability. All four fields clear when both amounts are blank. A separate authenticated action updates only salary fields. See SALARY_EXPECTATIONS_SETUP.md. Previous location migration and live rollout were confirmed by the owner; salary migration is local only.

## Education

Education is a profile-owned related table with institution, qualification/program, optional fieldOfStudy, month dates, and optional description. A null endMonth means current study; an entry does not certify an awarded qualification. Server validation and a database constraint reject invalid/reversed dates. Update/delete scope combines record ID with verified identity; creation derives profileId. Migration 20261017060000_education is applied only to isolated local PostgreSQL.

## Projects and accomplishments

ProjectAccomplishment is a profile-owned related table with title, optional description/contribution/results, and skills/links arrays. A separate authenticated action derives ownership on create and filters updates/deletes by ID and verified identity. Links accept only absolute HTTP(S) without embedded credentials, are not fetched, and render with noopener/noreferrer. Shared control styling preserves dark-mode consistency. Migration 20261017070000_projects_accomplishments is local only.

## Private resume uploads

Supabase Storage is the source of truth for resume metadata and bytes; no new Prisma table. Immutable UUID-prefixed PDF objects live under auth UUID folders in a private bucket. The app uses the cookie-authenticated client, never a service-role key. Authenticated server actions upload/remove; a no-store attachment route downloads. Owner-folder RLS and restrictive guards are required separately (supabase/resume-storage.sql). Storage configuration and live RLS verification remain pending. See RESUME_STORAGE_SETUP.md.

## Resume review — October 21, 2026

Uploads now precede profile fields. A dedicated dynamic review page reads the selected owned PDF only after an explicit Read resume action. unpdf 1.9.0 extracts text on the server; no AI or OCR. Suggestions are editable and opt-in. Applying reviewed fields authenticates again, verifies source availability, and uses one database transaction for conditional name/headline updates plus duplicate-skipping skill inserts. No schema change. See RESUME_REVIEW_SETUP.md for scope and limits.


## Saved jobs — October 21, 2026

SavedJob belongs directly to User, independently of career profile facts. The /dashboard/jobs page authenticates before querying and selects only the verified user's records; create derives the internal user ID from the verified Supabase identity, and update/delete filter by both record ID and identity. The migration adds one table and enables RLS with no client policies: Prisma server access enforces account ownership, while browser Data API access is not granted. Job title/company are required (200 characters each), pasted description is required (30,000 characters), and the optional link is limited to 2,000 characters and HTTP(S) without embedded credentials. Links are not fetched and descriptions render as escaped text. Saving does not submit an application or perform AI analysis. Existing profile records are unchanged. Add experience uses native details/summary for keyboard-accessible collapse without a dependency.


## Job requirements review - October 26, 2026

SavedJob now stores a bounded JSON requirements list, the reviewed description snapshot, and an integer review version. Suggestions are conservative line/heading rules, not AI or a complete parser. Users select and edit requirements, categories, and required/preferred/unspecified priorities; manual rows are identified by an empty source excerpt. Nonempty excerpts must be literal substrings of the current description. Original descriptions remain unchanged. An authenticated conditional update matches owner, job ID, description snapshot, and review version atomically before replacing the reviewed list and incrementing the version. An empty confirmed selection clears the list. Editing the description retains the old review but labels it stale and deselects all rows. No matching or external API calls are introduced. Existing SavedJob RLS applies to the new columns.

## Signed-in layout and navigation - October 28, 2026

All signed-in pages live under /dashboard and share src/app/dashboard/layout.tsx. The layout is presentation only and is not a security boundary: every page re-verifies the session with getUser (directly or through getCurrentProfile) inside a Suspense boundary, and every server action keeps its own authentication and ownership filter. The overview reads only the current user's profile, resume listing, and saved jobs. Its counts are derived from saved data (for example, a review counts as reviewed only while reviewedDescription equals the current description). Job analysis groups saved jobs by review status and counts reviewed requirements by priority. It does not score fit or call external services. Save actions revalidate the /dashboard layout so the overview and section pages stay consistent. next.config.ts issues temporary (307) redirects from /jobs, /jobs/:id/requirements, and /dashboard/resume-review/:key. The menu reads the current path inside Suspense so dynamic routes can prerender.

## AI service (Milestone 3, Phase 1) - October 30, 2026

Phase 1 adds ai-service/, a separate, stateless Python 3.13 FastAPI service (managed with uv). Nothing in the Next.js app calls it yet, and it is not deployed. See ai-service/README.md and docs/MILESTONE_3_PLAN.md.

- Boundary: Next.js remains the only authentication and authorization boundary. The AI service holds no database or Supabase credentials and never receives user identity. In Phase 2, Next.js will load the signed-in user's own job and profile through the existing owner-scoped queries and send a minimal evidence package.
- Internal authentication: requests are signed with HMAC-SHA256 over `v1:{timestamp}:{request_id}:{sha256(body)}` using a shared secret kept in server-side environment variables. Requests expire after 5 minutes, request ids must be canonical UUIDv4 values, and each id is accepted once (in-process replay cache, so one worker per instance). Bodies are size-limited before parsing.
- Contract: strict Pydantic models in ai-service/app/schemas.py reject unknown fields and cap sizes. Evidence items carry a fixed kind (skill, experience, education, project) and a `<kind>:<uuid>` id, so findings cite exact profile entries. Example files in contracts/match/ are checked by the Python tests and are intended for the Next.js tests in Phase 2.
- Providers: one interface (app/providers/base.py). Phase 1 has a deterministic rules provider and a test-only fake provider. Anthropic (Claude Sonnet by default, decision D1) arrives in Phase 3 and Ollama in Phase 5; selecting them now fails at startup.
- Validation: app/matching/validate.py applies the same code-enforced rules to every provider. Citations must refer to supplied evidence (otherwise the whole result is discarded) and quote it verbatim. Projects never count as professional employment. Stated durations must match the requirement or durations computed from the user's dates. A gap is not allowed for an empty profile area. There is no numeric fit score; responses carry verdict counts only.
- Data handling: logs contain request metadata only (method, path, status, duration, request id), never profile or job text. Validation errors name fields but never echo values, including rejected secrets. Production mode disables the API docs and refuses the fake provider.
- Delivery: a non-root Docker image (python:3.13-slim, locked dependencies, no secrets or tests in the image, health check) and a GitHub Actions workflow (.github/workflows/ai-service.yml) that runs locked install, format, lint, tests, and an image build with no secrets. Actions are pinned to commit SHAs. Vercel ignores ai-service/ via .vercelignore.

## Requirement analysis (Milestone 3, Phase 2) - October 30, 2026

Next.js now calls the AI service, still using only the deterministic rules provider. Code lives in src/lib/ai/ (server-only) and the page is /dashboard/jobs/[id]/match.

- Flow: the server action checks the session, then runJobAnalysis loads the user's own job and confirmed profile by internal user id, checks that the requirement review is current, reserves a run under the daily limit, builds the evidence, sends a signed request, re-validates the response, and saves the result and run status in one transaction.
- Minimization: evidence carries only skill names and levels, experience titles, dates and descriptions, education qualification, field, dates and description, and project title, description, contribution, results, and skills. Company, institution, links, contact details, salary, location, and resume text are never sent. Ids are prefixed by kind; at most 200 entries.
- Validation in Next.js (src/lib/ai/match-validation.ts) repeats the service's rules and rejects the whole response on any violation, so a compromised or faulty service cannot store invented evidence.
- Storage: AiAnalysisRun stores metadata only (status, provider, error code, times) for audit and rate limiting. JobMatchAnalysis stores the requirements sent, findings, counts, a SHA-256 fingerprint of the evidence (to detect profile changes without copying the profile), the review version, and feedback. Both tables tie rows to their owner with composite foreign keys, have RLS enabled with no policies, and use CHECK constraints. Deleting a job keeps its run audit rows (job link set to null).
- Rate limit: AI_ANALYSIS_DAILY_LIMIT (default 20) per rolling 24 hours, counted inside a transaction holding a per-user advisory lock, so concurrent requests cannot exceed it.
- Consent: User.aiCloudConsentAt is required before any non-local provider runs; the rules engine is local and needs none. AI_ANALYSIS_PROVIDER accepts only "rules".
- Replay protection: the AI service remembers request ids per process, which is complete only for one long-running process. Production must run one worker and one instance until the cache moves to a shared store (see ai-service/README.md, "Replay protection in production").
- Line endings: browsers submit form text with CRLF. Job saves and requirement reviews compare descriptions with line endings normalized (sameDescription in src/lib/saved-jobs.ts) and never rewrite the stored text, so review status comparisons stay exact.
- Independence: requirement review never calls the AI service. If the service is down, only the analysis run fails, with a friendly message, and the failure is recorded.

## Anthropic provider and cost controls (Milestone 3, Phase 3) - October 31, 2026

Claude Sonnet 5.5 (`claude-sonnet-5-5`) is an optional provider beside the rules engine, which stays the default and a separate user choice. Cloud analysis is off unless `AI_CLOUD_ENABLED=true`, all cost caps are set, and the account is in `AI_CLOUD_ALLOWED_USERS`. It also needs the user's current, versioned consent. No paid call has been made; every cloud test uses mocked responses.

- Request path: the server action passes the chosen method. Next.js checks consent and the allow-list, builds evidence, and redacts it for the cloud (src/lib/ai/redaction.ts: the profile name, employers, schools, the saved job's company, the account email, and any email address, phone number, or link). It sizes a token budget from the request bytes plus a fixed prompt allowance, and reserves the worst-case cost before calling the AI service.
- Cost ledger (AiAnalysisRun): `reservedMicroUsd` is held while a call is in flight (RESERVED) and while its billing is uncertain (UNRESOLVED: timeouts, failures after the request may have been processed, crashes). `confirmedMicroUsd` is set only from provider-reported usage at verified prices (src/lib/ai/pricing.ts). Charges the provider didn't process are RELEASED. CHECK constraints stop a held state from carrying a confirmed amount. Unresolved charges count toward every cap until reconciled (`reconcileUnresolvedRun`, operator only).
- Caps: the per-user daily count and attempt cap (3x), per-user daily cost, global daily cost, and global calendar-month cost are checked in one transaction, under a per-user advisory lock plus a global lock for cloud runs. An Anthropic Console workspace spend limit is the independent backstop.
- AI service: each request names its provider. Cloud requests must carry a budget, and the prompt is refused if its byte bound exceeds it.
  - One billable call per request. The only retry follows a 429 whose retry-after fits the deadline.
  - `stop_reason` is checked before parsing. Output is structured; no sampling parameters or forced tools are sent.
  - A circuit breaker stops calls after repeated failures.
  - Strict validation: any finding that would be downgraded discards the whole response.
  - Every error reports `billed` (no, yes, or unknown) and usage when known.
  - The Anthropic SDK and HTTP client loggers are pinned to WARNING, because the SDK logs request bodies at DEBUG. In production, unexpected errors are logged by type only.
- Replay protection uses a shared Redis-compatible store (`SET NX EX`) and fails closed. It's required for cloud providers and in production, with TLS when off this machine. See docs/REPLAY_STORE_OPTIONS.md.
- The Anthropic key lives only in the AI service environment. Next.js, Vercel, the browser, CI, and the repository never hold it.
