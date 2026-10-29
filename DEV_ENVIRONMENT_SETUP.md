# Development environment (local Supabase)

CareerOS development and browser testing run against a **local Supabase stack** in Docker: PostgreSQL, Auth, Storage, and a Mailpit inbox. No hosted project is used. That keeps both hosted free-tier projects untouched and avoids a paid plan.

| Environment | Auth, Storage, database | Local file | Used by |
|---|---|---|---|
| Production | Hosted Supabase project named "CareerOS Dev" (ref `esgquaxaacksykxreuwd`), despite its name | `.env.hosted-production` (local copy for reviewed migrations only) | Vercel (its own variables), `prisma.production.config.ts` |
| Development | Local Supabase stack, project id `careeros` | `.env` | `npm run dev`, `prisma7.config.ts`, `scripts/setup-local-supabase.mjs`, all Playwright tests |
| Integration tests | Separate local Docker PostgreSQL `careeros-test-db` (no Auth) | none (fixed in `tests/support/local-database.ts`) | `prisma.integration.config.ts`, `vitest.integration.config.mts` |

All `.env*` files are ignored by Git. Never commit them, paste their values into chat or issues, or add them to Vercel. The local stack's keys are Supabase's standard local-development keys, not production secrets.

## Ports on this machine

| Port | Service |
|---|---|
| 3000 | CareerOS (`npm run dev`) |
| 5432 | Native Windows PostgreSQL (not used by CareerOS) |
| 5433 | `careeros-test-db`: integration tests |
| 5434 | `full-stack-academy-db`: another project; leave it alone |
| 54321 | Local Supabase API (Auth, Storage, REST) |
| 54322 | Local Supabase PostgreSQL (development database) |
| 54323 | Local Supabase Studio |
| 54324 | Mailpit: catches every local signup and recovery email |

The Supabase CLI binds 54321–54324 on all interfaces. Keep Windows Firewall blocking inbound access to them on public networks.

## Prerequisites (once)

1. Docker Desktop running.
2. `npm ci`. This installs the pinned Supabase CLI (`supabase` 2.121.0) as a dev dependency, so no global install is needed.

## Daily use

```powershell
npm run supabase:start    # first run downloads the Supabase images (several GB)
npm run db:local:setup    # idempotent: storage policies, Prisma migrations, test accounts
npm run dev
npx playwright test
npm run supabase:stop     # data persists in Docker volumes
```

`npm run db:local:setup` refuses to run unless `.env` matches what `supabase status` reports for the local stack. It then does three things:

1. Applies [supabase/resume-storage.sql](supabase/resume-storage.sql) if its policies are missing.
2. Runs `prisma migrate deploy` against the local database.
3. Creates or repairs two confirmed disposable accounts (`e2e-a@careeros.test`, `e2e-b@careeros.test`) with random passwords, and writes them to `.env.playwright.local`.

## First-time `.env`

`.env` must contain the local values. Read them from `npx supabase status -o env`:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from supabase status>
APP_URL=http://localhost:3000
```

Keep using `localhost:3000` in the browser. Auth redirect URLs in [supabase/config.toml](supabase/config.toml) are configured for it.

## Safety guards

- `playwright.config.ts` resolves the app's env exactly as `next dev` does. It refuses to run unless the Supabase API and the database are on `127.0.0.1`/`localhost` and `.env.playwright.local` names the same API URL. Hosted projects are always rejected.
- Unit tests mock Supabase and Prisma. Integration tests use only the fixed `careeros-test-db` address.
- Only `prisma.production.config.ts` can reach production, and only through `.env.hosted-production`.
- One gap remains: a dev server started with production env variables in the shell would not be detected. Start it with plain `npm run dev`.

## Local auth settings (`supabase/config.toml`)

- Site URL: `http://localhost:3000`.
- Redirect URLs: `/auth/callback` and `/auth/callback?next=/update-password`.
- Email confirmation is required.
- Minimum password length is 12.

Realtime, Edge Functions, and Analytics are disabled because CareerOS doesn't use them. Open Mailpit at http://127.0.0.1:54324 to follow confirmation and recovery links in the same browser.

## Resetting local data

`npx supabase db reset` wipes the local database. Afterwards, run `npm run db:local:setup` again. It never affects hosted projects.

## Production migrations (approval required)

```powershell
npx prisma migrate status --config prisma.production.config.ts
npx prisma migrate deploy --config prisma.production.config.ts
```

Production Auth URLs, Storage, and Vercel variables are not changed by this setup.
