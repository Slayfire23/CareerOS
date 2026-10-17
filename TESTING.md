# CareerOS testing

## Latest verification — October 15, 2026

- `npm test`: 33 tests passed across 2 files (Vitest 5.0.5).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.4.1 and Cache Components enabled.
- Node runtime: 24.16.0; Node type definitions updated to the 24.x line for test-runner compatibility.
- Updated Prisma CLI, client, and PostgreSQL adapter together to 7.10.1 and regenerated the client. This replaces vulnerable deepmerge-ts and mysql2 dependencies. All checks above passed again after the update.
- `npm audit --omit=dev`: 0 vulnerabilities. Full `npm audit`: 5 high-severity affected-package entries from one unpatched braces advisory (GHSA-vfj7-8cjw-p6xm) in the Next.js ESLint dependency chain. Latest plugin 16.4.2 still depends on fast-glob 3.3.1. The suggested forced fix downgrades eslint-config-next to 14.2.35; it was not applied to this Next.js 16 app. Full remediation remains pending an upstream fix. Lint patterns must remain trusted project configuration.

Run `npm test` for a single run or `npm run test:watch` while editing. Also run `npm run typecheck`, `npm run lint`, and `npm run build` before publishing changes.

## What these tests prove

The tests import the actual authentication actions, profile save action, and profile reader. Supabase Auth, Prisma, and Next.js response helpers are replaced with test doubles. No real accounts, database credentials, or network connections are needed.

- Missing and invalid sessions cannot reach profile database operations.
- Reads and updates are scoped to the identity returned by Auth, including when forged ownership fields or previous form state are supplied.
- Only the three editable fields are sent to Prisma for updates, and only those fields are selected for reads.
- Missing fields, files masquerading as text, empty names, and excessive lengths are rejected. Boundary lengths are accepted.
- Optional fields can be cleared, write failures do not expose internal errors, and missing profiles cannot report a successful save.
- Authentication failure cannot provision a profile; provisioning failure cannot redirect as if setup succeeded.

## Limits and outstanding checks

These are unit tests of the application boundary, not live database or browser security tests. They verify the Prisma filter sent by our code; they do not execute that filter in PostgreSQL or prove RLS, cookies, session refresh, redirects in a browser, or concurrent provisioning behavior. A build checks compilation, not the deployed authentication flow.

Manual tests reported successful by the project owner: sign-in, sign-out, protected dashboard access, profile persistence after refresh and sign-in, and distinct profiles for two accounts.

Next: add database integration tests against a separate disposable test database and browser tests using dedicated test identities. Do not run destructive test fixtures against the existing development accounts. Public signup/email confirmation and password recovery remain deferred until email delivery is configured.
