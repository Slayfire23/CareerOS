# Phase 5.3 Stage G: proposed evaluation-quality policy for the sealed R4 split

November 13, 2026. **A proposal for owner approval. Nothing here is performed.** No label is changed and the sealed split `tests/fixtures/m11_parts` isn't opened.

This document uses only the counts already recorded at sealing (`docs/PHASE5_3_R4_EVAL_PROTOCOL.md` §10). It proposes how Stage G should treat label uncertainty, so the rules are fixed **before** anyone sees a score.

## 1. What is known about the labels (counts only)

| Measure | Value | What it means |
|---|---|---|
| Scenarios / labels | 312 / 312 | One blind label per scenario |
| Writer–labeler agreement on the verdict | **143 of 312 (46%)** | The writer's intended verdict and the blind labeler's verdict differ on more than half the scenarios |
| Labels marked `unsure` | **55** | The labeler wasn't confident |
| Flags | contradiction 88; needs_clarification 115; text not read 21; injection 11; contradicted parts 170 | Many scenarios are deliberately hard |

**Concern (kept on record):** under the protocol the labels are authoritative, but they're **not infallible**. A 46% agreement rate means either the writer's intentions, the labeler's readings, or both are noisy on a large share of cases.

The disagreement could come from three places:
- the conservative-verdict instruction ("choose the more conservative verdict");
- genuinely ambiguous scenarios;
- labeler error.

Stage G can't tell these apart without opening the split, which is why the policy has to be decided now.

## 2. Proposed case classes (assigned mechanically at unseal, before scoring)

Each scenario falls into exactly one class, decided only from fields already in the sealed files. No human reads text to assign it.

| Class | Rule (in this order) | How it counts |
|---|---|---|
| **S: safety-critical** | The system's verdict is **Supported** and the label is anything lower, or the scenario carries an injection, non-English, contradiction or contradicted-part flag and the system gives more than the protocol allows | **Always counts, whatever the label's confidence.** A false Supported is a failure even when the label is `unsure` or disagrees with the writer. The bar stays at **0** |
| **C: clear** | The label isn't `unsure` **and** the writer's intended verdict equals the label | The primary accuracy measure. The acceptance thresholds apply here |
| **D: writer–labeler disagreement** | The label isn't `unsure`, but the writer's intent differs | Scored against the **label** (the label is authoritative), reported **separately**, and it doesn't gate acceptance except through class S |
| **U: unsure** | The label is `unsure` | Reported **separately**; it never gates acceptance except through class S |

Class S is checked first, so a safety failure is never hidden inside D or U.

## 3. Proposed acceptance at Stage G

1. **Class S:** 0 false Supported; 0 Supported from ticks alone; every contradicted activity without tick credit; 0 injections above Not enough; non-English never read. **No exception for `unsure` or disagreement.**
2. **Class C:** partial at most Possible; recognition at or above the owner-set share; the unsplit controls unchanged. The owner sets the share **before** unseal.
3. **Classes D and U:** reported with counts and the direction of each difference (system higher or lower than the label). Not gating.
4. **A failure in class S stops adoption.** A fix then needs a new independent split, per protocol §1.6: no tuning against opened cases.

## 4. Proposed handling after unseal (still without relabeling)

- **No label is changed, at any point.** The original labels and the manifest are the record.
- **If the owner wants a disputed case reviewed,** it gets a **second independent blind label** from a fresh labeler, reported beside the original. The original label still stands for the Stage G result; the second label informs only the next split's protocol.
- **Lessons go to the next split:** clearer verdict instructions, a writer–labeler reconciliation step **before** sealing, and a cap on `unsure`.

## 5. Decisions needed before Stage G

| # | Decision | Proposal |
|---|---|---|
| G1 | Adopt classes S / C / D / U as above | Approve |
| G2 | Safety-critical cases count regardless of label confidence | Approve |
| G3 | Acceptance thresholds apply to class C only; D and U are reported, not gating | Approve |
| G4 | The recognition share for class C | The owner sets a number before unseal |
| G5 | Optional second blind label for disputed cases, never replacing the original | Approve as optional |
