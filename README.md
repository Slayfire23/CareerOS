# CareerOS

CareerOS is a private career organizer. You record what you have actually done, keep every version of your resume, and save the jobs you're considering. Then you review each posting's requirements against its own text. The long-term goal is explainable, AI-assisted job analysis that never invents qualifications.

- **Live app:** https://career-os-flax-chi.vercel.app
- **Repository:** https://github.com/Slayfire23/CareerOS

## Project status (October 29, 2026)

| Area | Status |
|---|---|
| Accounts, email confirmation, password recovery | Live |
| Structured career profile (skills, experience, education, projects, preferences, salary) | Live |
| Private resume versions with reviewed suggestions | Live |
| Saved jobs and manual requirement review | Live |
| UI/UX redesign: dashboard overview and dedicated section pages | Live, verified in production |
| AI Engineering phase: PRD Milestone 3 (analysis, retrieval, agents) | **Planned, not implemented** |
| Application tracking: PRD Milestone 4 | Planned, not implemented |

## Features

**Dashboard overview (`/dashboard`)**
- A summary built only from what you saved: quick actions, saved jobs with review status, and a profile summary with progress and missing sections.
- Nothing is inferred or scored.

**Dedicated pages**

| Page | What you can do |
|---|---|
| `/dashboard/profile` | Name, headline, career goals |
| `/dashboard/preferences` | Target roles, industries, work arrangement, employment type, location and commute, salary range |
| `/dashboard/skills` | Skills with optional self-assessed proficiency |
| `/dashboard/experience`, `/dashboard/education` | Add, edit, and remove entries. Dates display as "Jun 2023 – Present" |
| `/dashboard/projects` | Optional projects and accomplishments from any field |
| `/dashboard/resumes` | Upload private PDF versions (2 MiB max); download or delete them |
| `/dashboard/resumes/review/[key]` | Review name, headline, and skill suggestions from a resume before anything is saved |
| `/dashboard/jobs` | Save postings (title, company, optional link, pasted description); edit or remove them |
| `/dashboard/analysis` | Saved jobs grouped by requirement-review status |
| `/dashboard/jobs/[id]/requirements` | Manual requirement review (see below) |

**Manual requirement review**
- Simple text rules suggest requirements from a posting.
- You select, edit, categorize, and prioritize each one, then confirm.
- Every suggestion links to the line of the posting it came from.
- If the description changes later, the review is flagged as out of date.
- This is not an AI assessment and does not score your fit.

**Throughout**
- Light and dark mode, a responsive layout with a mobile menu, and loading and empty states.
- Inline confirmation before any delete or remove.
- Server-side ownership checks on every private read and write.

## Tech stack

- **Framework:** Next.js 16.4.1 (App Router, Cache Components), React 19.3, TypeScript 5, Tailwind CSS 4
- **Data:** PostgreSQL via Prisma 7.10 with the `pg` driver adapter
- **Auth and storage:** Supabase Auth (email and password, PKCE) and Supabase Storage (private bucket with owner-folder RLS)
- **PDF text extraction:** `unpdf`
- **Testing:** Vitest (unit and database integration), Playwright (Chromium end-to-end)
- **Local development:** Supabase CLI 2.121.0 (pinned dev dependency) running the full Supabase stack in Docker
- **Hosting:** Vercel. Production uses a hosted Supabase project.

Use Node 24.x (checks ran on Node 24.16.0, npm 11.13.0) and the committed `package-lock.json`.

## Local development

Development uses a **local Supabase stack** in Docker, so it never touches production data. Full details, including ports and resetting, are in [DEV_ENVIRONMENT_SETUP.md](DEV_ENVIRONMENT_SETUP.md).

**Prerequisites:** Node 24, Docker Desktop.

1. **Install dependencies.** This also installs the pinned Supabase CLI.

   ```powershell
   git clone https://github.com/Slayfire23/CareerOS.git
   cd CareerOS
   npm ci
   ```

2. **Start local Supabase.** The first run downloads the Supabase images, which takes a few GB.

   ```powershell
   npm run supabase:start
   ```

3. **Create `.env`** (ignored by Git). Use the values printed by `npx supabase status -o env`:

   ```dotenv
   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
   NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from supabase status>
   APP_URL=http://localhost:3000
   ```

4. **Prepare the database.** This step is idempotent and refuses to run against anything that isn't local. It does three things:
   - applies the storage policies
   - applies the Prisma migrations
   - creates two disposable test accounts in `.env.playwright.local`

   ```powershell
   npx prisma generate --config prisma7.config.ts
   npm run db:local:setup
   ```

5. **Run the app.**

   ```powershell
   npm run dev
   ```

6. **Create a local account.** Open http://localhost:3000 and sign up. Confirmation emails arrive in **Mailpit** at http://127.0.0.1:54324, not your real inbox. Open the link in the same browser.

Stop the stack with `npm run supabase:stop`. Local data persists in Docker volumes.

## Testing

| Suite | Command | Notes |
|---|---|---|
| Unit | `npm test` | Supabase, Prisma, and Next helpers are mocked |
| Database integration | `npx vitest run --config vitest.integration.config.mts` | Separate Docker Postgres on port 5433 (setup in [TESTING.md](TESTING.md)) |
| End-to-end | `npx playwright test` | Needs `npm run dev`. Refuses to run unless the app points at local Supabase |
| Types and lint | `npm run typecheck` and `npm run lint` | |
| Production build | `npm run build` | Builds without any environment variables |

Latest results (October 29, 2026): 229 unit, 25 integration, and 27 Chromium tests passed, along with TypeScript, lint, and a clean production build. A scripted responsive audit covered 15 pages at phone, tablet, and desktop widths in light and dark mode. See [TESTING.md](TESTING.md) for history and coverage limits.

## Deployment

- Vercel deploys `main` to production. The build command is `npx prisma generate --config prisma7.config.ts && npm run build`.
- **Production variables:** `DATABASE_URL` (transaction pooler, port 6543), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL`.
- **Preview deployments** are build checks only. Leave the database and Supabase variables unset for Preview, and never copy production values there.
- **Migrations are never applied by the build.** Review them and apply them separately, with approval:

  ```powershell
  npx prisma migrate status --config prisma.production.config.ts
  npx prisma migrate deploy --config prisma.production.config.ts
  ```

  This reads credentials from the ignored `.env.hosted-production`.

## Roadmap: AI Engineering phase (PRD Milestone 3, planned)

Nothing in this phase is implemented yet. The product rules in [PRD.md](PRD.md) apply:
- never invent experience or qualifications
- keep confirmed facts, preferences, and AI inferences separate
- require the user's approval before anything is saved

Planned work, to be scoped one increment at a time:

1. **Explainable job analysis.** Compare a job's confirmed requirements with the confirmed profile, show strengths, gaps, and uncertainty, and cite the evidence for each.
2. **Resume recommendations.** Suggest which existing resume version fits a role, with reasons.
3. **AI services.** A Python service, retrieval over the user's own data (RAG), and agent and MCP tooling. Technology choices will be documented before implementation.
4. **Later.** Application tracking, then optional job discovery and interview preparation.

## Known limitations and pending work

**Security verification still open** (tracked in [TASKS.md](TASKS.md)):
- Real access-token expiry, refresh, and revocation.
- Crafted cross-account HTTP requests. Ownership is enforced and integration-tested at the server-action level.
- Reused or expired email links.
- Broader email delivery: the default Supabase sender has low limits.

**Product limitations:**
- Requirement suggestions use simple text rules and can miss items.
- Resume suggestions cover name, headline, and skills only. Scanned PDFs (OCR) aren't supported.
- Resumes have no malware scanning or storage quotas yet.

**Awaiting owner approval:**
- Apply migration `20261028010000_enable_row_level_security` to production. It's a no-op there, because production RLS is already enabled.
- Check production storage for leftover test-fixture PDFs from a since-fixed test cleanup bug.

This README describes verified behavior. It is not a claim of a comprehensive security audit.

## Documentation

- [PRD.md](PRD.md): vision, principles, and milestones
- [ARCHITECTURE.md](ARCHITECTURE.md): system design, routes, and authorization boundaries
- [DEV_ENVIRONMENT_SETUP.md](DEV_ENVIRONMENT_SETUP.md): local Supabase, environments, and safety guards
- [TESTING.md](TESTING.md): test commands, evidence, and coverage limits
- [TASKS.md](TASKS.md): completed work and open follow-ups
- [AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md): email confirmation and recovery
- [docs/FOUNDATION_COMPLETION_REPORT.md](docs/FOUNDATION_COMPLETION_REPORT.md): foundation audit and readiness decision
- `*_SETUP.md`: rollout notes for each profile and resume feature
