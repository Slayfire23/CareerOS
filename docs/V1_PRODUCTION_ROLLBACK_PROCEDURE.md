# CareerOS V1: full rollback procedure (emergency only; run only by the owner, after explicit approval)

November 17, 2026. **Rehearsed locally with the real pre-V1 backup. It has never been run against production.**

A full rollback returns the database's `public` schema to the verified pre-V1 backup. It's the **last resort**. Use it only if, after the V1 migrations, the database is left in a state that neither the old nor the new code can work with.

## When *not* to use it

| Situation | What to do instead |
|---|---|
| A migration fails during `migrate deploy` | Prisma 7 does **not** roll a failed migration back: its statements before the error stay applied, and later deploys are refused (P3009). Stop and send me the error, then decide between a manual repair (revert the partial changes, `migrate resolve --rolled-back <name>`, deploy again) and this full rollback. This procedure was rehearsed from exactly that state (see below) |
| V1 code misbehaves after the merge | Use Vercel's **instant rollback** to the previous deployment. The migrations are additive, so the pre-V1 code ignores the new tables and columns. Keep the database as it is |
| Anything you're unsure about | Stop and ask. A full rollback discards data |

## What it does

Script: `scripts/backup/rollback-v1.sh`, with `v1-drop.sql` and `rollback-verify.sql`. It runs inside the `postgres:17` container, and **everything happens in one transaction**:

1. **Guards.** Nothing has been touched when any of these stops it:
   - the backup's SHA-256 must equal the one you give it;
   - the migration history must contain the 10 pre-V1 migrations plus only known V1 migrations. An unknown name stops it.
2. **Drop what only V1 created:** 7 tables and 8 enum types, with **no `CASCADE`**. Anything unexpected that depends on them (a view, for example) makes the drop fail, and the whole rollback aborts.
3. **Recreate the 8 original tables from the backup** (`pg_restore --clean --if-exists`, generated inside the container):
   - definitions, data, constraints, indexes, RLS and grants (`anon`, `authenticated`, `service_role`, `postgres`);
   - `_prisma_migrations`, with its 10 pre-V1 rows.

   This also removes V1's changes to existing tables: the two `User` consent columns and their check, and the `SavedJob(id, userId)` index.
4. **Verify before committing:**
   - no V1 tables, types, columns or indexes remain;
   - 8 tables, with RLS on 8 of 8 and none forced;
   - exactly the 10 pre-V1 migrations, all finished;
   - it prints the 8 row counts.

   Any failed check aborts the transaction.
5. **`check` mode ends with `ROLLBACK`**: it does everything, proves it would succeed, and changes nothing. **`apply` mode ends with `COMMIT`.**

**Deliberately not touched** (V1 never changes them, and dropping them could break Supabase):
- the `public` schema itself and its grants;
- the schema's default privileges (`postgres`, `supabase_admin`);
- Supabase's `public.rls_auto_enable()` function.

**Output:** only the guard results, the check lines, the counts and PASS or FAIL. On failure, the first error line is printed with any quoted values masked. The connection string is never printed.

## Local rehearsal (Nov 17, 2026): PASS

**Setup:**
- **Backup:** the real one (35,978 bytes, SHA-256 `299bed70…4d82`), on a disposable database in the local test container.
- **Roles:** set up like Supabase's. A **non-superuser** `postgres` owned everything, and it ran both the migrations and the rollback. The grant roles `anon`, `authenticated` and `service_role` existed, and `supabase_admin` held default privileges.

| Step | Result |
|---|---|
| Restore the backup (owners, grants, RLS, default privileges, function) | `pg_restore exit 0`; counts 3/3/46/4/1/0/0/10; RLS 8 of 8; owner `postgres` |
| Apply the 10 V1 migrations as `postgres` | 10 applied; 20 history rows; 15 tables |
| Activity after the backup | +1 user, +1 saved job, +1 analysis run (a V1 table), 1 existing profile edited |
| `check` mode | PASS; afterwards still 20 history rows, 4 users, V1 tables present (**nothing changed**) |
| Guard: wrong fingerprint | STOP, before touching anything |
| Guard: a view depending on a V1 table | apply FAILED, **nothing committed**: still 20 rows and 4 users (atomic) |
| Guard: unknown migration in the history | STOP |
| `apply` mode | PASS (committed); counts 3/3/46/4/1/0/0/10 |
| **Data**, row-level md5 of all 8 tables against the pre-V1 restore | **Identical**. The post-backup user, job and run are gone, and the edited profile is reverted |
| **Schema**: tables, types, constraints, indexes, RLS, owners, grants, function, default privileges (schema-only dump diff) | **Identical** |
| V1 tables / V1 types / V1 history rows | 0 / 0 / 0 |
| Re-apply the 10 V1 migrations after the rollback | 10 applied; **no drift** against `schema.prisma` (the database can be migrated again) |
| **Second rehearsal: a half-applied V1 deploy** (an injected failure in migration 6; migrations 1–5 applied, migration 6 failed after creating `ClarificationEvent`; 15 finished rows + 1 failed) | The guard accepted the state (6 of 10 V1 rows); check PASS; apply PASS; data and schema **identical** to pre-V1; failed row gone; the real migrations then applied cleanly with no drift |
| Cleanup | disposable database dropped; temporary roles `postgres` and `supabase_admin` dropped (`anon`, `authenticated`, `service_role` already existed and were kept); `CHECKPOINT`; scratch removed. The restore SQL only ever existed inside the throwaway container |

## Limitations (not covered by the rehearsal)

1. **Supabase's event trigger.** `rls_auto_enable()` is probably called by a database-level event trigger that isn't in the backup. It would fire when the rollback recreates the tables. It only enables RLS, which the restore does anyway, so it's expected to be harmless. It's not reproducible locally.
2. **Supabase's `postgres` role** has a few platform privileges that a plain local non-superuser lacks. The rehearsal proves ownership is sufficient. It doesn't test Supabase-specific privilege differences.
3. **Only the `public` schema.** `auth` (sign-ins), `storage` and other Supabase schemas aren't in the backup and aren't touched.
4. **Locks.** For the duration of the transaction (seconds, at today's size), it holds exclusive locks on every CareerOS table. The site's database requests wait or fail during that time.

## Data loss (read before approving an apply)

Everything written to the 8 original tables **after the backup** (Nov 17, 2026) is discarded, and every V1 table is dropped with its data:
- **New sign-ups after the backup** keep their Supabase login (`auth` isn't touched). Their CareerOS `User` row and profile are gone, and the app creates an empty one at their next sign-in.
- **Edits after the backup** to profiles, skills, experience, education, projects and saved jobs revert to the backup's version.
- **All V1 data is lost:** analyses, answers, clarifications, follow-ups and approvals.
- The backup's counts are User 3, CareerProfile 3, TechnicalSkill 46, ProfessionalExperience 4, Education 1, ProjectAccomplishment 0, SavedJob 0.

**To limit the loss:** take a fresh **post-V1 dump** (`dump-public.sh` into a *different* folder) before applying. Then nothing written after the backup is lost forever, though recovering it would be manual.

**The backup exists only on the owner's PC** (the off-machine copy was skipped). If that file is lost, there is no full rollback.

## Production steps (owner; only after explicit approval of a rollback)

Run in Windows PowerShell 5.1, from the repository's `web` folder, one command per paste.

1. **Stop V1 traffic first:** use Vercel instant rollback to the last pre-V1 deployment. The old code doesn't need the V1 tables.
2. **Optional but recommended: a forensic post-V1 dump.** Make a new folder, `$HOME\careeros-backups\post-v1`, and run `dump-public.sh` into it, as in the backup procedure's step 3, with that folder mounted as `/backup`.
3. **Load the connection** (nothing is printed):
   ```powershell
   $env:ROLLBACK_URL = node -e "process.stdout.write(require('dotenv').parse(require('fs').readFileSync('.env.hosted-production')).DATABASE_URL)"
   ```
   ```powershell
   if ($env:ROLLBACK_URL) { 'loaded' } else { 'NOT loaded' }
   ```
4. **Check mode** (changes nothing). It must end with `rollback check: PASS`:
   ```powershell
   docker run --rm -e ROLLBACK_URL -v "${HOME}\careeros-backups:/backup:ro" -v "${PWD}\scripts\backup:/tools:ro" postgres:17 sh /tools/rollback-v1.sh check 299bed70540ec99615399d18a23d0917bf71b8aed369c0ef50006f98b55d4d82
   ```
5. **Apply.** Only if check passed and you have approved the data loss. It must end with `rollback apply: PASS (committed)` and counts that match the backup:
   ```powershell
   docker run --rm -e ROLLBACK_URL -v "${HOME}\careeros-backups:/backup:ro" -v "${PWD}\scripts\backup:/tools:ro" postgres:17 sh /tools/rollback-v1.sh apply 299bed70540ec99615399d18a23d0917bf71b8aed369c0ef50006f98b55d4d82
   ```
6. **Clear the connection:**
   ```powershell
   Remove-Item Env:PGDUMP_URL -ErrorAction SilentlyContinue; Remove-Item Env:ROLLBACK_URL
   ```
7. **Verify:**
   - in the Supabase SQL editor (read-only): `_prisma_migrations` has 10 rows, the 8 tables have RLS on, and there are no V1 tables;
   - the pre-V1 site works: sign in, open the profile and saved jobs.

**Stop conditions:**
- any `STOP:` line;
- `rollback check: FAILED`;
- counts that differ from the backup's.

Then don't apply. Send me the output; it contains no credentials or data.
