# Phase 5.3 Stage G: readiness report

November 16, 2026. **Stage G is NOT authorized and NOT ready.** Nothing sealed was opened, inspected, scored, relabeled or modified. This report lists what stands between now and an approved, frozen, one-pass Stage G.

## 1. Summary

| Area | Status |
|---|---|
| Stage F verification | **BLOCKED (waiting):** two browser specs wait on the test account's rolling answer limit (§2) |
| Stage F regression gates | PASS: latest run at `d2fff8c` (§3) |
| Evaluation-quality policy | v3 approved in principle (G4 = 90%, G6 = 0 unjustified). **G2's exact predicates and G8–G11 need your confirmation** (§4) |
| Evaluation harness | **NOT READY:** it can't yet compare baseline and candidate; scoring isn't implemented (§5) |
| Freeze record | Not started; done at the freeze commit (§6) |
| Production | Blocked, unchanged (§7) |

## 2. Stage F verification

| Spec | Executed | Passed | Failed | Skipped | Status |
|---|---|---|---|---|---|
| `job-match-assisted` | 1 | 1 | 0 | 0 | **PASS** (2026-11-15; local entry `careeros-assisted-3100`, allowlist = the local E2E account only, not committed) |
| `job-clarification` | — | — | — | — | **BLOCKED (waiting)** |
| `job-structured-matching` | — | — | — | — | **BLOCKED (waiting)** |

**The dependency.** The shared local E2E account is at **28 of 30** answers in the rolling 24 hours (checked 2026-11-16 03:43 UTC). The next batch of earlier answers leaves the window around **04:21–04:46 UTC**. The limit isn't bypassed, reset or weakened, and the check isn't being repeated.

**To finish once it clears:**
1. Run `job-clarification` against `careeros-prod-3100`.
2. Run `job-structured-matching` against `careeros-matching-3100` with `E2E_STRUCTURED_FORM=true E2E_STRUCTURED_MATCHING=true`.
3. Report the executed, passed, failed and skipped counts.

Both specs check their declared mode against the server before answering.

## 3. Stage F regression gates (latest run, `d2fff8c`)

| Gate | Result |
|---|---|
| Unit / integration (solo) | 3,897 of 3,897 / 226 of 226 |
| D1 regression test | 3 of 3 |
| TypeScript, `prisma validate`, production build, lint | Clean (1 existing lint warning) |
| Parity / sealed guard / parts validate | 343 of 343 / 11 of 11 / pass |
| Engine basis | Byte-identical to the pre-Stage F baseline `c4ebce9` |
| Follow-up sets | 0 of 340 rows differ on any field vs `c4ebce9`. No verdict changes, so no new false Supported and no qualification losses |

## 4. Policy (`docs/PHASE5_3_STAGE_G_EVAL_QUALITY_POLICY.md`, v3)

**Approved:**
- G1: classes C / D / U before predictions;
- G3: clear cases alone decide the thresholds;
- G4: recognition ≥ 90%;
- G6: 0 unjustified losses relative to the frozen v20 baseline;
- G7: rules-v21 only;
- G5: optional second blind label.

**Needs your confirmation before the freeze:**

| # | Item |
|---|---|
| G2 | The exact safety predicates SC1–SC7 (policy §4), including how "improper third-party ownership" (SC5) and the D3 breach (SC7) are defined |
| G8 | Replies: score the pre-reply verdict; report `after_reply_verdict` separately |
| G9 | The v20 baseline = the explanation read as a free-text answer with rules-v20, ignoring the choice |
| G10 | Role end date derived from the stated recency (the scenarios carry no end dates) |
| G11 | The G6 gate covers classes C and D; U losses are reported individually |

## 5. The harness: can it compare baseline and candidate without leaking sealed content?

**Not yet.** From reading `tests/eval/parts.eval.ts`; nothing sealed was read:

| Capability | State |
|---|---|
| Sole reader of `tests/fixtures/m11_parts` | Yes: enforced by `tests/sealed-splits.test.ts` |
| Validate mode | Counts only; never writes text or labels. Passes |
| Unseal gates | Implemented: refuses unless `PARTS_UNSEAL=1`, `PARTS_FREEZE_COMMIT` = HEAD, a clean tree, and `MANIFEST.json` integrity |
| **Scoring** (candidate, baseline, classes, safety predicates, G4/G6 metrics, report) | **Not implemented.** The unseal mode refuses after the gates, by design ("defined and approved at Stage G") |
| Leak safety of a scoring report | Not yet testable, because there's no report |

**Required before Stage G (each needs your approval; none touches sealed data):**

| # | Work | How |
|---|---|---|
| H1 | Implement the scoring path in the unseal mode, exactly per policy v3: class assignment first; then candidate (Stage F pipeline) and baseline (rules-v20); then SC1–SC7, G4, G6, A5, R1–R3 | Pure functions, reusing the app's modules |
| H2 | Tests on a **synthetic** fixture with the sealed schema: every predicate, both systems, the class assignment, and the gates | Hand-written synthetic scenarios only. Never derived from sealed content |
| H3 | Leak-safety tests: the report holds only counts, ids, verdicts, codes and booleans. A synthetic run checks that no explanation, reply, rationale or note text appears in the output | Asserted on synthetic data |
| H4 | The `sealed-splits` guard still passes: only `parts.eval.ts` reads the folder | Existing guard |
| H5 | Freeze: commit H1–H3, record the freeze commit and the policy's SHA-256, verify the manifest; then **stop for your approval to unseal** | — |

## 6. The freeze record (to fill at the freeze commit)

| Item | Value |
|---|---|
| Freeze commit (candidate + scoring code) | to be recorded |
| Candidate versions | rules-v21; splits-v1.1; structured-matching-v1 |
| Baseline | `textRules: "v20"` at the same commit |
| Policy SHA-256 (approved version) | to be recorded |
| R4 manifest (combined) | `32e3cf2ed03042d78719c65d132cbfb9e6f278c1e7f0abe2a5a9bdec42b0c93c` (verify) |
| Synthetic-fixture test results | to be recorded |

## 7. Production blockers (unchanged)

1. The Stage 1 then F1 migrations, each approved separately, after a read-only check of production's migration state; and a Stage 1 rollback procedure.
2. A Stage G result.
3. Explicit approval to enable the three flags. The form and matching flags are refused on Vercel by design.
4. Push, merge (PR #4) and deployment, each approved separately.

## 8. Order to Stage G

1. The two waiting browser specs, once the limit clears → Stage F **fully verified**.
2. Your confirmation of G2 and G8–G11.
3. Your approval to build H1–H3 (synthetic data only), then the freeze (H5).
4. Your explicit approval to unseal and run Stage G **once**.
