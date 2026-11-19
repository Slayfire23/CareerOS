# CareerOS V1: production backup procedure (run only by the owner, after approval)

November 17, 2026. **Prepared and dry-run locally only; nothing here has been run against production.** The backup must be taken, and verified, before `prisma migrate deploy` (see `V1_PRODUCTION_MIGRATION_CHECKLIST.md`).

## What gets backed up, and why that's enough

- **Required: the `public` schema**, in PostgreSQL custom format. It holds all of CareerOS's tables (8 today, `_prisma_migrations` included), their data, constraints, indexes, RLS settings and grants. The 10 pending migrations touch nothing else, so this is the backup that a migration recovery needs.
- **Not included: Supabase's own schemas** (`auth`, `storage` and others). The migrations don't touch them, and Supabase manages them. An optional full-project dump is in §6.

The free tier has no point-in-time recovery and no downloadable daily backups, so this dump is the only way back.

## Confirmed connection (local check, no credentials shown)

`.env.hosted-production` → `DATABASE_URL`:
- role `postgres` (username `postgres.<production project ref>`);
- the **Supavisor session pooler** (`*.pooler.supabase.com`), port **5432**, database `postgres`.

Session mode gives one dedicated server connection per client, so it supports `pg_dump`, `pg_restore` and `prisma migrate deploy` (advisory locks). It's also Supabase's IPv4 path. It isn't the transaction pooler (port 6543), which must not be used for these. Vercel's production `DATABASE_URL` also connects as `postgres` on port 5432. Both resolve to the same role, which owns every table.

## Dry run (local, passed)

A disposable database was built in production's state: 10 migrations, RLS on all 8 tables, rows seeded. It was put through these exact steps with the `postgres:17` image:

| Step | Result |
|---|---|
| Dump | exit 0, 0 errors; the log contains no password or connection string |
| Contents (`pg_restore --list`) | 8 tables, 8 table data entries, 8 RLS entries, `_prisma_migrations` data present |
| Restore into an empty disposable database | exit 0 |
| Comparison | users, jobs, 10 migration rows, RLS on 8 tables, and the migration checksums are identical to the source |
| Cleanup | both databases dropped |

The first version of steps 3 and 5 used inline `sh -c` commands with `--%`. They passed this test, but failed in the owner's window when the escapes were lost in copying. Steps 3 and 5 now call scripts instead, and were re-tested (see the end of step 5).

## Procedure (Windows PowerShell, from `web/`)

The connection string never appears on screen, in a file or in your command history. It's read from `.env.hosted-production` into a temporary environment variable for this PowerShell window only, then passed to Docker **by name**.

### 0. Read-only pre-checks (Supabase SQL editor)

```sql
show server_version;
```

The `postgres:17` image's `pg_dump` handles servers up to 17. If the server reports 18 or higher, stop and tell me: the image must match.

```sql
-- Exact row counts; keep this result to compare with the restore test.
select 'User' t, count(*) from "User" union all
select 'CareerProfile', count(*) from "CareerProfile" union all
select 'TechnicalSkill', count(*) from "TechnicalSkill" union all
select 'ProfessionalExperience', count(*) from "ProfessionalExperience" union all
select 'Education', count(*) from "Education" union all
select 'ProjectAccomplishment', count(*) from "ProjectAccomplishment" union all
select 'SavedJob', count(*) from "SavedJob" union all
select '_prisma_migrations', count(*) from "_prisma_migrations";
```

### 1. Make a backup folder outside the repository and outside OneDrive

```powershell
New-Item -ItemType Directory -Force "$HOME\careeros-backups" | Out-Null
```

`$HOME\careeros-backups` isn't under the OneDrive-synced Desktop, so nothing uploads by accident. The dump contains users' personal data.

### 2. Load the connection into this window only (nothing is printed)

```powershell
$env:PGDUMP_URL = node -e "process.stdout.write(require('dotenv').parse(require('fs').readFileSync('.env.hosted-production')).DATABASE_URL)"
if ($env:PGDUMP_URL) { 'loaded' } else { 'NOT loaded' }
```

### 3. Take the dump (read-only for production)

The commands below have **no inner quotes, no escapes and no `--%`**. The dump logic lives in `scripts/backup/*.sh`, which contain no credentials and run inside the container.

**Why:** the first production attempt (Nov 17) used an inline `sh -c "…\"$PGDUMP_URL\"…"` form. When that command was copied, its `\"` escapes were evidently lost. As a result, `pg_dump` received the literal text `$PGDUMP_URL`, and the console printed only `pg_dump`. Nothing was dumped and nothing leaked: the 74-byte log held one error line naming the variable, not its value.

Run from `web/` in the same window as step 2:

```powershell
docker run --rm -e PGDUMP_URL -v "${HOME}\careeros-backups:/backup" -v "${PWD}\scripts\backup:/tools:ro" postgres:17 sh /tools/dump-public.sh
```

The script:
- **Refuses to run** if `PGDUMP_URL` isn't set or isn't a postgres URL, or if a dump or log already exists in the folder (it never overwrites).
- **Prints only these lines:**
  - `pg_dump exit <n>`;
  - the dump size;
  - the number of error lines in the log;
  - whether the log is clean of credentials. If the log ever contains the URL or the password, the script deletes it and says so.

**Behaviour:**
- **Read-only:** `pg_dump` only reads. It takes a consistent snapshot, and its shared locks don't block the app's reads or writes.
- **Lock waits:** `--lock-wait-timeout=30s` makes it give up instead of waiting forever.
- **Required result:** `pg_dump exit 0`, `log error lines: 0`, `log credential check: clean`.

### 4. Clear the connection from this window

```powershell
Remove-Item Env:PGDUMP_URL
if ($env:PGDUMP_URL) { 'STILL SET' } else { 'cleared' }
```

### 5. Verify the backup

1. **Contents and fingerprint.** This reads the dump only:
   ```powershell
   docker run --rm -v "${HOME}\careeros-backups:/backup" -v "${PWD}\scripts\backup:/tools:ro" postgres:17 sh /tools/verify-dump.sh
   ```
   Expected:
   - `TABLE: 8  TABLE DATA: 8  ROW SECURITY: 8  _prisma_migrations data: 1`;
   - `contents: PASS`.

   Write down the `SHA-256` it prints. Cross-check it in Windows (the two values must match, ignoring case):
   ```powershell
   (Get-FileHash -Algorithm SHA256 "$HOME\careeros-backups\careeros-pre-v1-public.dump").Hash.ToLower()
   ```
2. **Restore test into a disposable *local* database, compared with production.** Pass step 0's 8 counts in this order: User, CareerProfile, TechnicalSkill, ProfessionalExperience, Education, ProjectAccomplishment, SavedJob, `_prisma_migrations`. For the Nov 17 baseline:
   ```powershell
   docker run --rm -v "${HOME}\careeros-backups:/backup" -v "${PWD}\scripts\backup:/tools:ro" postgres:17 sh /tools/restore-test.sh 3 3 46 4 1 0 0 10
   ```
   What the script does:
   - restores into `v1_backup_check` on the local test container (`careeros-test-db`, local-only credentials), never production;
   - compares every count;
   - checks RLS on 8 of 8 tables, and that the migration history matches the repository;
   - **always deletes the restored copy**, even on failure, because it holds real user data.

   Expected:
   - `pg_restore exit 0`;
   - every row `ok`;
   - `RLS: 8 of 8 tables`;
   - `migration history matches the repository: yes`;
   - `restore test: PASS`;
   - `restored copy deleted: yes`.

   (`--no-owner --no-privileges` only skip Supabase's roles, which the local container doesn't have; the dump itself keeps them.) If a count is higher in the restore than in step 0, production gained rows in between: re-run step 0's query and use the new counts. A lower count is a failure.

**Tested (Nov 17, locally):** these exact lines were run in Windows PowerShell 5.1, typed in as an interactive session.
- **Target:** a local production-state copy (10 migrations, RLS on 8 of 8). It was owned by a role whose password was ``Tr!ck$y;&*`"pw%|<>(x)``.
- **Results:**
  - `pg_dump exit 0`, log clean;
  - the overwrite guard refused a second run;
  - `contents: PASS`, and the SHA-256 matched `Get-FileHash`;
  - `restore test: PASS`, and the restored copy was deleted;
  - a wrong count gave `restore test: FAIL`.
- **Copy damage:** the same lines with **every double quote removed** gave the same results.

### 6. Optional: a full Supabase project dump as well

This is for disaster recovery beyond V1 (accounts in `auth`, storage metadata). Supabase's CLI excludes its managed internals:

```powershell
npx supabase db dump --db-url "$env:PGDUMP_URL" -f "$HOME\careeros-backups\roles.sql" --role-only
npx supabase db dump --db-url "$env:PGDUMP_URL" -f "$HOME\careeros-backups\schema.sql"
npx supabase db dump --db-url "$env:PGDUMP_URL" -f "$HOME\careeros-backups\data.sql" --use-copy --data-only
```

Run these between steps 2 and 4. The URL goes on the command line, but it's expanded from the variable, so it isn't stored in history. **This optional step wasn't dry-run.** It isn't needed for the V1 migration.

### 7. Store and record

- **One copy off this machine**, encrypted: for example, a 7-Zip AES-256 archive with a passphrase kept in your password manager, on an external drive or private storage. Never commit it, attach it to an issue or PR, or upload it unencrypted.
- **Record for the release** (I'll add these to the checklist):
  - date and time (UTC);
  - file name and size;
  - SHA-256;
  - the step 0 row counts;
  - "restore test passed".
- **Keep the dump** until V1 has run cleanly for at least a week. Then delete the local copies, and the off-machine copy as you prefer.

## Stop conditions (don't migrate; tell me which one)

Stop if any of these happens:
- `pg_dump exit` isn't 0;
- the log shows an error;
- the contents counts differ from 8/8/8/1;
- `pg_restore exit` isn't 0;
- any restored count is lower than production's;
- the server version is above 17.

## After the backup

Production is unchanged by every step above. Migrating (checklist §6, step 3) is a separate step that needs your separate approval.
