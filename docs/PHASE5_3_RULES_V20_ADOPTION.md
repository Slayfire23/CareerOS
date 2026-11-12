# Phase 5.3: rules-v20 adopted for matching

November 11, 2026. Local commit, not pushed. Owner-approved as its own change after the Stage 3 report (docs/PHASE5_3_STAGE3_REPORT.md). The plan allows it: Stage 3 covers the rules-v20 text-reader rules, adopted once their comparison is reported, with labeled losses needing approval.

## What changed

| File | Change |
|---|---|
| `src/lib/ai/evidence-boundary.ts` | `DEFAULT_TEXT_RULES = "v20"` is the default for `answerStatements`, so every reader (answers, follow-up replies, the interpretation gate) reads with v20. `"v19"` stays selectable for comparisons. Two targeted fixes, below |
| `src/lib/ai/rules/answer-review.ts` | The years-of-experience claim now reads with the same text rules as the rest of the answer (it used to take the default regardless) |
| `src/lib/ai/rules/engine.ts` | `RULES_VERSION` is `rules-v20` (stored on new analyses and events) |
| `tests/ai-rules-v20.test.ts`, `tests/ai-rules-v12.test.ts` | v19 is asked for explicitly in comparisons; the default is asserted as v20; adoption regression tests (below) |

Unchanged:
- the O4 rules (both rejected);
- the equivalence table (42 groups, both Batch 5 groups held);
- the Stage 2 split report (16 proposed and 93 ambiguous splits, none active);
- the consistency module (still not connected).

## Two misreadings found during adoption, now fixed

The first adoption run stopped before committing. The follow-up reply reader, which Stage 3 couldn't compare because it has no opt-in, refused two labeled-good replies.

| Issue | Cause | Fix (structural) |
|---|---|---|
| A: "I've led three sessions **on my own** with about 12 people each" (m11_followup3 fw-037) was refused; "I operate the forklift on my own every shift" fell from Supported to Possible | The personal-context rule matched "on my own" plus any word | "My own" must head a noun phrase. A function word, number, adverb or nothing after it marks the idiom *by myself*. So do "with my own hands" and "on my own initiative" |
| B: "I walked her through the business checking setup, **got her signers added**…" (m11_followup2 fv-064) was refused; the labeled-supported answer fell from Possible to Not enough information | "Walked" counts as a checking verb, and "her signers added" was read as other people's finished work | After a causative verb (got, had, made, let…) the agent isn't someone else who finished the work: the person brought it about |

**New permanent tests (20):**
- both replies;
- "on my own" in 7 forms that must keep Supported (forklift, end of sentence, "now that…", "initiative", "with my own hands", payroll, bookkeeping);
- 5 genuine personal-context cases that must stay exposure only;
- 2 causatives;
- 4 genuine supervision or third-party cases that must stay below Supported.

## Verification: before (6497f66, v19 default) vs after (v20 default with fixes)

| Check | Result |
|---|---|
| 1,266 historical answers (1,046 + 220 ownership benchmark) | **1 change, the expected labeled gain:** ICD-10 coding, "I entered the codes doctors picked … never assigned them from the charts myself" (does_not_qualify), Possible → Not enough information. **0 labeled losses, 0 new Supported**, benchmark 0 changed. Verdicts: supported 102 → 102, possible 217 → 216, not enough 947 → 948 |
| 392 probes | 40 rows changed (23 distinct): **11 distinct false Supported removed, 0 new false Supported, 0 positives lowered**, 4 raised (the paying-invoices and passing-medications recognition fixes) |
| 320 follow-up replies | **0 changed** (2 refused in the first run; both fixed) |
| Follow-up regression sets: m11_followup dev (40), blind (80); m11_followup2 (100); m11_followup3 (120) | **0 rows changed in all four**; false Supported, unsafe Possible and replies accepted unchanged |
| Engine baseline | 0 of 2,121 changed |
| Explicit `textRules: "v19"` | Reproduces the old default exactly on all 1,266 answers and 392 probes |
| Unit / integration | 2,571 / 183 pass; TypeScript, lint (one older warning) and schema pass |
| Sealed splits | Hash guard only: 8 of 8; neither split opened |
| Held groups and splits | Neither Batch 5 group is in the table; nothing outside its own module calls the compound splitter |

The fixes changed nothing else: history, probes and engine are identical to the first adoption run. Evidence is in `ai-service/evals/reports/m11/structured/adoption-v20.json`.

## Still open (unchanged)

The 11 word-sense false Supported stay as release blockers (B1 budget, B2, B3-OIL, B4-MODIFIER). Batch 5 stays held. The split proposals await the owner's decisions before Stage 4.
