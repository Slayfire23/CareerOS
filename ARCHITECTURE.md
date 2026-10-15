# CareerOS — Architecture

Status: initial design; no application, dependencies, database, or authentication provider has been configured yet.

## Application structure

Use a modular monolith: one Next.js application with React and TypeScript, backed by PostgreSQL through Prisma. Keep request handling, validation, business rules, and database access separated by responsibility. This supports a small deployment while making important backend behavior independently testable.

Proposed layout:

```text
src/app/                  Pages, layouts, and request entry points
src/features/profiles/    Profile validation and business operations
src/lib/auth/             Server-side identity/session integration
src/lib/db/               Prisma client and database utilities
prisma/                   Schema and committed migrations
tests/                    Integration and browser workflows
```

## Authentication decision

The agreed requirements allow Auth.js or managed authentication; no provider has been selected. Resolve this before implementing accounts. Prefer an established authentication library or provider over a custom password/session system. Provider selection must account for registration, recovery, local development, cost, and supported session storage. Do not assume an installed integration means the user has chosen it.

Authentication answers who is making a request. Authorization determines which records that identity can read or change. The latter remains CareerOS's responsibility even with managed authentication.

## Foundation data model

- User: internal identifier and a unique mapping to the chosen authentication identity. Exact authentication tables depend on the provider.
- CareerProfile: identifier, unique userId foreign key, display name, optional headline, and timestamps.
- One user owns at most one basic career profile. Create it atomically with a local user record or through an idempotent provisioning operation, depending on the authentication integration.
- Scope every profile read and write to the user identity obtained from a validated server-side session. Never accept client-supplied ownership as authorization.
- Reject unexpected ownership fields during validation. Missing or expired sessions must fail before accessing private data.

Later migrations add work experiences, skills, projects, resumes, jobs, job matches, applications, and feedback. Model confirmed information separately from inferred information before adding AI features.

## Environment and database

Commit an `.env.example` with placeholders and explanations; exclude real environment files and secrets from Git. Keep DATABASE_URL and authentication secrets server-side. Validate required configuration and give actionable local setup errors without exposing secrets.

Use separate development and test PostgreSQL databases. Commit Prisma migrations and apply them explicitly. Never reset an existing database without checking its target and obtaining authorization for data loss.

Docker is a possible local PostgreSQL option, not an established prerequisite. During initial inspection, Node, npm, and Git were discoverable, but Docker was not on PATH. Check for an existing database or choose a local/hosted development database before integration testing.

## Verification

Use TypeScript checks and linting for the foundation. Use Vitest for meaningful validation/business-rule tests and database integration tests. Use Playwright for registration, sign-in, protected-dashboard access, profile editing, and sign-out.

Test ownership using two distinct identities and persisted profiles: one account must be unable to read or change the other's record, including crafted requests. Browser tests must exercise the real chosen authentication integration; mocked sessions alone do not verify sign-in.

## Deferred services

Add S3-compatible object storage for resume uploads, an AI API for analysis, and Redis/BullMQ for asynchronous work in later milestones. Do not require these services merely to start the foundation. Choose hosting, monitoring, and production delivery details when deployment requirements are concrete.
