# CareerOS

CareerOS helps users organize their career information and, in later milestones, evaluate jobs and manage applications. The first users are pursuing software/technology and mechanical engineering roles.

Live application: [CareerOS](https://career-os-flax-chi.vercel.app)
Repository: [Slayfire23/CareerOS](https://github.com/Slayfire23/CareerOS)

## Status — October 16, 2026

Milestone 1 core functionality is complete and deployed: email/password signup and confirmation, sign-in/out, recovery, a protected dashboard, and separate editable profiles. The owner reported successful live signup, profile persistence, logout protection, and password recovery. Follow-up security checks remain explicitly open in TASKS.md; this is not a claim of a comprehensive security audit.

Milestone 2 has not started. Structured career fields and resume management are next. Job matching, AI features, and application tracking are not implemented.

## Available today

- Create an account and confirm its email address.
- Sign in, sign out, and recover a forgotten password.
- Access a protected dashboard and edit display name, headline, and career goals.
- Keep each account's profile separate, with server-side validation and ownership checks.
- Save profile changes in PostgreSQL and retrieve them after refresh or a later sign-in.

Signup and recovery links must be opened in the browser that requested them. Email delivery has been manually verified for tested addresses; the default Supabase sender's wider delivery limitations remain a follow-up.

## Recorded verification

| Check | Latest recorded result |
|---|---|
| Vitest unit tests | 53 passed against the staged recovery implementation |
| PostgreSQL integration tests | 6 passed; owner supplied project output |
| Playwright Chromium tests | 10 passed; owner supplied project output |
| TypeScript, lint, production build | Passed after recovery changes |
| Live signup, profile editing, logout, and recovery | Manually verified by the owner |

See [TESTING.md](TESTING.md) for commands, evidence, and coverage limits. Actual token expiration/refresh and crafted cross-account HTTP tests remain open in [TASKS.md](TASKS.md).

## Stack

Next.js 16.4.1 with TypeScript and React 19.3; Supabase Auth and PostgreSQL; Prisma 7.10.1 with the PostgreSQL adapter; Vercel hosting. Tests use Vitest and Playwright. Development checks have run on Node 24.16.0 with npm 11.13.0. Use Node 24.x and the committed package-lock.json.

## Local setup

Clone the repository and run commands from its root, where package.json lives. The existing Windows checkout is named web; that does not mean a fresh clone needs a nested web directory.

```powershell
git clone https://github.com/Slayfire23/CareerOS.git
cd CareerOS
npm ci
```

Create an ignored `.env` using these placeholders (never commit real credentials):

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@SESSION_POOLER_HOST:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
APP_URL=http://localhost:3000
```

Use a dedicated development Supabase project where possible. The initial live deployment reuses the previously configured project; do not assume local development is isolated from live records. Obtain connection details from Supabase, URL-encode special characters in database passwords, and preserve the connection's required TLS settings. The publishable key is intended for browser use; DATABASE_URL is not. No service-role key is required by this app.

```powershell
npx prisma generate --config prisma7.config.ts
npm run dev
```

Open http://localhost:3000. Follow AUTH_EMAIL_SETUP.md for allowed callback URLs and email testing. Generation creates the ignored Prisma client; it does not migrate a database.

For a new database, review the target and apply committed migrations explicitly:

```powershell
npx prisma migrate status --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
```

The existing Supabase database already has the initial migration. Do not reset it or apply the integration-test configuration to it.

## Checks

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Stop the dev server before building; restart it before running `npx playwright test`. Database tests have a separate configuration. See TESTING.md for commands, account setup, evidence, and limitations.

## Vercel deployment

- Framework: Next.js. Root: repository root. Install command: `npm ci`.
- Build command: `npx prisma generate --config prisma7.config.ts && npm run build`.
- Production variables: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, APP_URL.
- Use the Supabase transaction-pooler connection on port 6543 for the deployed runtime. Keep migration connections separate, using a session/direct connection suitable for migrations.
- APP_URL: `https://career-os-flax-chi.vercel.app`. Update Supabase URLs as documented in AUTH_EMAIL_SETUP.md; redeploy after changing Vercel variables.
- This build does not apply migrations. Review and apply future schema changes separately before releasing code that requires them.
- Do not add disposable account credentials to Vercel. Preview deployments need an intentionally separate environment before using private data.

## Documentation

- [PRD.md](PRD.md): scope, principles, and milestones.
- [ARCHITECTURE.md](ARCHITECTURE.md): implemented system and authorization boundaries.
- [TASKS.md](TASKS.md): completed work and open follow-ups.
- [TESTING.md](TESTING.md): test commands and verified coverage.
- [AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md): confirmation/recovery setup and troubleshooting.
