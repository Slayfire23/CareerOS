# CareerOS

CareerOS helps users organize their career information and, in later milestones, evaluate jobs and manage applications. The first users are pursuing software/technology and mechanical engineering roles.

Live application: [CareerOS](https://career-os-flax-chi.vercel.app)
Repository: [Slayfire23/CareerOS](https://github.com/Slayfire23/CareerOS)

## Status — October 28, 2026

Milestone 1 (accounts, recovery, protected dashboard, private profiles) and the Milestone 2 profile/resume/saved-job features are implemented, deployed, and owner-verified live. This includes the October 26 job-requirements review. Foundation security follow-ups remain open in [TASKS.md](TASKS.md); this is not a claim of a comprehensive security audit. Job matching, AI features, and application tracking are not implemented.

The foundation audit is **GO** (October 28). The next milestone is a UI/UX redesign; Python/AI work follows it. See [docs/FOUNDATION_COMPLETION_REPORT.md](docs/FOUNDATION_COMPLETION_REPORT.md).

## Where things are (UI redesign branch)

After signing in you land on **/dashboard**, an overview of your saved jobs and profile. Each section has its own page: `/dashboard/profile`, `/preferences`, `/skills`, `/experience`, `/education`, `/projects`, `/resumes`, `/jobs`, and `/analysis` (job requirement review). Old `/jobs` addresses redirect.

## Available today

- Create an account and confirm its email address; sign in, sign out, and recover a forgotten password.
- Edit display name, headline, career goals, target roles, industries, work arrangements, and employment types.
- Manage technical skills, professional experience, education, optional projects/accomplishments, location/commute preferences, and salary expectations.
- Upload, list, download, and delete private PDF resume versions; review resume-based name/headline/skill suggestions before saving.
- Save private jobs and review, edit, save, or clear source-backed job requirements (no qualification assessment yet).
- Every private read/write is ownership-checked on the server.

Signup and recovery links must be opened in the browser that requested them. Email delivery has been manually verified for tested addresses; the default Supabase sender's wider delivery limitations remain a follow-up.

## Verification — October 28, 2026

Directly executed on branch `foundation-verification`:

| Check | Result |
|---|---|
| Vitest unit tests | 224 passed, 15 files |
| PostgreSQL integration tests (local Docker) | 24 passed |
| TypeScript, ESLint | Passed |
| Production build | Passed, including `/dashboard/jobs/[id]/requirements` |
| `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities after a non-forced fast-uri lockfile patch |
| Playwright Chromium (all 22) | Passed against `npm run dev` on the local Supabase stack (Auth, Storage, PostgreSQL in Docker) |
| Hosted `prisma migrate status` (read-only) | 10 of 10 migrations applied, including `20261026010000_job_requirements` |

Development and browser tests never touch hosted Supabase; see [DEV_ENVIRONMENT_SETUP.md](DEV_ENVIRONMENT_SETUP.md). See [TESTING.md](TESTING.md) for commands and coverage limits.

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

`.env` must point at the local Supabase stack (`npm run supabase:start`, then `npm run db:local:setup`); see [DEV_ENVIRONMENT_SETUP.md](DEV_ENVIRONMENT_SETUP.md). Production migrations use `prisma.production.config.ts` with the ignored `.env.hosted-production`, and browser tests refuse to run against production. Obtain connection details from Supabase, URL-encode special characters in database passwords, and preserve the connection's required TLS settings. The publishable key is intended for browser use; DATABASE_URL is not. No service-role key is required by this app.

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
- Preview builds need no environment variables: the Prisma client is created on first query, not at import. Leave DATABASE_URL and Supabase variables unset for Preview. Never copy production values there. Previews are build checks only: pages that need Auth or the database return errors at runtime, by design. Functional testing uses the local Supabase stack.

## Documentation

- [PRD.md](PRD.md): scope, principles, and milestones.
- [ARCHITECTURE.md](ARCHITECTURE.md): implemented system and authorization boundaries.
- [TASKS.md](TASKS.md): completed work and open follow-ups.
- [TESTING.md](TESTING.md): test commands and verified coverage.
- [AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md): confirmation/recovery setup and troubleshooting.
- [docs/FOUNDATION_COMPLETION_REPORT.md](docs/FOUNDATION_COMPLETION_REPORT.md): October 28 foundation audit, blockers, and AI-phase acceptance criteria.
- Per-feature `*_SETUP.md` files: rollout notes for each Milestone 2 increment.
