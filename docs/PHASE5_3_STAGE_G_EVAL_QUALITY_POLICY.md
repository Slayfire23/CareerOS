# Phase 5.3 Stage G: evaluation-quality policy for the sealed R4 split

November 16, 2026. **v3: owner-approved in principle (2026-11-16), with G4 = 90% and G6 = 0 unjustified losses. Stage G is NOT authorized to run.** Constraints:
- no label is changed;
- the sealed splits (`tests/fixtures/m11_parts`, `m11_structured`, `m11_followup4`) are not opened, inspected or scored;
- this document uses only the protocol (`docs/PHASE5_3_R4_EVAL_PROTOCOL.md`: the schema §3, the labeling rules §6, the counts §10);
- it replaces v2 (2026-11-15) and the 2026-11-13 draft.

Every rule here is fixed **before** anyone sees a score. Decisions still open before unsealing are listed in §9.

## 1. Scope

- **rules-v21 only** (the default reader), recognition `splits-v1.1`, structured matching `structured-matching-v1`, and the Stage F pipeline as committed. **rules-v22 is excluded.** Evaluating it later needs its own approval and, under protocol §1.6, a new independent split.
- **Candidate (v21):** the Stage F structured path for each scenario, through the same code as the app: `applyStructuredAnswers` → `matchStructuredAnswer` → the rule table → the validator, with `STRUCTURED_MATCHING_ENABLED` on **in the harness only**. The full input mapping is in §8.2.
- **Baseline (v20, frozen):** what CareerOS gave the same person before structured matching existed. The scenario's explanation is read as a free-text answer with rules-v20 (`textRules: "v20"`, still selectable), and the structured choice is ignored. NOT_DONE is a free-text denial (see G9).
- **Verdict mapping:** app `insufficient_information` = label `not_enough`; app `gap` = label `not_supported`. Order: not_supported < not_enough < possible < supported.

## 2. Known label facts (counts only, from protocol §10)

| Measure | Value |
|---|---|
| Scenarios / labels | 312 / 312 |
| Writer–labeler agreement on the verdict | 143 of 312 (46%) |
| `unsure` labels | 55 |
| Label verdicts | supported 92, possible 130, not_enough 85, not_supported 5 |
| Flags | contradiction 88; needs_clarification 115; text not read 21; injection 11; contradicted parts 170 |

The labels are authoritative but not infallible. **This policy never treats a label as wrong. It decides only how much weight each case carries.**

## 3. Case classes, and the safety flag

**Classes**, exactly one per scenario. They are assigned by script **before any candidate or baseline output is computed**, from stored fields only (`label.unsure`, `label.verdict`, `writer_intended.verdict`):

| Class | Rule | Used for |
|---|---|---|
| **Clear (C)** | Not `unsure`, **and** the writer's intended verdict equals the label's | G4, the recognition threshold, and every ordinary threshold |
| **Disagreement (D)** | Not `unsure`, and the writer's intent differs from the label | Scored against the **label**, reported separately |
| **Unsure (U)** | `label.unsure = true` | Scored against the label, reported separately |

C + D = 257 and U = 55. C is at most 143. The script computes and reports the exact split first.

**The safety-critical flag (S) overlaps the classes.** It isn't a fourth class. It's computed after scoring for **every one of the 312** scenarios, from the objective checks in §4. A case keeps its class and may also carry the S flag. **Neither `unsure` nor writer–labeler disagreement by itself ever sets the flag.**

## 4. Objective safety checks (all 312; the bar is 0)

Each check is a fixed predicate over stored label and scenario fields plus the candidate's own output (verdict, basis, citation, per-part `shown`, consistency state). No person judges text. "Credit" means a candidate verdict of `supported` or `possible`.

| # | Check | Violation when (all conditions true) | Evidence recorded |
|---|---|---|---|
| SC1 | **False Supported** | Candidate `supported` **and** `label.verdict ≠ supported` | id, class, both verdicts |
| SC2 | **Choice-only Supported** | Candidate `supported` **and** (no English explanation, **or** basis ≠ `candidate_answer`, **or** the cited quote isn't a verbatim substring of the scenario's explanation) | id, basis, whether the quote is verbatim (boolean; the quote isn't printed) |
| SC3 | **Credited contradiction** | (a) A split part with `label.parts[i].contradicted = true` and `answer.parts[i].checked = true`, that the candidate counts (its `split.parts[i].shown = true`), **or** (b) `label.contradiction = true` **and** the candidate verdict is above `label.verdict` | id, part index, flags |
| SC4 | **Prompt-injection compliance** | `label.injection = true` **and** the candidate gives credit (protocol: injection → `not_enough`) | id, candidate verdict |
| SC5 | **Improper third-party ownership** | `label.personally_did = "no"` **and** the candidate gives credit | id, `personally_did`, candidate verdict, category |
| SC6 | **Partial split credited as whole** | `split_id ≠ null` **and** the candidate is `supported` **and** some part is unticked, **or** has `label.parts[i].shown_by_own_text = false`, **or** has `label.parts[i].done ≠ "yes"` | id, per-part flags |
| SC7 | **D3 breach (non-English)** | `language ≠ "en"` **and** (the candidate is `supported`, **or** cites the explanation as the person's words, **or** its consistency state ≠ `text_unread`, **or** it counts any split part as `shown`) | id, language, which condition |

**A non-English explanation is not itself a violation.** Only unsupported semantic credit, or another breach of D3, is.

**A single violation fails Stage G.** A fix needs a new independent split (protocol §1.6), with no tuning against opened cases.

## 5. G4: recognition (class C only)

| Measure | Definition | Gate |
|---|---|---|
| **Recognition rate** | Of the C cases labeled `supported` or `possible`, the share where the candidate gives `supported` or `possible`. **`not_enough` never counts as recognition** | **≥ 90%** |
| Exact Supported agreement | Of the C cases labeled `supported`, the share where the candidate gives `supported` | Reported |
| Confusion counts | The full 4 × 4 table, label against candidate, for C (and separately for D and U); Supported and Possible counts shown separately | Reported |

## 6. G6: qualification losses (relative to the frozen v20 baseline)

- **A loss** is any scenario where the baseline gives credit (`supported` or `possible`) and the candidate gives a **lower** verdict.
- **Justified**, decided objectively from the frozen labels and the §6 labeling rules, never by agreeing with v21: a loss is justified **only if the authoritative label is at or below the candidate's verdict** (`rank(label.verdict) ≤ rank(candidate)`). In other words, the frozen labeling rules say the lower verdict is correct.
- **Unjustified:** the label is above the candidate's verdict.
- **Every loss is reported,** justified or not, with:
  - the id;
  - the class;
  - all three verdicts;
  - the candidate's own limit codes (for example `no_specific_text`, `missing_compound_parts`, `contradicted_part`), as objective context. The codes never decide justification.
- **Gate: 0 unjustified losses** in classes C and D, where the labels are confident (see G11). Unjustified losses in U are reported, one by one.

## 7. Further gates and reports

| # | Item | Gate |
|---|---|---|
| A5 | The 20 unsplit controls: candidate equals the rules-only result (structured parts never apply) | Yes |
| A6 | With the flag off, engine basis and follow-up sets unchanged (as in Stage F) | Yes |
| R1 | Per class: counts, the 4 × 4 confusion table, and the direction of every difference (candidate above or below the label) | Reported |
| R2 | For D and U: how often the candidate agrees with the label, and how often with the writer's intent | Reported |
| R3 | Scenarios with a reply (12): `after_reply_verdict` against the candidate | Reported only (G8) |

**Disagreements are reported without touching labels.**
- No label, scenario or manifest is ever changed. `MANIFEST.json` (combined `32e3cf2e…c93c`) is verified before and after scoring, and must be unchanged.
- Reports contain counts, ids, verdicts, codes and booleans. **No scenario text, explanation, reply or rationale is printed or written.**
- A disputed case may get an optional **second independent blind label**, reported beside the original. The original stays authoritative (G5).

## 8. Freeze and reproducibility (all recorded before unsealing)

### 8.1 Frozen items

| Item | Recorded as |
|---|---|
| Candidate code (the Stage F pipeline) and the harness's scoring code | One **freeze commit** hash. The unseal mode already refuses unless `PARTS_FREEZE_COMMIT` = HEAD and the tree is clean |
| Versions | `RULES_VERSION` rules-v21; baseline `textRules: "v20"`; `RECOGNITION_VERSION` splits-v1.1; `STRUCTURED_MATCHING_VERSION` structured-matching-v1 |
| This policy (approved version) | SHA-256 of this file at the freeze commit |
| The sealed split | `MANIFEST.json` combined hash `32e3cf2ed03042d78719c65d132cbfb9e6f278c1e7f0abe2a5a9bdec42b0c93c`, verified |
| Class rules, safety predicates, thresholds, verdict mapping, input mapping (§8.2) | In the frozen scoring code, covered by its tests on synthetic data |
| The scoring code's own validation | Its test results on a **synthetic** fixture with the same schema (never sealed data) |

### 8.2 Input mapping (frozen with the code)

| Field | Mapping |
|---|---|
| Requirement | The scenario's `requirement.text` and category |
| Role | `role.title`; months = `role.months` at `as_of_month` 2026-11; months since it ended per G10 |
| Answer | An ACTIVE formVersion 2 record from `answer`, with `evidenceId` `experience:<id>`. Parts in the approved order with their ticks; controls have none |
| Evidence | The role, plus the explanation as the answer's entry. No other profile evidence, so rules findings start from the role alone |
| Readings | Default reader; recognition `splits-v1.1`; choice items on the rules request only |

### 8.3 Process

1. Classes are assigned first; then candidate and baseline are computed; then the S flags and metrics.
2. **One scoring pass.** No rerun with changed code, labels, classes or thresholds after results are seen, unless a separate protocol is explicitly approved. Any approved rerun is reported beside the first.
3. **No optimization against sealed results.**
4. The sealed guard and the parts validator run before unsealing, and must pass.

## 9. Decisions

| # | Decision | Status |
|---|---|---|
| G1 | Classes C / D / U, assigned before predictions | **Approved** |
| G2 | The objective safety checks SC1–SC7 across all 312, bar 0; S overlaps the classes | **Approved in principle**: please confirm the exact predicates in §4 |
| G3 | Clear cases alone decide G4 and the ordinary thresholds; D and U reported | **Approved** |
| G4 | Recognition ≥ 90% (§5) | **Approved** |
| G5 | Optional second blind label, never replacing the original | Approved as optional |
| G6 | 0 unjustified losses relative to the frozen v20 baseline; every loss reported (§6) | **Approved** |
| G7 | rules-v21 only | **Approved** |
| G8 | Replies (12 scenarios): score the pre-reply verdict; report `after_reply_verdict` separately, not gating. Stage F reads follow-up replies for free-text answers only | **Proposed** |
| G9 | The v20 baseline is the explanation read as a free-text answer with rules-v20, ignoring the choice; NOT_DONE as a free-text denial | **Proposed** |
| G10 | Role end date: scenarios carry months, not end dates. Months since it ended = none for CURRENT (or no recency); otherwise the lower bound of the stated recency (WITHIN_YEAR 1, ONE_TO_THREE_YEARS 12, OVER_THREE_YEARS 36). That way the harness never creates a role-date conflict the scenario didn't state | **Proposed** |
| G11 | The G6 gate applies to classes C and D; U losses are reported individually | **Proposed** |
