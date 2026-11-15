# Phase 5.3 Stage F2: the pure structured-matching module (not connected)

November 14, 2026. **Owner-approved scope:** F2 only (design `docs/PHASE5_3_STAGE_F_DESIGN.md` §3–6 and §11). Constraints, all in force:
- the module is not imported anywhere in the app;
- no migration, UI, flag, validator or citation change;
- rules-v21, rules-v22, `splits-v1.1`, the rule table, the consistency reader and the approved splits are unchanged;
- no sealed split was opened.

## 1. Files

| File | Change |
|---|---|
| `src/lib/ai/rules/structured-matching.ts` | **New.** `matchStructuredAnswer`, its typed input and output, `STRUCTURED_MATCHING_VERSION = "structured-matching-v1"` |
| `tests/structured-matching.test.ts` | **New.** 650 tests: 62,150 exhaustive combinations, all 284 parity rows, all 33 splits |
| `tests/ai-structured-answer.test.ts`, `tests/structured-audit.test.ts` | Isolation guards: the new module is the **one** file allowed to call `readStructuredAnswer`. A new check that **nothing in `src` imports it**. Nothing else was loosened |

## 2. API and contracts

```ts
matchStructuredAnswer(input: StructuredMatchInput): StructuredMatch
```

**Input**, all explicit:

| Field | What it is |
|---|---|
| `requirement`, `questionKey` | The requirement being matched, and the question key the review uses for it |
| `finding` | The rules' verdict and basis before any answer |
| `answer` | The stored formVersion 2 row, typed loosely and **re-validated** |
| `role` | The role's months, and months since it ended |
| `freeTextCounts` | Whether a free-text answer, entry or denial already counts for this question |
| `text` | The consistency reading and the `readAnswer` reading of this requirement, tagged with `readerVersion` and `forText` |
| `parts` | Recognition, tagged with `recognitionVersion`, `readerVersion`, `forText` and `splitId` |
| `expect` | Optional; defaults to the default reader (v21) and `splits-v1.1` |

**Output:**

| Field | What it is |
|---|---|
| `ignored` | Why the answer wasn't used, or null |
| `changed`, `verdict`, `rulesOnlyVerdict` | Whether the finding changed, and the verdict after and before |
| `basis` | `candidate_answer` (the person's verbatim words), `candidate_choice` (the choice itself; Possible at most) or `candidate_denied` |
| `citation` | `experience:<id>` with a verbatim quote, or `choice:<id>` with no quote |
| `reading` | The rule table's full reading (limits, clarifications, caveats) |
| `split` | Which parts were ticked and shown |
| `versions` | The reader and recognition versions used |

`candidate_choice` and `choice:` are **output data only**: the validator and evidence are unchanged (F3).

**Pure:** the imports are fixed by a test. The module never touches the database, the network, `process.env`, flags, the clock, randomness, models or `server-only`. Output is identical on repeated calls with frozen input.

## 3. The decision table

The verdict is **the approved rule table, `readStructuredAnswer`, unchanged**. The module only builds its input and applies its reading:

| Step | Rule (design reference) |
|---|---|
| Fail closed | The finding is returned unchanged with a reason: a counting free-text answer (§6.2); not ACTIVE; not formVersion 2; another question; a combination the database or form can't produce; a missing or broken role; an evidence id that isn't `experience:<id>` (F1); a description without readings; readings of other text; another reader or recognition version; recognition of another split; parts on an unsplit requirement |
| Text shows the work | Decided here (§5), never from a supplied flag |
| Rule-table input | Choice, also-did-some, frequency, recency, role and consistency; for an approved split, the compound parts (F-3; F-2 keeps `contradicted` false) |
| Applying (§3.5) | Supported is never lowered. Supported needs the rule table's Supported **and** a verbatim quote of the person's own words; without one it's Possible (`candidate_choice`). Possible raises only Not enough information. Not enough information changes nothing. A gap stays, except F-6 |
| NOT_DONE | Acts as today's denial: a non-Supported, non-gap finding becomes Not supported (`candidate_denied`). Supported and gaps stand |
| F-6, claimed months | Only for an `employment_dates` gap, only PERFORMED or PART, claimed months ≥ what's asked, and only when the rule table allows at least Possible (role dates, recency, contradictions). It gives Possible as a claim (`candidate_choice`), never dates. It never raises anything else |

## 4. Ownership and splits

| Item | How |
|---|---|
| Ownership ceilings | The rule table's. Exhaustively checked: when the requirement isn't that kind of work, SUPERVISED and REQUESTED give nothing; ASSISTED, TAUGHT, PART and OBSERVED_TRAINED raise to Possible at most; OBSERVED_TRAINED gives nothing on an experience, level or time requirement |
| Frequency, level, time and recency | Never Supported past them (FEW_TIMES/ONCE; level and time requirements; an older answer against a recency window); a role whose dates contradict the recency gives nothing |
| Linking | `approvedSplitFor`, exact wording only. P1/P8 and P13/P14 resolve to their own splits, and parts saved for one never count for the other |
| Stored parts | Must be the approved parts: same count, index and wording, no duplicates. Anything else counts as **no part ticked** (design §5): Not enough information |
| Credit | A part counts only when ticked **and** shown by recognition. Supported needs every part ticked and every ticked part shown (F-3, O3). One part unticked, or one ticked part not shown, gives Possible at most and names the missing parts |
| Grouped question with a split (F-7) | No parts: Not enough information |
| Unsplit requirement | Never takes parts (refused) |
| Whole transfer | The reviewed simulation's signal: the tick gives nothing |

## 5. The consistency gap (F0)

"Did it myself" plus a description of other work ("I pick up parts for the plumbers who install water heaters") is *consistent*. Consistency now **never establishes the work by itself**. The module ignores any `textShowsWork` the caller supplies and decides it from:
- **a whole requirement:** the reading of **this requirement** (`readAnswer` Supported) **with a verbatim quote**;
- **an approved split:** **recognition** of every ticked part.

Regression tests:
- the plumbing split: consistent, no part shown, Possible;
- a whole requirement: not Supported;
- a supplied `textShowsWork: true` overruled by the requirement reading;
- a supplied `textShowsWork: true` overruled by recognition;
- a control: real work gets Supported, quoted.

Across the 62,150 combinations, no consistent explanation without a Supported, verbatim reading reaches Supported. The consistency reader itself is unchanged.

## 6. Tests

| Group | Tests |
|---|---|
| Fidelity: the 284 parity rows (the owner-reviewed V5 simulation, incl. 47 V5 probes and 11 controls) read through the module with the real readers | 284 (each: parts shown, the reading, the applied verdict, a verbatim quote) |
| Exhaustive decision table: 10 requirement kinds × 5 prior findings × every valid choice, frequency, recency and also-did-some × 18 explanations | 62,150 combinations in 14 invariant tests: the reading equals the rule table's; Supported only with a verbatim own quote; a choice alone ≤ Possible; the consistency gap; never lowered; raise rules; gaps stay; ceilings; limits; contradictions; denials; role dates |
| The 33 splits, each: all shown → Supported; one unticked → Possible; one not shown → Possible; an unticked shown part gives no credit; none ticked; grouped; edited wording; duplicate index; other split or text refused | 297 |
| Splits, other: all 33 linked exactly, P1/P8 and P13/P14, unsplit with parts, whole transfer, lead choices on a split | 5 |
| Claimed months (F-6) | 3 |
| Precedence, status, malformed input | 33 |
| Versions: v22 readings refused by default, accepted only with `expect: { readerVersion: "v22" }`; other recognition versions refused | 5 |
| Determinism, purity, not connected | 4 |

## 7. Existing matching is unchanged

| Gate | Result |
|---|---|
| Files | No change since F1 to the reader, recognition, the rule table, consistency, answer review, `analysis.ts`, the validator, config, components or pages. No schema or migration change |
| Not connected | No file in `src` imports the module (two guards) |
| Engine basis (2,121 rows), follow-up sets (340 rows) | Engine **byte-identical** to F1; follow-up: **0 of 340** rows differ on any field (only the timing field `latency`); all five runs exit 0 |
| Unit | **3,701** pass (650 new) |
| Integration | **201** pass |
| TypeScript, `prisma validate` | Clean |
| Lint | 1 existing warning, unchanged |
| Sealed guard / parts validate | 11 of 11 / pass |
| Parity and recognition isolation | 343 pass |

## 8. Design questions and deviations (for approval before F4)

1. **F-5, the title-only rule, isn't in F2.** It lowers a title-based Supported, and needs the whole evidence request (`restsOnTitle`). It belongs to F4's composition with `applyAnswers`. F2 never lowers a Supported, which is the stricter rule this approval states. **Decide in F4** whether F-5 applies to structured descriptions, as approved, or is dropped for "never lower".
2. **F-4b (exact per-part quotes) isn't done:** it would change `splits-v1.1`. For a split, the quote is the design's fallback: the description's first own statement, verbatim. It is quoted only for a consistent explanation.
3. **Lead choices on an approved split get Not enough information.** The form asks part ticks only for "did it myself" or "did some of it", so SUPERVISED, ASSISTED, TAUGHT and OBSERVED_TRAINED on a split have no ticks, and the compound rule fails closed. Without the split, ASSISTED, TAUGHT and OBSERVED_TRAINED could reach Possible. This is conservative and literal. **Confirm or change before F4.**
4. **Whole transfer** (`transferAll`) is a mismatch, as in the reviewed simulation and the parity fixture. The design text doesn't mention it. It only lowers.
5. **Possible with words** cites the person's words only when the explanation is consistent. Unread (D3) or mismatched text cites the choice, so nothing claims the text was understood or agreed.

## 9. Remaining risks and readiness for F3

- **Under the default reader, a dispatched-work answer ("My boss sends me out to install…") gives nothing.** It's a mismatch, until rules-v22 is adopted; tested both ways.
- **The quality of "shows the work" is the reader's and recognition's.** Stage G is the independent check.
- **`candidate_choice` and `choice:` don't exist in the validator yet (F3).** F4 must not wire a `candidate_choice` result before F3.

F2 is ready for approval:
- every gate passes;
- the module is pure and unconnected;
- existing matching is unchanged.

F3 hasn't started.
