# Phase 5.3 Stage G: evaluation-quality policy for the sealed R4 split (final proposal)

November 15, 2026 (v2; replaces the 2026-11-13 draft). **A proposal for owner approval. Nothing here is performed.**
- No label is changed.
- The sealed splits (`tests/fixtures/m11_parts`, `m11_structured`, `m11_followup4`) aren't opened, inspected or scored.
- This document uses only the counts recorded at sealing (`docs/PHASE5_3_R4_EVAL_PROTOCOL.md` §10).

The aim is to fix every rule **before** anyone sees a score, so the result can't be shaped after the fact.

## 1. Scope (owner decision, 2026-11-15)

- **rules-v21 only.** The initial sealed evaluation reads with rules-v21, the default, and recognition `splits-v1.1`.
- **rules-v22 is excluded.** It isn't run, scored or reported against R4 in this evaluation. Evaluating v22 later needs its own approval, and per protocol §1.6 a fresh independent split. R4 can be used only once for a clean result.
- **What is evaluated:** the structured "your part" path as built in Stage F (rule table, recognition, citations), with `STRUCTURED_MATCHING_ENABLED` on in the evaluation harness only. Production stays off.

## 2. What is known about the labels (counts only)

| Measure | Value |
|---|---|
| Scenarios / labels | 312 / 312 (one blind label each) |
| Writer–labeler agreement on the verdict | **143 of 312 (46%)** |
| Labels marked `unsure` | **55** |
| Flags | contradiction 88; needs_clarification 115; text not read 21; injection 11; contradicted parts 170 |
| Label verdicts | supported 92, possible 130, not_enough 85, not_supported 5 |

**On record:** under the protocol the labels are authoritative, but they're not infallible. 46% agreement means the writer's intentions, the labeler's readings, or both, are noisy on a large share of cases. The causes can't be separated without reading sealed content: the protocol's "choose the more conservative verdict" rule, genuine ambiguity, or labeler error. **This policy therefore never treats a label as wrong. It only decides how much weight each class of case carries.**

## 3. Case classes: clear versus uncertain

Each scenario falls into **exactly one** class. Classes are assigned **mechanically** at unseal, by a script reading only the stored fields: the label's `verdict` and `unsure`, the writer's intended verdict, and the flags. They're assigned **before** any system output is computed. No person reads scenario text to assign a class.

| Class | Rule, checked in this order | Weight |
|---|---|---|
| **S: safety-critical** | Decided after scoring, from the system's output (§4). It overrides the other classes | **Always counts, whatever the label's confidence. Gating, with a bar of 0** |
| **C: clear** | Not `unsure`, **and** the writer's intended verdict equals the label | **Strict scoring.** The acceptance thresholds apply here only |
| **D: disagreement** | Not `unsure`, but the writer's intent differs from the label | Scored against the **label**, reported separately, **not gating** (except through S) |
| **U: unsure** | The label is `unsure` | Reported separately, **not gating** (except through S) |

**Ambiguous cases (D and U):**
- They're **excluded from strict recognition scoring**: the class C rates and thresholds don't include them.
- Every one is still **scored and reported separately**.
- Every one is still subject to the safety-critical bar.

The class sizes are only partly known before unseal: **C + D = 257** and **U = 55**. C is at most 143, and smaller by however many of the 143 agreeing cases are also unsure. The split is computed by the script at unseal and reported first.

## 4. Safety-critical results (class S): the bar is 0, in every class

A case is safety-critical, and a failure of the evaluation, if **any** of these holds for the system's verdict:

1. **False Supported:** the system says Supported and the label is anything lower (Possible, Not enough information, Not supported).
2. **Supported from a choice alone:** Supported where the person's own words don't show the work. This is enforced in code, but must be **0** in the result.
3. **Choice cited above Possible:** a `candidate_choice` result above Possible, or a choice citation in any Supported finding.
4. **Contradiction credited:** a tick credited on an activity the description gives to someone else (contradicted parts), or a "did it myself" credited against a whole-transfer description.
5. **Injection or unread text credited:** anything above Not enough information on an injection-flagged scenario, or any reading of a non-English description (it must be "text not read").
6. **Partial shown as whole:** Supported on a split requirement when any required part isn't ticked and shown.

A single safety-critical failure **stops adoption**. A fix needs a new independent split (protocol §1.6), with no tuning against opened cases. `unsure` labels and writer disagreement **never excuse** a safety-critical result.

## 5. Acceptance (rules-v21, decided before unseal)

| # | Criterion | Applies to | Gating |
|---|---|---|---|
| A1 | 0 safety-critical results (§4) | All 312 | **Yes** |
| A2 | Partial requirements: at most Possible | C | **Yes** |
| A3 | Recognition rate ≥ **owner-set share** (G4): label Supported/Possible and system at the same verdict | C | **Yes** |
| A4 | **Qualified-loss rate** ≤ **owner-set ceiling** (G6): label Supported or Possible, system lower | C | **Yes** |
| A5 | The 20 unsplit controls are unchanged from the rules-only result | Controls | **Yes** |
| A6 | Engine basis and follow-up sets unchanged with the flag off | Regression | **Yes** |
| R1 | The same rates as A3/A4, for D and for U | D, U | Reported only |

**Qualified losses** (A4, R1) are reported with their direction and the reason the system gave, from its own output, never from scenario text: the verdict and the limit codes, such as `no_specific_text`, `missing_compound_parts` or `recency_not_met`. A loss with a recorded conservative limit is a *justified* loss. One without such a limit is *unjustified*, and is counted and reported as such.

## 6. Reporting disagreements without altering labels

- **No label is changed, ever.** `labels.json`, `scenarios.json` and `MANIFEST.json` are the record. The manifest hash is verified before and after scoring, and must be unchanged.
- **Aggregate reporting only.** Results come as counts by class (S/C/D/U), by split id, by flag, and by direction (system higher or lower than the label). A per-case table of ids and verdicts is kept as an evaluation artifact. Scenario text isn't quoted in reports.
- **For each disagreement class (D, U):** how often the system agrees with the label, and how often with the writer's intent. This shows where the label noise sits without overruling it.
- **Disputed cases.** If you want one reviewed, it gets a **second independent blind label** from a fresh labeler (G5), reported beside the original. The original label stays authoritative for the Stage G result; the second label informs only the next split's protocol.
- **Lessons for the next split:** clearer verdict instructions; a writer–labeler reconciliation step **before** sealing; a cap on `unsure`.

## 7. Process guarantees

1. **This policy is frozen before unseal.** Its approved version and SHA-256 are recorded in the Stage G report before the split is opened.
2. Classes are assigned by script before system output is computed (§3). Safety-critical results are then marked by script from the output (§4).
3. **One scoring pass.** No re-running with changed code, thresholds or classes after results are seen. Any rerun is reported as such, beside the first.
4. The sealed-splits guard and the parts validator run before unseal, and must pass.
5. Stage G starts only with your explicit approval, after Stage F is fully verified (`docs/PHASE5_3_STAGE_F_COMPLETION_REPORT.md` §13).

## 8. Decisions needed before Stage G

| # | Decision | Proposal |
|---|---|---|
| G1 | Classes S / C / D / U, assigned mechanically (§3) | Approve |
| G2 | Safety-critical results count in every class, with a bar of 0 (§4) | Approve |
| G3 | Strict thresholds apply to class C only; D and U are reported, not gating | Approve |
| G4 | **The recognition share for class C (A3)** | **You set a number before unseal** |
| G5 | Optional second blind label for disputed cases, never replacing the original | Approve as optional |
| G6 | **The qualified-loss ceiling for class C (A4)**, and whether *unjustified* losses get a separate ceiling | **You set the numbers before unseal** |
| G7 | Scope: rules-v21 only; rules-v22 excluded (§1) | Already decided (2026-11-15) |
