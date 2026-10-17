# CareerOS — Development Checklist

## Inspection and reconciliation

- [x] Locate the existing desktop CareerOS directory.
- [x] Inspect PRD.md, ARCHITECTURE.md, and TASKS.md: all three were empty.
- [x] Reconcile the requirements with the referenced conversation.
- [x] Verify Node, npm, and Git are discoverable; Docker was not found on PATH.
- [ ] Record installed tool versions and verify compatibility with selected dependencies.

## Milestone 1 — Foundation

### Checkpoint 1: application shell

- [ ] Initialize Git if necessary and add appropriate ignores.
- [ ] Scaffold Next.js with TypeScript into the existing project without replacing planning files.
- [ ] Add a simple CareerOS home page and shared application layout.
- [ ] Commit dependency versions in a lockfile.
- [ ] Document local install/start commands.
- [ ] Run lint, type checks, production build, and a local page smoke check.

Learning focus: which code executes in the browser and which executes on the server.

### Checkpoint 2: persistent data

- [ ] Select an accessible development PostgreSQL instance and separate test database.
- [ ] Add Prisma and safe example environment configuration.
- [ ] Resolve the authentication provider before finalizing user identity/schema requirements.
- [ ] Add User and basic CareerProfile models, ownership constraints, and an initial migration.
- [ ] Apply the migration to the development database and verify persistence.

Learning focus: foreign keys express relationships; a unique userId enforces one profile per user.

### Checkpoint 3: authentication and protected dashboard

- [ ] Configure the selected provider/library and required local credentials.
- [ ] Implement registration, sign-in, sign-out, and account recovery behavior supported by that provider.
- [ ] Validate sessions on the server and protect the dashboard and private operations.
- [ ] Provision internal users/profiles idempotently.
- [ ] Implement viewing and editing the current user's basic profile with server validation.
- [ ] Ensure private reads and writes derive ownership from the session.

Learning focus: a protected page does not automatically protect its backing API or server action.

### Checkpoint 4: proof the foundation works

- [x] Add and run Vitest unit tests for validation, authentication, and ownership filters (33 passing).
- [ ] Add and run PostgreSQL integration tests against a separate test database.
- [ ] Verify unauthenticated and expired sessions cannot access private data.
- [ ] Verify account A cannot read or change account B's profile through crafted requests.
- [ ] Add and run Playwright registration/sign-in/profile/sign-out workflows.
- [x] Verify two real test users can maintain distinct persisted profiles (user-reported manual check).
- [x] Run lint, type checks, unit tests, and production build; record results and test limitations in TESTING.md.
- [x] Fix Prisma dependency audit findings by updating matched packages to 7.10.1; production dependency audit reports zero vulnerabilities.
- [ ] Resolve upstream braces advisory in Next.js ESLint tooling (5 high-severity affected-package entries remain; no patched braces release available).
- [ ] Document environment setup, migrations, tests, and troubleshooting.

Milestone 1 is complete only after the working application passes these checks. Planning documents alone do not complete it.

## Later milestones

- [ ] Milestone 2: full career profile and multiple resume versions.
- [ ] Milestone 3: explainable AI job analysis and resume selection.
- [ ] Milestone 4: application tracking and initial deployment for both users.
- [ ] Later: automatic discovery, recommendation learning, interview coaching, email integration, and background processing.
