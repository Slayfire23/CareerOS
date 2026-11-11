# Local infrastructure recovery checklist (after the Docker reinstall)

November 10, 2026. **Checklist only. Steps 3–7 have not been run.** Every step targets this machine only. Nothing here connects to, resets, migrates or seeds hosted Supabase.

## Verified read-only on 2026-11-10

| Check | Result |
|---|---|
| Docker engine | Docker Desktop, local named pipe. The only container is `careeros-test-db`, rebuilt today on `127.0.0.1:5433` with 17 migrations, and it passes all 176 integration tests |
| Ports | 54321–54324, 6379, 8010, 3000 and 3100 all free (none listening) |
| `supabase/config.toml` | `project_id = "careeros"`; API 54321, DB 54322 (Postgres 17), Studio 54323, Mailpit 54324 |
| `.env` | Only `127.0.0.1:54321`, `127.0.0.1:54322`, `127.0.0.1:8010`, `localhost:3000` |
| `.env.playwright.local` | Only `127.0.0.1:54321` |
| `ai-service/.env` | Only `127.0.0.1:6379` |
| `.env.hosted-production` | **Contains the production hosts** (`esgquaxaacksykxreuwd.supabase.co` and the Supabase pooler). Nothing below reads it: `prisma7.config.ts` loads only `.env`, and `prisma.production.config.ts` is never used here |
| `scripts/setup-local-supabase.mjs` | Exits unless `supabase status` reports `127.0.0.1`/`localhost` for both API and DB. Runs `prisma migrate deploy` with `DATABASE_URL` set to that local DB URL. Provisions only `e2e-a@careeros.test` and `e2e-b@careeros.test` through the local Auth API |

## Steps (each re-verifies its target before running)

1. **Stop condition.** If any check above changes (for example, `.env` names a non-local host), stop and report. Don't continue.
2. **Free space.** The first `supabase start` downloads the Supabase images, several GB in total, from the official registries. These are the same images the documented setup uses. Check free disk space first.
3. **Start the local stack:** `npm run supabase:start`. Afterwards, `npx supabase status -o env` must show `API_URL` and `DB_URL` on `127.0.0.1`. If not, stop.
4. **Compare `.env` with the new stack.** The setup script refuses a mismatch. If the reinstalled stack shows different local keys, only the git-ignored `.env` gets updated, with the values `supabase status` reports. A diff of hostnames only (no secrets) is shown first.
5. **Local setup:** `npm run db:local:setup`.
   - It applies `supabase/resume-storage.sql` if it's missing.
   - It runs `prisma migrate deploy` (17 migrations) against `127.0.0.1:54322` only.
   - It creates the two disposable local test accounts.
   - Report before running: the DB URL host and port, and the migration count.
   - Afterwards, `npx prisma migrate status --config prisma7.config.ts` must show `127.0.0.1:54322` and "up to date".
6. **Replay store:** `docker run -d --name careeros-replay-store -p 127.0.0.1:6379:6379 valkey/valkey:8`. It binds to this machine only.
7. **Verify:**
   - the browser tests against `next start -p 3100` with `AI_ANALYSIS_DAILY_LIMIT=1000`;
   - the AI service's Valkey replay tests;
   - `pg_isready` on 54322 and 5433.

   No reset is needed: the volumes are new and empty.

**Never in this checklist:** `supabase db reset` against anything but the local stack, `supabase link`, `supabase db push`, any command with `--db-url` pointing elsewhere, `prisma.production.config.ts`, or loading `.env.hosted-production`.
