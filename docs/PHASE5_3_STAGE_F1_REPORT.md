# Phase 5.3 Stage F1: the recognition-version audit and evidence ids for structured answers

November 14, 2026. **Owner-approved scope:** F1 only (design `docs/PHASE5_3_STAGE_F_DESIGN.md` §7, decision F-8). Constraints, all in force:
- structured answers still count toward nothing: matching reads formVersion 1 only;
- `readStructuredAnswer` is still called nowhere in the app;
- rules-v21 (default), rules-v22 (opt-in), `splits-v1.1`, the approved splits and every feature flag are unchanged;
- no F2 work;
- local databases only (`127.0.0.1:5433` test, `127.0.0.1:54322` local Supabase). Hosted Supabase was not touched;
- no sealed split was opened.

## 1. Inspection: compatible with the approved design

| Area | Finding |
|---|---|
| Masking (`maskRevoked`) | Reads the stored `evidenceId` of answers that are no longer ACTIVE. Stage E rows had none, so a revoked or corrected structured answer could never be masked. F1 fixes this ahead of Stage F |
| Deletion (`scrubAnalyses`) | Already scrubs `experience:<id>` and the answer's words, whatever `evidenceId` holds. Unchanged |
| Citations | Rules and AI both strip answer evidence (`evidenceForRules`/`evidenceForAi`), and `activeAnswers` reads formVersion 1 only. **No finding can cite a structured answer today**, so giving them ids changes no result |
| Events | Stage E's structured events (CONFIRMED/DENIED, CORRECTED, PART_Q_DONE) are the only ones that use recognition data: the approved part wording (E1) and the part questions from `recognizeParts` |
| Analyses | No analysis applies a structured answer before F4, so the correct audit value for every analysis is NULL |

No approved decision needed changing. One refinement is within the design's intent (§3.2): the event version is recorded only where recognition data was actually used.

## 2. Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | `recognitionVersion String? @db.VarChar(20)` on `JobMatchAnalysis` and `ClarificationEvent` |
| `prisma/migrations/20261114010000_structured_matching_audit/migration.sql` | The migration (§3.1) |
| `prisma/rollback/20261114010000_structured_matching_audit.down.sql` | Hand-run rollback (not a Prisma migration) |
| `src/lib/ai/clarification-review.ts` | Structured saves and corrections get `experience:<id>` in the creating write. Structured events record the version where parts or part questions were used |
| `src/lib/ai/rules/structured-form.ts` | `FORM_RECOGNITION_VERSION` (= `RECOGNITION_VERSION`), so the save path needn't import the recognition module (the isolation guard is unchanged) |
| `tests/integration/structured-audit.integration.ts` | 10 new integration tests |
| `tests/structured-audit.test.ts` | 6 new unit guards |
| `tests/integration/structured-form.integration.ts` | One expectation updated: a structured role answer now has `experience:<id>`, not null (the intended F1 change) |

Not changed: `analysis.ts`, `answer-deletion.ts`, the reader, recognition, the engine, the rule table, the consistency module, config and flags, the UI.

## 3. The migration and the audit

### 3.1 Migration details and compatibility

```sql
ALTER TABLE "ClarificationEvent" ADD COLUMN "recognitionVersion" VARCHAR(20);
ALTER TABLE "JobMatchAnalysis"   ADD COLUMN "recognitionVersion" VARCHAR(20);
-- CHECK ("recognitionVersion" IS NULL OR "recognitionVersion" ~ '^splits-v[0-9]+(\.[0-9]+)*$') on both
UPDATE "CandidateClarification" SET "evidenceId" = 'experience:' || "id"
  WHERE "formVersion" = 2 AND "outcome" = 'ROLE_DETAIL_ADDED' AND "evidenceId" IS NULL;
```

This is exactly the approved §7 SQL. It is additive and nullable, and no existing analysis or event is rewritten or recalculated. Old code ignores the columns. RLS is unchanged and there is no new table.

**Validated locally (`f1/migration-check.cjs`, 37 of 37):** the check runs in one transaction on the test database that is rolled back at the end. It creates pre-F1 rows, applies the migration, checks the result, applies the rollback SQL, and checks again.

| Check | Result |
|---|---|
| Existing analysis (findings, counts, `methodVersion`) and events | Byte-identical |
| Existing analyses and events after migrating | `recognitionVersion` NULL |
| Format | `splits-v1.1`, `splits-v2` and NULL accepted; `rules-v21`, `splits-v`, `splits-v1.`, `SPLITS-V1.1`, a trailing space, `splits-v1.1-x`, `v1.1` and more than 20 characters rejected, on both tables |
| Rollback | Columns and constraints gone; every row and finding intact |
| After the final ROLLBACK | Database exactly as before |

The migration was then applied with `prisma migrate deploy` to the local test database and to local Supabase (19 of 19 migrations, schema up to date). Local Supabase holds no answers, so its backfill touched 0 rows.

### 3.2 What the audit values mean

| Row | `recognitionVersion` |
|---|---|
| Every analysis in F1 | NULL: no structured answer is applied. F4 sets it when one is |
| A structured CONFIRMED or CORRECTED **with part ticks** (an approved split) | `splits-v1.1`: the part wording came from that version's approved splits |
| A PART_Q_DONE event | `splits-v1.1`: the question came from that version's part reading |
| A structured answer without parts, a structured "haven't done this", and every free-text, revocation, deletion or follow-up event | NULL: no recognition data was used |

The design named "CONFIRMED / CORRECTED / *_RESULT for structured answers". F1 records the version only where recognition data was actually used, as the approval asked. `*_RESULT` events are never written for structured answers before F4.

## 4. Evidence ids

### 4.1 Format and lifecycle

**Format:** `experience:<the answer's own id>`, the same format as free-text answers and replies. It is set in the same write that creates the row, from an id generated just before, so there's no window without it. A structured "haven't done this" (DENIED) has no id, like a free-text denial: there is nothing to cite.

| Event | Result (tested) |
|---|---|
| Save | The new row has its own id; the old structured row is SUPERSEDED and keeps its own |
| Correction (including "others did it" on a part question) | Same: every version has a distinct id; none is shared or reused |
| Revocation | The row keeps its id. While the answer isn't ACTIVE, the page masks any stored finding citing it: with the review on, with it off, and with no flags |
| Correction makes the old version stale | Same masking |
| Permanent deletion | Every version is removed with its parts. Every stored finding citing any version is scrubbed. The audit keeps only "DELETED". No orphaned ids remain |
| Active answer (control) | A finding citing it is not masked |

Stage F will cite structured answers. The masking tests write such a citation straight into a stored analysis to show it can't go stale.

### 4.2 Backfill

| Row | Backfill result |
|---|---|
| Structured role answers saved before F1 (any status) | Get `experience:<id>`. Revoked and superseded rows included, so masking can find them |
| Rows that already have an id | Never overwritten |
| Free-text rows and structured denials | Untouched |

The backfill is idempotent: a second run updates 0 rows. Stored results are unchanged.

## 5. Isolation and regression

| Gate | Result |
|---|---|
| Verdicts and stored results | Identical (findings, counts, `methodVersion`) before and after saving, correcting and revoking structured answers, with the form flag on, the review only, and no flags. Nothing stored cites a structured answer |
| Engine basis (2,121 rows) and follow-up sets (340 rows) | Engine **byte-identical** to the F0 and Stage E runs; follow-up: **0 of 340** rows differ on any field (only the timing field `latency` differs); all five runs exit 0 |
| Unit | **3,051** pass (6 new) |
| Integration (local test database) | **201** pass (10 new) |
| TypeScript, `prisma validate`, migration status | Clean; 19 of 19 applied locally |
| Lint | 1 existing warning (`tests/eval/run-eval.eval.ts`), unchanged |
| Sealed guard / parts validate | 11 of 11 / pass |
| Recognition parity and isolation | 343 pass (the guard that only the split matcher and the form model use recognition is unchanged and passes) |
| rules-v22 | 67 pass; v21 still the default |
| Browser specs | Not rerun: no UI, page-data or config code changed |

## 6. Remaining risks

- **Production needs two migrations in order:** Stage 1 (`20261110010000_structured_ownership`), then this one. Each needs separate approval. In production there are no formVersion 2 rows, so the backfill is a no-op.
- **The evidence id doesn't make a structured answer citable.** That is F3 (validator, `candidate_choice`) and F4 (wiring). Until then the ids serve masking and deletion only.
- **Flag-off masking of stored structured findings (F-9)** is F4 work: it needs findings that cite structured answers, which can't exist yet. F1's ids are what that masking will key on.
- **The `recognitionVersion` on events depends on the version constant.** A future recognition change must bump `RECOGNITION_VERSION`, or the audit will mislabel which approved splits were used.
- **The rollback leaves the evidence ids.** They are harmless (masking and deletion only) and documented in the down script.

## 7. Ready?

F1 is ready for approval:
- every gate passes;
- matching is unchanged;
- the migration was validated and applied locally only.

F2 hasn't started.
