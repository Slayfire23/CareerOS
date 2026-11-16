# Phase 5.3 Stage G: evaluation-quality policy for the sealed R4 split

November 16, 2026. **v4: approved by the owner (G1–G11 confirmed 2026-11-16, with the refinements below). Stage G execution and unsealing are NOT authorized.** The scorer that implements this policy is `tests/eval/parts-score.ts`, tested on synthetic data only (`tests/parts-score.test.ts`). Constraints:
- no label is changed;
- the sealed splits (`tests/fixtures/m11_parts`, `m11_structured`, `m11_followup4`) are not opened, inspected or scored;
- this document uses only the protocol (`docs/PHASE5_3_R4_EVAL_PROTOCOL.md`: the schema §3, the labeling rules §6, the counts §10);
- it replaces v3, v2 and the 2026-11-13 draft.

Every rule here is fixed **before** anyone sees a score. Decisions still open before unsealing are listed in §9.

## 1. Scope

- **rules-v21 only** (the default reader), recognition `splits-v1.1`, structured matching `structured-matching-v1`, and the Stage F pipeline as committed. **rules-v22 is excluded.** Evaluating it later needs its own approval and, under protocol §1.6, a new independent split.
- **Candidate (v21):** the Stage F structured path for each scenario, through the same code as the app: `applyStructuredAnswers` → `matchStructuredAnswer` → the rule table → the validator, with `STRUCTURED_MATCHING_ENABLED` on **in the harness only**. The full input mapping is in §8.2.
- **Baseline (v20, frozen; G9):** the scenario's explanation read as a free-text answer with rules-v20 (`textRules: "v20"`, still selectable), with **no structured-choice credit**, and the same requirement and role context as the candidate. The choice is ignored entirely: NOT_DONE gives no denial in the baseline either, so the baseline never borrows from the structured answer. No baseline change after unsealing.
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

**Every check can be implemented from stored fields (verified against the protocol's schema, §3).**

| Check | Stored fields it uses | Candidate output it uses | Needs new semantic judgment? |
|---|---|---|---|
| SC1 | `label.verdict`, `label.after_reply_verdict` | verdict | No |
| SC2 | `answer.explanation`, `language` | verdict, basis, cited quote (checked as a verbatim substring) | No |
| SC3 | `label.parts[i].contradicted`, `answer.parts[i].checked`, `label.contradiction`, `label.verdict` | per-part `shown`, verdict | No |
| SC4 | `label.injection` | verdict | No |
| SC5 | `label.personally_did` | verdict | No |
| SC6 | `split_id`, `answer.parts[i].checked`, `label.parts[i].done`, `label.parts[i].shown_by_own_text` | verdict | No |
| SC7 | `language` | verdict, citation, consistency state, per-part `shown` | No |

Where a check depends on meaning ("someone else did it", "this part was shown in the person's own words"), it uses the field the labeler recorded under the frozen protocol (§6), never a new reading. **No check is weakened or omitted.** SC2 confirms only that a Supported rests on the person's own English words, verbatim. Whether those words show the work is SC1's job (against the label).

**Reply scenarios (G8):** the checks run at both stages. Stage F reads follow-up replies for free-text answers only, so the candidate's post-reply verdict is its pre-reply verdict. SC1 and SC3(b) compare with `after_reply_verdict` at the post stage. The other checks don't depend on the label's verdict, so they're identical at both stages.

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
| A5 | The 20 unsplit controls never take split recognition: no split link, no per-part reading. A structured answer still applies to them as a whole requirement | Yes |
| A6 | With the flag off, engine basis and follow-up sets unchanged (as in Stage F) | Yes |
| R1 | Per class: counts, the 4 × 4 confusion table, and the direction of every difference (candidate above or below the label) | Reported |
| R2 | For D and U: how often the candidate agrees with the label, and how often with the writer's intent | Reported |
| R3 | Scenarios with a reply (12): `after_reply_verdict` against the candidate. Post-reply behaviour never substitutes for pre-reply recognition | Reported only (G8) |

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
| Role | `role.title`, `role.description`; dates per G10 from `role.months`, `answer.recency` and the frozen reference month `as_of_month` (2026-11, stored in the split) |
| Choice | As the form stores it: "led it, and also did some" becomes PART with `alsoDidSome`; a denial keeps no words; part ticks are stored only for "did it myself" / "did some of it". Each such mapping is counted per scenario (`limited.byMapping`) |
| Answer | An ACTIVE formVersion 2 record from `answer`, with `evidenceId` `experience:<id>`. Parts in the approved order with their ticks; controls have none |
| Evidence | The role, plus the explanation as the answer's entry. No other profile evidence, so rules findings start from the role alone |
| Readings | Default reader; recognition `splits-v1.1`; choice items on the rules request only |

### 8.3 Process

1. Classes are assigned first; then candidate and baseline are computed; then the S flags and metrics.
2. **One scoring pass.** No rerun with changed code, labels, classes or thresholds after results are seen, unless a separate protocol is explicitly approved. Any approved rerun is reported beside the first.
3. **No optimization against sealed results.**
4. The sealed guard and the parts validator run before unsealing, and must pass.

## 8A. Recency and dates (G10 as approved, with methodology)

- **No exact employment dates exist in the schema** (`role.months` and a recency bucket only), so none are invented as facts. Where the evaluator needs dates (the role's span), it uses the frozen reference month (`as_of_month`) and this one documented conversion:
  - **CURRENT or no recency:** the role is current.
  - **Otherwise:** the role ends at the most recent month the bucket allows (WITHIN_YEAR: 1 month before; ONE_TO_THREE_YEARS: 12; OVER_THREE_YEARS: 36).
  - **The start** is that end minus `role.months` + 1.
- **Every role date is marked synthetic** (`limited.syntheticRoleDates`).
- **Consequences, tested on synthetic boundaries:**
  - the conversion never creates a role-date conflict the scenario didn't state (every bucket × months 1–120);
  - older experience isn't penalized when the requirement doesn't ask for recency;
  - an ambiguous recent-experience boundary never gives Supported.
- **Limited metric:** the rule table's role-date conflict check can't be exercised, because the schema has no end dates; this is reported, not invented. The number of requirements that ask for recency is reported too (`limited.recencyRequirements`). The protocol's 33 splits and 10 controls don't.

## 9. Decisions

| # | Decision | Status |
|---|---|---|
| G1 | Classes C / D / U, assigned before predictions | **Approved** |
| G2 | The objective safety checks SC1–SC7 across all 312, bar 0; S overlaps the classes. A failure needs an objective violation; an Unsure label or disagreement alone never makes one | **Approved**. All seven verified as implementable from stored fields (§4) |
| G3 | Clear cases alone decide G4 and the ordinary thresholds; D and U reported | **Approved** |
| G4 | Recognition ≥ 90% (§5) | **Approved** |
| G5 | Optional second blind label, never replacing the original | Approved as optional |
| G6 | 0 unjustified losses relative to the frozen v20 baseline; every loss reported (§6) | **Approved** |
| G7 | rules-v21 only | **Approved** |
| G8 | Replies (12): the pre-reply verdict is primary; post-reply reported separately and never substituted; safety checks at both stages | **Approved** |
| G9 | The v20 baseline: the explanation as free text under rules-v20, no structured-choice credit (NOT_DONE included), the same requirement and role context, no post-hoc changes | **Approved** |
| G10 | A frozen reference month and the documented conversion (§8A); no invented exact dates; conservative recency; synthetic dates recorded; limited metrics flagged | **Approved with modification** (as §8A) |
| G11 | The G6 gate applies to C and D. Every U loss is counted and reported, never discarded, and never fails G6 by itself. Safety checks apply in every class. Justification is the frozen rule (§6), with no reading of sealed text after scoring | **Approved with modification** |
