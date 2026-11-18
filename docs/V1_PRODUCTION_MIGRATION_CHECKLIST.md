# CareerOS V1: production migration checklist (prepared locally; run only by the owner)

November 17, 2026. **Nothing in this document has been run against production.** I have no access to hosted Supabase by design. Every step marked **(owner)** is yours. A Vercel rollback does **not** reverse database migrations.

## 1. Confirmed production baseline

The owner read production's `_prisma_migrations` (read-only) on November 17, 2026:
- **10 migrations applied**; the latest is `20261026010000_job_requirements`;
- 0 unfinished, 0 rolled back;
- **`20261028010000_enable_row_level_security` is not applied.**

Those 10 names match this repository's first 10 migrations, in the same order. None of the 10 has been edited since it was created: each file has exactly one commit, and none differs from `main`. Expected checksums (the Prisma checksum of each file as it is in the repository), for the owner to compare with production's `checksum` column:

| # | Migration | Expected checksum |
|---|---|---|
| 1 | `20261015041846_init_users_profiles` | `aa9d1e82e23ef4d4d563bb630700e678d4e4328019e6bb06c8cd79cc419289f2` |
| 2 | `20261017010000_career_preferences` | `f64290c5997404e44c500f4a244a940788674a94135d28964c131df8bf7ed618` |
| 3 | `20261017020000_technical_skills` | `7c347814a45f689f5f9de48f6ad986ac8002173e6592ad2d2d6315934ba54201` |
| 4 | `20261017030000_professional_experience` | `6916427df84b22cc00fc191bc740639cac0304cd0b1ec6fa67dc80fa663528b0` |
| 5 | `20261017040000_location_preferences` | `a41eecb598fddc0efcc9c68540d662cc7f84ddb5dc8fc7b13cd1107ce60594e5` |
| 6 | `20261017050000_salary_expectations` | `c4880ef806c3e353ae8380545e10874bbf964a2dbdb3a2774268187de58d6da4` |
| 7 | `20261017060000_education` | `25b588f876ba38d8dd76ecc7f3110a3c9ce99a2233ef846f7c5fbcc90fd706bd` |
| 8 | `20261017070000_projects_accomplishments` | `88ec9ee99ed92ecd97a6892aeece1a21e96aaf9783174795f62d4784ead63c09` |
| 9 | `20261021010000_saved_jobs` | `a833c7940f6e1986f0ff563c18b301832a9cabbf3969ebd98fe585b5d976829b` |
| 10 | `20261026010000_job_requirements` | `1eb5c9a2d6791dac092d4c40b828cb53db27622b472266e884e2fa0c5cb920d4` |

Prisma 7's `migrate deploy` doesn't refuse to run when a recorded checksum differs. A mismatch therefore wouldn't block the deploy, but it would mean production was built from different SQL than the repository holds. If any checksum differs, stop and tell me which one.

## 2. Pending migrations: 10, applied in this order

| # | Migration | What it does to the database |
|---|---|---|
| 1 | `20261028010000_enable_row_level_security` | Enables RLS on `User`, `CareerProfile`, `TechnicalSkill`, `ProfessionalExperience`, `Education`, `ProjectAccomplishment`, `SavedJob` and `_prisma_migrations`. No policies. Bytes identical to `main` (checksum `4b45d5c9bc41f96e42d31839d6c9c5f3eafd54836a6012937d7984cc44cf45db`) |
| 2 | `20261030010000_ai_analysis` | New `AiAnalysisRun` and `JobMatchAnalysis`. Adds two **nullable** columns to `User` (`aiCloudConsentAt`, `aiCloudConsentVersion`) with a check that allows null. Adds a unique index `SavedJob(id, userId)` |
| 3 | `20261031010000_ai_cost_ledger` | Billing columns on runs |
| 4 | `20261102010000_ai_suggestions` | `aiSuggestions` and `aiAssist` on analyses |
| 5 | `20261103010000_candidate_clarifications` | `CandidateClarification` |
| 6 | `20261104010000_clarification_review` | `ClarificationEvent`, the review fields |
| 7 | `20261105010000_clarification_follow_up` | `ClarificationFollowUp` |
| 8 | `20261110010000_structured_ownership` | Structured answer columns, `ClarificationPart` |
| 9 | `20261114010000_structured_matching_audit` | `recognitionVersion`, structured evidence ids |
| 10 | `20261117010000_assessment_approval` | **`AssessmentApproval`** (V1, D4), and a unique index on `JobMatchAnalysis(id, savedJobId, userId)` |

After them, production will hold all 20 of the repository's migrations.

**Changes to tables the live app already uses:**
- `User`: two nullable columns plus a check that allows null. Existing rows get null and pass the check.
- `SavedJob`: a unique index on `(id, userId)`. It can't fail, because `id` is already the primary key.
- RLS enabled on 6 tables (`SavedJob` and `_prisma_migrations` aside); see §3.
- There's no `NOT NULL` without a default, no drop, no rename, and no type change on any existing column.

## 3. Row-level security: why the RLS migration is safe, and what to confirm

The RLS migration enables RLS without adding policies. With no policy, PostgreSQL denies every row to roles that are subject to RLS. The table owner isn't subject to it (the migration doesn't use `FORCE ROW LEVEL SECURITY`), and neither is a role with `BYPASSRLS`. CareerOS reaches the database only through Prisma, which connects as the role that ran the migrations, which owns the tables. The Supabase Data API (`anon`, `authenticated`) is not used by CareerOS and is exactly what RLS shuts out.

**Production already shows this works:** migration 9 (`saved_jobs`) enabled RLS with no policies on `SavedJob`. The live app reads and writes saved jobs, so its database role isn't blocked by RLS.

**Owner, read-only, before migrating** (Supabase SQL editor):
```sql
-- 1. Which tables already have RLS (the RLS migration's comment says every app table was enabled outside migrations).
select relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) as owner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where nspname = 'public' and relkind = 'r' order by relname;

-- 2. Any existing policies (expected: none).
select tablename, policyname from pg_policies where schemaname = 'public';
```
Confirm that:
- `relforcerowsecurity` is false everywhere;
- each table's `owner` is the role in the app's `DATABASE_URL` on Vercel (normally `postgres`; the pooled string shows it as `postgres.<project-ref>`).

If either isn't true, stop and tell me.

Both possible starting states were rehearsed (§4): RLS off on the 6 tables, and RLS already on everywhere except `_prisma_migrations`. Enabling RLS on a table that already has it is a no-op.

**Owner's result (Nov 17, read-only):**
- all 8 existing public tables have RLS on;
- all 8 are owned by `postgres`;
- no policies exist.

So the RLS migration changes nothing in production. It only records itself in `_prisma_migrations`.

**Role check, rehearsed locally:**
1. A plain owner role (no superuser, no `BYPASSRLS`) applied the production history, enabled RLS on all 8 tables, then applied the 10 pending migrations.
2. Afterwards it owned all 15 tables (none with forced RLS), and could read and update `User` and read the new tables.
3. A non-owner role with `SELECT` granted saw 0 rows, which is what RLS is meant to do.

**Rule:** new tables belong to the role that runs `migrate deploy`. That role must be the same role the app connects as (`postgres`).

## 4. Rehearsal from the confirmed production state (done locally)

Tool: `scripts/rehearse-production-migrations.sh`. It uses disposable databases on the local test container, drops them afterwards, and reaches them through `prisma.rehearsal.config.ts`, which only accepts local URLs. It does the following:
1. applies the 10 migrations production has;
2. seeds an existing user, profile and reviewed job, as the live app writes them;
3. in variant b only, enables RLS on every app table first;
4. applies the pending migrations with `prisma migrate deploy`;
5. checks the result.

Results, identical for both variants:

| Check | Result |
|---|---|
| Starting state | 10 rows, last `20261026010000_job_requirements`; checksums as in §1 |
| Before, tables without RLS | a: `CareerProfile`, `Education`, `ProfessionalExperience`, `ProjectAccomplishment`, `TechnicalSkill`, `User`, `_prisma_migrations`. b: `_prisma_migrations` only |
| Pending migrations | 10 applied, in the order of §2, no errors |
| `_prisma_migrations` | 20 rows, 0 unfinished, 0 rolled back |
| Drift against `schema.prisma` | **No difference detected** |
| RLS | 15 of 15 tables; 0 policies (by design) |
| Constraints | 0 not validated |
| Existing data | user, profile and reviewed job intact; the new consent columns are null |
| Compatibility with `main` (the deployed code) | Turning the migrated database back into `main`'s schema takes only drops of the new objects (8 tables, 8 enum types, their foreign keys, 2 columns, 1 index), and **no statement changes a column that `main` uses**. The deployed code keeps working against the migrated database |
| Cleanup | 0 disposable databases left |

A fresh database also takes all 20 (CI does this on every push).

**What the rehearsal can't prove:** it rebuilt production from the migration files, not from production's real schema. If production was changed outside migrations (the RLS comment suggests that RLS was), only a schema-only dump would show it. §3's read-only queries cover the one known case. An optional stronger check before release:
1. **(owner)** `pg_dump --schema-only --no-owner "$PRODUCTION_DIRECT_URL" > prod-schema.sql`, plus the `_prisma_migrations` rows;
2. I restore both into a disposable local database and run the same checks.

The dump holds schema only, no user data.

## 5. Backup requirements (owner, before migrating)

The free tier has no point-in-time recovery, and a Vercel rollback restores code only. A manual backup is therefore **required**.

1. **Right before migrating**, take a full dump using the *direct* (non-pooled) connection string:
   ```bash
   pg_dump --format=custom --no-owner "$PRODUCTION_DIRECT_URL" > careeros-pre-v1.dump
   ```
2. **Verify it:**
   - `pg_restore --list careeros-pre-v1.dump` lists the 10 tables, including `_prisma_migrations`;
   - the file isn't empty.
3. **Store it off-machine** (it holds user data: keep it private, and never commit it).
4. **Optional restore test:** restore it into a disposable *local* database and count rows. This proves the backup works before you depend on it.
5. **Keep it** until V1 has run cleanly for at least a week.

**Recovery:**
- **A single migration fails.** Prisma runs each migration in its own transaction, so the failed one rolls back cleanly and the ones before it stay applied.
  1. Look in `_prisma_migrations` for the row with `finished_at` null.
  2. Fix the cause.
  3. Run `prisma migrate resolve --rolled-back <name>`.
  4. Re-run `migrate deploy`.

  No restore is needed. Never edit an applied migration file.
- **Code problem after the merge.** Use Vercel's instant rollback to the previous deployment. The migrations are additive, so the old code ignores the new tables and columns. Don't drop anything in a hurry. Data written by V1 stays in place, invisible to the old code.
- **Full restore** (only if the database is left inconsistent): during a maintenance window, `pg_restore --clean --if-exists` from `careeros-pre-v1.dump`. This discards everything written since the dump.

## 6. Production order (owner, after approval)

1. **Read-only checks:** the §1 checksums and the §3 RLS queries. Stop on any surprise.
2. **Back up** (§5), and verify the dump.
3. **Apply migrations** from your machine, with the production *direct* (non-pooled) connection string, using the repository's production config:
   ```bash
   npx prisma migrate deploy --config prisma.production.config.ts
   ```
   That config reads `DATABASE_URL` from the ignored `.env.hosted-production` file, which only you hold and which is never committed. I never load that file. Expect "10 migrations" to be applied, starting with `20261028010000_enable_row_level_security`.
4. **Verify:**
   - `_prisma_migrations` has 20 rows, all finished, none rolled back;
   - no table lacks RLS: `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and not relrowsecurity;` returns no rows;
   - the live (still `main`) site works: sign in, open the profile and saved jobs.
5. **Set the Vercel production environment variables** (§7).
6. **Merge PR #4.** Vercel deploys `main`. The code expects the migrations to be applied already.
7. **Smoke test** with a disposable account: add a posting → review requirements (the analysis runs) → review page → answer, deny, skip, Agree, Disagree → approve → reload. Then confirm another account sees nothing.
8. **Watch** Vercel function errors for an hour.

**Order matters: migrate first, then merge.** Vercel builds don't run migrations. Merging first would deploy code that queries tables that don't exist yet.

## 7. Production environment for V1 (owner)

| Variable | V1 value | Note |
|---|---|---|
| `CLARIFICATION_REVIEW_ENABLED` | `true` | D3: the V1 review workflow |
| `AI_CLOUD_ENABLED` | unset | D1: no paid AI. Cloud stays off |
| `AI_LOCAL_LLM_ENABLED`, `FOLLOW_UP_WORKFLOW_ENABLED`, `INTERPRETATION_SHADOW_ENABLED` | unset | Local-only features (refused on Vercel anyway) |
| `STRUCTURED_OWNERSHIP_FORM_ENABLED`, `STRUCTURED_MATCHING_ENABLED` | unset | Not part of V1 (refused on Vercel anyway) |
| `AI_SERVICE_URL`, `AI_SERVICE_SECRET` | unset | The rules analysis runs in-process without them |
| `AI_ANALYSIS_DAILY_LIMIT` | `20` (default) or your choice | Per user per day |
| `CAREEROS_TEST_READER` | **never set** | Local test switch; refused on Vercel |

## 8. Risks

1. **The RLS migration is the first one applied.** It's safe when the app's role owns the tables (as `SavedJob` already shows). §3 confirms this read-only.
2. **Production built outside migrations.** The rehearsal reproduces the migration history, not production's actual schema. The §3 queries and the optional schema-only dump close this gap.
3. **Order:** migrate first, then merge.
4. **Free tier:** no point-in-time recovery, so the manual dump in §5 is required. Paused projects and size limits also apply.
5. **One-way data:** once users create V1 data, a full restore to the pre-V1 dump loses it. Prefer a code rollback, since the migrations are additive.
