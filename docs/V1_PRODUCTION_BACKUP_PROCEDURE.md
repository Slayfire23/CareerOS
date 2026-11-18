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

The PowerShell lines below were also run **verbatim** in Windows PowerShell 5.1 against a local disposable "production" (only the env file differed):
- load: `loaded`;
- `pg_dump exit 0`;
- log: 0 errors, 0 secrets;
- SHA-256 computed;
- contents listed;
- `pg_restore exit 0`;
- restored counts matched.

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

```powershell
docker run --rm -e PGDUMP_URL -v "${HOME}\careeros-backups:/backup" postgres:17 --% sh -c "pg_dump --dbname=\"$PGDUMP_URL\" --format=custom --schema=public --lock-wait-timeout=30s --verbose --file=/backup/careeros-pre-v1-public.dump 2> /backup/careeros-pre-v1-public.log; echo \"pg_dump exit $?\""
```

**Paste this as its own command.** `--%` (PowerShell's stop-parsing token) hands the rest of the line to Docker unchanged. That is what makes Windows PowerShell 5.1 pass the inner quotes correctly, but it also swallows anything after it on the same line. `$PGDUMP_URL` is expanded inside the container, never by PowerShell.

- **Read-only:** `pg_dump` only reads. It takes a consistent snapshot, and its shared locks don't block the app's reads or writes.
- **If it waits on a lock:** `--lock-wait-timeout` makes it give up after 30 s instead of waiting. Simply re-run it.
- **Required result:** `pg_dump exit 0`.

### 4. Clear the connection from this window

```powershell
Remove-Item Env:PGDUMP_URL
```

### 5. Verify the backup

1. **Errors and secrets in the log.** Both counts must be 0:
   ```powershell
   (Select-String -Path "$HOME\careeros-backups\careeros-pre-v1-public.log" -Pattern 'error' -SimpleMatch).Count
   (Select-String -Path "$HOME\careeros-backups\careeros-pre-v1-public.log" -Pattern 'postgresql://','password=' -SimpleMatch).Count
   ```
2. **Size and fingerprint.** Write both down:
   ```powershell
   Get-Item "$HOME\careeros-backups\careeros-pre-v1-public.dump" | Select-Object Name, Length, LastWriteTime
   Get-FileHash -Algorithm SHA256 "$HOME\careeros-backups\careeros-pre-v1-public.dump"
   ```
3. **Contents.** Expected: `TABLE: 8`, `TABLE DATA: 8`, `ROW SECURITY: 8`, `_prisma_migrations data: 1`.
   ```powershell
   docker run --rm -v "${HOME}\careeros-backups:/backup" postgres:17 --% sh -c "pg_restore --list /backup/careeros-pre-v1-public.dump > /tmp/toc; echo TABLE: $(grep -c ' TABLE public ' /tmp/toc) TABLE DATA: $(grep -c ' TABLE DATA public ' /tmp/toc) ROW SECURITY: $(grep -c ' ROW SECURITY public ' /tmp/toc) _prisma_migrations data: $(grep -c 'TABLE DATA public _prisma_migrations' /tmp/toc)"
   ```
4. **Restore test into a disposable *local* database.** This proves the file restores, before you depend on it. It uses the local test container `careeros-test-db` and its local-only credentials, and never touches production.
   ```powershell
   docker exec careeros-test-db psql -U careeros_test -d careeros_test -c "DROP DATABASE IF EXISTS v1_backup_check WITH (FORCE)" -c "CREATE DATABASE v1_backup_check"
   docker exec careeros-test-db psql -U careeros_test -d v1_backup_check -c "DROP SCHEMA public CASCADE"
   docker run --rm -v "${HOME}\careeros-backups:/backup" postgres:17 --% sh -c "pg_restore --no-owner --no-privileges --exit-on-error --dbname=postgresql://careeros_test:local_test_only@host.docker.internal:5433/v1_backup_check /backup/careeros-pre-v1-public.dump; echo pg_restore exit $?"
   ```
   Expected: `pg_restore exit 0`. (`--no-owner --no-privileges` only skip Supabase's roles, which the local container doesn't have. The dump itself keeps them.)
5. **Compare the restore with production.** Run the same counts, plus the checksum check, against the restored copy:
   ```powershell
   docker exec careeros-test-db psql -U careeros_test -d v1_backup_check -c "select 'User' t, count(*) from \""User\"" union all select 'CareerProfile', count(*) from \""CareerProfile\"" union all select 'TechnicalSkill', count(*) from \""TechnicalSkill\"" union all select 'ProfessionalExperience', count(*) from \""ProfessionalExperience\"" union all select 'Education', count(*) from \""Education\"" union all select 'ProjectAccomplishment', count(*) from \""ProjectAccomplishment\"" union all select 'SavedJob', count(*) from \""SavedJob\"" union all select '_prisma_migrations', count(*) from \""_prisma_migrations\"""
   ```
   Every count must equal step 0's production result. (Rows written to production between steps 0 and 3 can make the live counts slightly higher. Re-run step 0's query if a count differs, and check it isn't lower.)
6. **Delete the local restore.** It holds real user data:
   ```powershell
   docker exec careeros-test-db psql -U careeros_test -d careeros_test -c "DROP DATABASE IF EXISTS v1_backup_check WITH (FORCE)"
   ```

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
