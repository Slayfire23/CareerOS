# CareerOS testing

Updated October 16, 2026. These are the latest recorded results, not a new execution of every suite during this documentation update.

## Evidence

| Check | Recorded result | Evidence |
|---|---|---|
| Unit tests | 53 passed, 3 files | Executed against staged recovery implementation with installed project dependencies |
| PostgreSQL integration | 6 passed, 1 file | Owner supplied output from isolated local PostgreSQL |
| Chromium browser tests | 10 passed | Owner supplied output against localhost with real Auth |
| TypeScript | Passed | Staged checks and owner-supplied project output; final build also checked types |
| ESLint | Passed | Owner supplied final output after recovery changes |
| Production build | Passed | Owner supplied final Next.js 16.4.1 output including recovery routes |
| Live flows | Passed, user-reported | Sign-in, profile save/refresh, logout protection, fresh signup/confirmation, password recovery |

The owner explicitly confirmed rejection of the previous password during local recovery testing and later reported the live recovery sequence successful. This is manual evidence, not an automated production test.

## Unit tests

```powershell
npm test
npm run test:watch
```

Vitest tests the real server actions/readers with Supabase, Prisma, and Next response helpers replaced by test doubles. Coverage includes authentication rejection, profile field validation, ownership filters, ignored forged ownership fields, provisioning sequencing, recovery input validation, uniform provider-error responses, callback destinations, and trusted app-origin validation. No live accounts are required.

## PostgreSQL integration tests

Start the existing container:

```powershell
docker start careeros-test-db
docker exec careeros-test-db pg_isready -U careeros_test -d careeros_test
```

On a machine without that container, create it once:

```powershell
docker run --name careeros-test-db -e POSTGRES_USER=careeros_test -e POSTGRES_PASSWORD=local_test_only -e POSTGRES_DB=careeros_test -p 127.0.0.1:5433:5432 -d postgres:17
```

From the project root:

```powershell
npx prisma generate --config prisma7.config.ts
npx prisma migrate deploy --config prisma.integration.config.ts
npx vitest run --config vitest.integration.config.mts
```

The integration configuration uses only the fixed local database address from tests/support/local-database.ts; it does not load the app's .env. No reset is required. Fixtures use random identities and cleanup deletes only those generated users, with cascading profile deletion.

The six tests exercise concurrent/idempotent provisioning, separate persisted profiles, forged ownership input, unauthenticated operations, preservation of edits, and uniqueness/foreign-key constraints. Prisma and PostgreSQL are real; Supabase identity and Next response helpers are mocked. This does not test Supabase RLS or real session expiration.

## Browser tests

Install Chromium once:

```powershell
npx playwright install chromium
```

Create ignored `.env.playwright.local` with two different disposable, confirmed Supabase accounts:

```dotenv
E2E_TEST_EMAIL=first-test-account@example.com
E2E_TEST_PASSWORD=REPLACE_WITH_TEST_PASSWORD
E2E_TEST_EMAIL_B=second-test-account@example.com
E2E_TEST_PASSWORD_B=REPLACE_WITH_SECOND_TEST_PASSWORD
```

Verify these remain ignored: `git check-ignore .env .env.playwright.local`. Do not use personal accounts. Keep passwords current after manual recovery tests.

Run `npm run dev`, then in another terminal:

```powershell
npx playwright test
```

The configuration targets localhost:3000 with fresh browser sessions. It does not automatically test Vercel. Ten tests cover sign-in/out, save-and-refresh persistence, two-account isolation and switching, signed-out redirects, missing-session reads/writes, form validation, recovery navigation, protected new-password access, and a missing-code callback. Modified profiles are restored; inspect the disposable accounts if cleanup reports a failure. Traces/screenshots/videos are disabled; runner output is under the OS temporary directory.

These browser tests do not send confirmation/recovery emails or change passwords. Follow AUTH_EMAIL_SETUP.md for the manual email flow. Normal account switching does not prove resistance to crafted HTTP requests. Cookie deletion does not prove real token expiration/refresh behavior.

## Final checks and outstanding audit

```powershell
npm run typecheck
npm run lint
npm run build
```

Stop the development server before building into the same .next directory. Restart it for browser tests.

Last successful dependency audit recorded October 15, 2026: updating Prisma CLI/client/adapter to 7.10.1 resolved the Prisma-chain findings; `npm audit --omit=dev` reported 0 vulnerabilities. Full audit retained 5 high-severity affected-package entries from one braces advisory, GHSA-vfj7-8cjw-p6xm, through Next.js ESLint tooling. These are not five independent flaws. The suggested forced fix downgraded eslint-config-next to 14.2.35 and was not applied. A later audit attempt failed because the registry was unreachable; a current clean audit is not claimed.

Recheck with `npm audit` and `npm audit --omit=dev`. Track the upstream patch rather than blindly using `npm audit fix --force`.

Open scenarios: actual expired/refreshed/revoked sessions, crafted cross-account HTTP requests, real reused/expired email links, production RLS policy verification, and broader recipient delivery. See TASKS.md.

## Structured preferences increment — October 17, 2026

Directly executed: 67 unit tests across 4 files, 8 integration tests, and an existing-row migration-preservation check passed. TypeScript and lint passed. The production build was blocked by Windows sandbox junction permissions. Browser tests now total 11, but the suite has not been executed against this increment. The previous 10 passing browser tests above describe the foundation only. See STRUCTURED_PROFILE_SETUP.md for an isolated local app run before applying the hosted migration.

## Technical skills increment — October 17, 2026

Career preferences are deployed: the owner supplied passing 11-browser-test and build results, applied the hosted preferences migration, and verified live save/refresh/clear behavior. Technical skills are now implemented locally with a name and optional self-assessed proficiency. Names are normalized to prevent duplicate skills within a profile; saving an existing name updates its level. Removal enforces account ownership. The new related table and proficiency enum were migrated only to isolated local PostgreSQL. Current checks: 83 unit tests, 10 database tests, TypeScript, and lint passed. Build and the 12-test browser suite for this increment are pending. The hosted skills migration and deployment have not been performed. See TECHNICAL_SKILLS_SETUP.md.

## Professional experience — October 17, 2026

Directly executed: 95 unit tests, 12 local PostgreSQL integration tests, TypeScript, and lint passed. The new integration tests cover create/edit/delete, preserved profile fields, cross-account update/delete rejection, and expired-session rejection. Added a browser test for persistence, editing to current employment, removal, and account isolation; the owner supplied passing output for all 13 browser tests and the production build. The owner also supplied successful hosted migration output for 20261017030000_professional_experience. Professional experience deployment and live save/refresh/edit/remove were confirmed by the owner. The preceding skills increment passed build and all 12 browser tests and was verified live by the owner.

## Location and commute preferences

Directly executed: 112 unit tests, 13 local database tests, TypeScript, lint, and diff whitespace checks passed. Local migration and client generation succeeded. Browser coverage added for save/refresh/clear, zero-minute commute, and two-account isolation (14 total browser tests, execution pending). Production build, hosted migration, deployment, and live checks remain pending.

## Salary expectations

Location preferences passed the production build and all 14 browser tests; hosted migration and live save/refresh/clear were confirmed by the owner. Salary implementation passed 135 unit tests, 14 isolated PostgreSQL tests, TypeScript, and lint. All 15 browser tests and the production build passed (owner supplied output). Hosted Prisma reported no pending migrations. The owner pushed/deployed and verified salary save/refresh/edit/clear on the live site.

## Education entries

Directly executed: 148 unit tests, 16 local PostgreSQL integration tests, TypeScript, lint, and diff whitespace checks passed. Coverage includes optional field clearing, date validation, create/edit/remove, profile preservation, and rejection of foreign-account updates/deletes and expired sessions. Client generation and local migration succeeded. Added a browser test (16 total browser tests; execution pending). Production build, hosted migration, deployment, and live verification remain pending.

## Dark-mode form styling

Shared CSS now declares the active native color scheme and explicit control/option surfaces, text, placeholders, focus outlines, and readable disabled colors. Native month appearance and calendar affordances remain intact. Added e2e/dark-mode-forms.spec.ts covering dropdown options, focused/selected controls, month inputs, current-study/work disabled end dates, fieldset-disabled relocation, and a light-mode regression check. It does not save account data. TypeScript and lint passed. The initial browser run found a disabled-selector specificity issue, now corrected and verified with the current stylesheet in isolated Chromium. After the owner restarted the server, the Chromium dark-mode regression passed against the actual app. Both Education month-picker icons were clicked and native picker keyboard selection populated the input values without typing. The regression now checks this for Education and Professional Experience. No account data was saved. OS-specific popup appearance in other browsers remains unverified.
