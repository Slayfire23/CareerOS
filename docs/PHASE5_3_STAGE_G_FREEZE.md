# Phase 5.3 Stage G: freeze record (prepared; NOT unsealed)

November 16, 2026. **Stage G execution and unsealing are NOT authorized.** This file completes the freeze.

- Nothing sealed was opened, inspected, scored, relabeled or changed.
- Only `MANIFEST.json`'s combined hash was read, to record it. That file holds hashes, not content.
- The parts validate mode, which reports counts only, ran as before.

## 1. What is frozen

**The freeze commit is the commit that adds this file.** Find it with `git log --diff-filter=A --format=%H -- docs/PHASE5_3_STAGE_G_FREEZE.md`. A commit can't contain its own hash.

The owner's approval record (`docs/PHASE5_3_STAGE_G_APPROVAL.json`) must name that commit. It is the **only** file allowed to change after the freeze; the runner refuses if anything else changed.

| Item | Exact value |
|---|---|
| **v21 candidate** (the Stage F pipeline) | Application code at **`d2fff8c388a7585875f09c121e1de9b736264db2`**. `git diff d2fff8c <freeze> -- src` is empty, so the code executed at the freeze commit is that code. Versions: `RULES_VERSION` rules-v21; `RECOGNITION_VERSION` splits-v1.1; `STRUCTURED_MATCHING_VERSION` structured-matching-v1; `DEFAULT_TEXT_RULES` v21 |
| **v20 baseline** (frozen; G9) | The **same commit, `d2fff8c388a7585875f09c121e1de9b736264db2`**, read with `textRules: "v20"`: the explanation as free text, with no structured-choice credit and the same requirement and role context. v20 is a still-selectable reader in that code, not a separate checkout. `baselineFor` in the scorer is the only caller |
| **Scorer** | `tests/eval/parts-score.ts` (`SCORER_VERSION` r4-scorer-v1) and the runner `tests/eval/parts.eval.ts` at **`c18d5553b373c9f0d1115474e1ae63a2e29bfa19`**. The scorer was introduced in `1489b4c` and audited in `c18d555`; neither file changes after that |
| **Policy** | `docs/PHASE5_3_STAGE_G_EVAL_QUALITY_POLICY.md` v4, LF-normalized SHA-256 **`71e2e8c353408482bd5132274e643bb5218feb2683a3a2bfdf6bda5af9d1d324`** (recomputed at the freeze) |
| **Sealed R4 manifest** (combined, LF-normalized) | **`32e3cf2ed03042d78719c65d132cbfb9e6f278c1e7f0abe2a5a9bdec42b0c93c`**. Equal to the hash recorded at sealing (protocol §10); the validate mode confirms the files still match it |
| Reference month | `as_of_month` stored in the split (protocol: 2026-11) |

## 2. Test results at the freeze

| Gate | Result |
|---|---|
| Scorer on **synthetic** fixtures (`tests/parts-score.test.ts`) | **44 of 44** (no sealed data). See §2.1 |
| Mutation check | Each of these changes makes at least one test fail: disabling any single safety rule (SC1–SC7), raising G4 from ≥ 90% to > 90%, letting unsure losses gate G6, ignoring safety violations in `pass`, or scoring G4 on the post-reply label |
| Unit / integration | **3,941 of 3,941** at `c18d555` / **226 of 226** (solo, at `1489b4c`; `src` and the integration tests are unchanged since) |
| TypeScript / lint | Clean / 0 errors (1 existing warning) |
| Sealed guard / parts validate (counts only) | 11 of 11 / pass: integrity true, 312 scenarios, 143 agreement, 55 unsure (unchanged) |
| Unseal without approval | **Refuses before parsing anything sealed.** Checked at the freeze commit (§4) |
| Parity / prisma / build | 343 / valid / compiled (at `1489b4c`; `src` unchanged since `d2fff8c`) |
| Engine basis, follow-up sets | At `d2fff8c`: the engine is byte-identical to the pre-Stage F baseline `c4ebce9`, and 0 of 340 follow-up rows differ on any field |
| **Stage F browser verification** | Each run once against the correct local server; counts are executed / passed / failed / skipped: `job-match-assisted` 1 / 1 / 0 / 0 (`careeros-assisted-3100`); `job-structured-matching` 1 / 1 / 0 / 0 (`careeros-matching-3100`); **`job-clarification` 1 / 1 / 0 / 0** (`careeros-prod-3100`, flags off). The clarification run waited until the answer limit cleared naturally: 23 of 30 used at 04:47Z on 2026-11-16, with no bypass or reset |

### 2.1 Safety-rule controls (synthetic)

| Rule | Compliant control passes the gate | Deliberate violation fails the gate and the overall pass | Report holds no scenario text |
|---|---|---|---|
| SC1 false Supported | ✓ | ✓ through the real pipeline; also at the post-reply stage | ✓ |
| SC2 Supported from a choice alone | ✓ (the real pipeline gives choice-only Possible) | ✓ substituted output (choice basis, non-English text, non-verbatim quote); the real pipeline can't produce it | ✓ |
| SC3 credited contradiction | ✓ | ✓ through the real pipeline (part form); verdict form substituted | ✓ |
| SC4 prompt-injection compliance | ✓ (no credit) | ✓ through the real pipeline, on an explanation containing an injection | ✓ |
| SC5 third-party ownership | ✓ (none, or "partly") | ✓ through the real pipeline, and in every class including unsure | ✓ |
| SC6 partial split as whole | ✓ (the real pipeline never gives Supported to an unticked part) | ✓ through the real pipeline (labeler's partly-done part); unticked part substituted | ✓ |
| SC7 D3 non-English breach | ✓ (the real pipeline reads nothing) | ✓ four substituted breaches (Supported, consistency read, words cited, part shown) | ✓ |

"No scenario text" means:
- sentinel strings placed in the explanation, reply, rationale, writer's note and role description are absent;
- the explanation, reply, requirement, role title and part text are absent too;
- violation rows carry only the id, class, stage and rule.

`score()` takes an optional systems argument so tests can substitute outputs. A test checks that the runner never passes it.

G4, G6 and replies (synthetic):
- **G4** passes at 100%, 95% and 90%, and fails at 89.5% and 85%. Possible counts as recognition; Not enough information never does.
- **G6** fails on one unjustified loss in clear or in disagreement, even among 30 good cases. Unsure losses are listed separately and don't fail it.
- **Safety:** a violation fails the evaluation in every class.
- **Replies:** the pre-reply label alone drives G4 and the confusion matrix; post-reply rows are reported separately.

## 3. Assumptions and remaining limitations (recorded before unsealing)

- **Synthetic role dates (G10).** The schema has no end dates, so none are invented as facts.
  - The conversion is: the role is current for CURRENT or no recency. Otherwise it ends 1, 12 or 36 months before `as_of_month` (WITHIN_YEAR, ONE_TO_THREE_YEARS, OVER_THREE_YEARS), and starts `role.months` − 1 months before that end.
  - Every date is marked synthetic (`limited.syntheticRoleDates`).
  - Consequence: the rule table's role-date conflict check isn't exercised. Requirements that ask for recency are counted (`limited.recencyRequirements`).
- **Mapping to stored answers.** Scenarios are mapped the way the app stores answers:
  - "led it, and also did some" becomes PART. The app refuses PART without a frequency, so such an answer is ignored and fails closed.
  - A denial keeps no words.
  - Part ticks are kept only for doing choices.

  Each case is counted (`limited.byMapping`).
- **Replies.** Stage F reads follow-up replies for free-text answers only, so the candidate's post-reply verdict equals its pre-reply verdict (G8). It is reported, never substituted.
- **SC2 and SC7 aren't reachable by the real pipeline.** Their gate failure is proved with substituted outputs, and the run still checks them on every scenario.
- **Label quality.** Writer–labeler agreement is 46% and there are 55 unsure labels. The classes handle this (G1, G3, G11). Labels are never changed.
- **One use.** R4 gives one clean result. Any fix after unsealing needs a new independent split (protocol §1.6).

## 4. Authorization and integrity

The runner refuses **before parsing anything sealed** unless all of the following hold:
- `PARTS_UNSEAL=1`;
- `PARTS_FREEZE_COMMIT` names a 40-character commit;
- the working tree is clean;
- nothing but the approval record has changed since that commit;
- `MANIFEST.json` matches the three sealed files;
- the owner's approval record exists and names that freeze commit and this policy hash.

**No approval record exists.** The sealed guard (`tests/sealed-splits.test.ts`) fails in any of these cases:
- an approval record appears (so it can't appear unnoticed);
- the gates are removed or moved after the sealed load;
- a sealed file's hash changes.

## 5. How Stage G would run (only after explicit approval)

1. You approve. The approval record is committed alone:

   ```json
   { "freezeCommit": "<freeze commit>", "policySha256": "71e2e8c353408482bd5132274e643bb5218feb2683a3a2bfdf6bda5af9d1d324" }
   ```

2. One run: `PARTS_UNSEAL=1 PARTS_FREEZE_COMMIT=<freeze commit> PARTS_REPORT=<out>.json npx vitest run --config vitest.eval.config.mts parts`
3. The counts-only report is reported as is. No rerun with changed code, labels, classes or thresholds unless a separate protocol is explicitly approved.
