# CareerOS V1: production migration checklist (prepared locally; run only by the owner)

November 17, 2026. **Nothing in this document has been run against production.** I have no access to hosted Supabase by design. Every step marked **(owner)** is yours. A Vercel rollback does **not** reverse database migrations.

## 1. What production should have today, and what V1 adds

Production runs `main`. Its newest migration is `20261028010000_enable_row_level_security`.

V1 adds **10 migrations**, all additive (new tables, columns, indexes and constraints; nothing dropped or renamed), applied in this order:

| # | Migration | Adds |
|---|---|---|
| 1 | `20261030010000_ai_analysis` | `AiAnalysisRun`, `JobMatchAnalysis`, `User.aiCloudConsentAt` |
| 2 | `20261031010000_ai_cost_ledger` | Billing columns on runs |
| 3 | `20261102010000_ai_suggestions` | `aiSuggestions` and `aiAssist` on analyses |
| 4 | `20261103010000_candidate_clarifications` | `CandidateClarification` |
| 5 | `20261104010000_clarification_review` | `ClarificationEvent`, the review fields |
| 6 | `20261105010000_clarification_follow_up` | `ClarificationFollowUp` |
| 7 | `20261110010000_structured_ownership` | Structured answer columns, `ClarificationPart` |
| 8 | `20261114010000_structured_matching_audit` | `recognitionVersion`, structured evidence ids |
| 9 | `20261117010000_assessment_approval` | **`AssessmentApproval`** (V1, D4), and a unique index on `JobMatchAnalysis(id, savedJobId, userId)` |

That's 9 rows. Together with any of `main`'s that production is missing (step 2 below), expect **10 or fewer**. The exact list comes from step 2.

**The RLS migration's bytes are restored** to exactly what's on `main` (blob `b42f1da`; Prisma checksum `4b45d5c9bc41f96e42d31839d6c9c5f3eafd54836a6012937d7984cc44cf45db`). No migration that production may have applied has been edited.

## 2. Before anything (owner, read-only)

1. In the Supabase SQL editor (production), read the migration history:
   ```sql
   select migration_name, checksum, finished_at, rolled_back_at from "_prisma_migrations" order by started_at;
   ```
2. Confirm:
   - the last row is `20261028010000_enable_row_level_security`;
   - every row has `finished_at` set and `rolled_back_at` null;
   - the RLS row's checksum is `4b45d5c9…45db`. If it differs (for example, if production was marked applied by hand), stop and tell me the value.
3. Note whether `_prisma_migrations` itself has RLS enabled:
   ```sql
   select relrowsecurity from pg_class where relname = '_prisma_migrations';
   ```

## 3. Rehearsal: done locally, again before release

**Done locally** (disposable databases on the local test container, dropped afterwards):
- `main`'s history applied, then all of this branch's migrations: in order, no errors.
- No drift against `schema.prisma` (`prisma migrate diff --from-config-datasource`).
- RLS on every table (15), 0 policies by design.
- A fresh database takes all 20.
- With Prisma 7, neither `migrate deploy` nor `migrate status` flags an edited migration. The original is restored anyway.
- Tool: `prisma.rehearsal.config.ts`, which only accepts local URLs.

**Before release (owner, $0):**
1. Take a **schema-only** dump of production:
   ```bash
   pg_dump --schema-only --no-owner "$PRODUCTION_DIRECT_URL" > prod-schema.sql
   ```
   Also dump `_prisma_migrations` with its data.
2. Restore both into a disposable local database, then run:
   ```bash
   REHEARSAL_DATABASE_URL=postgresql://careeros_test:local_test_only@127.0.0.1:5433/<db> npx prisma migrate deploy --config prisma.rehearsal.config.ts
   ```
   Then run the drift check. I can run this part locally once you hand me the dump file. The dump contains schema only, no user data.

## 4. Backup and recovery (owner)

- **Back up immediately before migrating.** The free tier has no point-in-time recovery, so take a full dump:
  ```bash
  pg_dump --format=custom --no-owner "$PRODUCTION_DIRECT_URL" > careeros-pre-v1.dump
  ```
  Store it off-machine, and verify it lists objects with `pg_restore --list careeros-pre-v1.dump | head`.
- **Code rollback:** Vercel's instant rollback to the previous deployment restores the old code only.
- **Database after a code rollback:**
  - the migrations are additive, so the old `main` code ignores the new tables and columns and keeps working;
  - do **not** drop anything in a hurry;
  - data written by V1 (analyses, answers, approvals) stays in place and is invisible to the old code.
- **Full database restore** (only if a migration fails partway and leaves an inconsistent state): restore `careeros-pre-v1.dump` into the production database during a maintenance window (`pg_restore --clean --if-exists`). This discards everything written since the dump. Prisma runs each migration in its own transaction, so a single failed migration rolls back cleanly. Fix the cause and re-run `migrate deploy`; there's no need to restore.
- **If `migrate deploy` stops:** check `_prisma_migrations` for a row with `finished_at` null. After fixing the cause, mark it `prisma migrate resolve --rolled-back <name>` and re-run. Never edit an applied migration file.

## 5. Production order (owner, after approval)

1. **Maintenance note (optional):** V1 changes no existing data, so no downtime is expected.
2. **Back up** (§4).
3. **Apply migrations** from your machine, with the production *direct* (non-pooled) connection string, using the repository's production config:
   ```bash
   npx prisma migrate deploy --config prisma.production.config.ts
   ```
   That config reads `DATABASE_URL` from the ignored `.env.hosted-production` file, which only you hold and which is never committed. Use the direct (non-pooled) connection string there. I never load that file.
4. **Verify:**
   - `_prisma_migrations` shows the new rows finished;
   - RLS is on for every table: `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and not relrowsecurity;` returns no rows;
   - the drift check passes against production.
5. **Set the Vercel production environment variables** (§6).
6. **Merge PR #4.** Vercel deploys `main`. The code expects the migrations already applied.
7. **Smoke test** with a disposable account: add a posting → review requirements (the analysis runs) → review page → answer, deny, skip, Agree, Disagree → approve → reload. Then confirm another account sees nothing.
8. **Watch** Vercel function errors for an hour.

## 6. Production environment for V1 (owner)

| Variable | V1 value | Note |
|---|---|---|
| `CLARIFICATION_REVIEW_ENABLED` | `true` | D3: the V1 review workflow |
| `AI_CLOUD_ENABLED` | unset | D1: no paid AI. Cloud stays off |
| `AI_LOCAL_LLM_ENABLED`, `FOLLOW_UP_WORKFLOW_ENABLED`, `INTERPRETATION_SHADOW_ENABLED` | unset | Local-only features (refused on Vercel anyway) |
| `STRUCTURED_OWNERSHIP_FORM_ENABLED`, `STRUCTURED_MATCHING_ENABLED` | unset | Not part of V1 (refused on Vercel anyway) |
| `AI_SERVICE_URL`, `AI_SERVICE_SECRET` | unset | Rules analysis runs in-process without them |
| `AI_ANALYSIS_DAILY_LIMIT` | `20` (default) or your choice | Per user per day |
| `CAREEROS_TEST_READER` | **never set** | Local test switch; refused on Vercel |

## 7. Risks

1. **Unknown production state.** Steps 2 and 3 resolve it before anything is applied.
2. **The RLS migration's checksum.** Restored to `main`'s bytes. If production recorded something else, stop at step 2.
3. **Order:** migrate first, then merge. Merging first would deploy code that queries tables that don't exist yet. Vercel builds don't run migrations.
4. **Free-tier constraints.** No point-in-time recovery, so manual dumps; paused projects; size limits.
5. **One-way data:** after users create V1 data, a full restore to the pre-V1 dump loses it. Prefer a code rollback, since the migrations are additive.
