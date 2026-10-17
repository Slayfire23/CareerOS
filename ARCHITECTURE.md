# CareerOS — Architecture

Status: implemented foundation, October 16, 2026. Milestone 2 has not started.

## Runtime and structure

One Next.js 16.4.1 application uses React 19.3 and TypeScript, Supabase Auth, and Supabase-hosted PostgreSQL through Prisma 7.10.1 and @prisma/adapter-pg. Vercel serves the deployed application. Cache Components is enabled.

```text
src/app/auth/actions.ts           Signup, sign-in, sign-out server actions
src/app/auth/recovery-actions.ts  Reset-email request and password update
src/app/auth/callback/route.ts    PKCE code exchange and fixed destinations
src/app/dashboard/               Protected page and profile save action
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
