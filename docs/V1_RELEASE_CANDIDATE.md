# CareerOS V1: local release candidate

November 17, 2026. Built on the local `milestone-3-ai-matching` branch under the owner's approval of D2–D5 and D6 (local preparation only).

**Nothing pushed, merged or deployed.** No hosted Supabase access; no production migration; no production environment change; no paid AI; R4 and the Stage G FAIL untouched; PR #4 open.

## 1. V1 functionality (rules-first, human-reviewed, $0 AI)

| Step | Status |
|---|---|
| 1. Add a job posting | Existing |
| 2. Extract requirements | Existing rules extraction, plus the review page (edit, add, include) |
| 3. Automatic analysis | **New:** saving the reviewed requirements runs the deterministic rules analysis (no AI service; the usual limits and audit) |
| 4. One review page | Every requirement with its rules-based verdict, cited evidence, uncertainty and caveats, labelled "Rules engine (rules-v21a)" and "Self-reported". **New:** a "Your decision" line per requirement, and plain wording that Agree/Disagree never changes a result |
| 5. Confirm, correct, reject, add | Existing review actions (add experience, correct, deny, skip, revoke, delete) and Agree/Disagree. **New:** Disagree on a credited result is recorded as **Not claimed** |
| 6. Recalculate | Answers trigger the free rules recheck; "Run analysis again" re-runs. **New:** unchanged decisions are carried to the recalculated analysis; changed results must be decided again |
| 7. Final approval | **New:** "Approve this assessment", allowed only for the latest, current (requirements, profile, rules) analysis with a decision on every requirement; otherwise blocked, with the reason |
| 8. Saved with an audit trail | **New** `AssessmentApproval`: append-only versions. Each snapshot holds CareerOS's verdicts and bases unchanged, evidence ids, the person's decisions and notes, what is recorded as claimed (never higher than the verdict), and the method, requirements and feedback versions and the profile fingerprint. History is shown read-only |

**Safety, unchanged and tested:**
- user confirmation never produces Supported;
- the ownership, contradiction, injection and evidence safeguards;
- Gate A (structured-matching-v2);
- the save-time validation;
- the rate limits.

**D2:** `v21a` is the default reader, which closes the free-text correction bypass. `v21` stays selectable for comparison: a guarded local switch, refused on Vercel and unless the database is local.

## 2. Commits (local, in order)

| Commit | Change |
|---|---|
| `e1cfa6d` | D5: `next` 16.4.1 → 16.4.5 (GHSA-mfr8-8qww-v76h); only `next` and `@next/*` changed |
| `b478be5` | D6: RLS migration restored to its production-applied bytes; the CI drift check now runs against a freshly migrated database; local-only rehearsal config |
| `c7ae62a` | D2: `v21a` default; `RULES_VERSION` rules-v21a; the switch can select v21; tests |
| `5d4c4b5` | D4: `AssessmentApproval` (one migration), decisions and snapshot, approval service, action and UI |
| `413784b` | Automatic rules analysis after the requirement review |
| `5d59a2a` | V1 end-to-end browser spec |
| `ca75497` | Browser selectors scoped for the new approval note |
| this commit | Production migration checklist and this report |

**Migrations:** one new, `20261117010000_assessment_approval`:
- additive: a new table and a unique index on `JobMatchAnalysis`;
- RLS enabled;
- checks on version, JSON shapes, fingerprint and feedback version;
- composite foreign keys (same user, same job).

The restored `20261028010000` is byte-identical to `main`.

## 3. Test results

| Gate | Result |
|---|---|
| Unit | **4,076 of 4,076**: +8 assessment, +3 switch, plus version updates for D2 |
| Integration (solo) | **231 of 231**: +4 approval (snapshot, refusals, versioning and carried decisions, not claimed, cross-account, database checks, cascade); the review-save test asserts the automatic analysis |
| Engine basis | 2,121 rows identical; only the label changed (`rules-v21` → `rules-v21a`) |
| Follow-up sets (default reader v21a) | **0 of 340 rows differ** |
| TypeScript / lint / prisma / build | Clean / 0 errors (1 existing warning) / valid / compiled (16.4.5; no upgrade nudge) |
| Sealed guard | 12 of 12 |
| Migration rehearsal | `main`'s history, then all 10 migrations: in order, no drift, RLS on all 15 tables. A fresh database takes all 20 |

**Browser specs:**

| Spec | Server | Result |
|---|---|---|
| **V1 end to end** (`v1-assessment`) | review mode | **passed** |
| `job-match` | review mode, then flags off | passed, passed |
| `job-requirements`, `account-isolation` | review mode, then flags off | passed, passed |
| `saved-jobs` | review mode | passed |
| Staleness after a reader change (`job-corrections`: seed v21 → check v21a → rollback v21) | v21 / default / v21 | **3 of 3 passed** |
| `job-review`, `job-clarification`, `job-corrections` (free text and structured), `job-structured-matching` | review / structured modes | **passed** (re-run on Nov 18 after the daily answer limit freed naturally; no bypass or reset). `f26d675` fixed the V1 spec cleanup, whose leftover denials had broken `job-review` |

**Failures during development, all fixed:**
- the local development database lacked the new migration: a server error on the review page, fixed by applying the migration locally;
- three selector defects in the new spec;
- the `job-match` selector, which the new approval note made ambiguous.

## 4. Remaining bugs and limitations

- **Browser re-runs:** none pending. All four answer-based specs passed on Nov 18.
- **Known matching limitations (documented):**
  - a correction in the same sentence as another activity loses that activity;
  - relevance over-credit ("greet patients");
  - heuristic extraction;
  - Stage G FAIL (structured matching isn't part of V1).
- **"Disputed":** Disagreeing with a result that gives no credit is recorded as "Disagreed (the result doesn't change)". It counts as a decision; it's not a correction (the person should add experience instead).
- **Decision persistence:** decisions live on the analysis' feedback and are carried only where the result didn't change.
- **Approvals:** they're kept with the job and deleted with it (cascade).
- **Development tooling:** 7 moderate npm advisories (typescript-eslint → minimatch), not shipped.

## 5. Production migration risks (see `V1_PRODUCTION_MIGRATION_CHECKLIST.md`)

1. **Baseline confirmed by the owner (read-only, Nov 17):** production has 10 migrations, through `20261026010000_job_requirements`. **10 are pending**, starting with `20261028010000_enable_row_level_security`. They were rehearsed locally from that state: no drift, and compatible with the deployed code.
2. The RLS migration enables RLS with no policies on 6 more tables. That's safe only if the app's role owns the tables; `SavedJob` already shows this in production. The owner confirms it read-only first.
3. **Migrate before merging:** Vercel deploys `main` and doesn't run migrations.
4. No point-in-time recovery on the free tier, so take a manual dump first.
5. A Vercel rollback doesn't reverse migrations. They're additive, so the old code tolerates them.

## 6. Actions that need the owner's approval before deployment

1. Wait for the answer limit to free, then let me re-run the pending browser specs.
2. Run the read-only checksum and RLS checks (checklist §1 and §3). Optionally, give me a **schema-only** dump for a rehearsal against the real schema.
3. Take a full production backup (`pg_dump`) and verify it (checklist §5).
4. Run `prisma migrate deploy` against production (`prisma.production.config.ts`; you hold `.env.hosted-production`).
5. Set the Vercel production environment: `CLARIFICATION_REVIEW_ENABLED=true`; AI variables unset; `CAREEROS_TEST_READER` never set.
6. Merge PR #4, which deploys.
7. Run the production smoke test with a disposable account.
