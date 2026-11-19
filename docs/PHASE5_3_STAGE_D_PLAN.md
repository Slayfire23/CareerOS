# Phase 5.3 Stage D: findings and plan for the A77 collections dependency

November 14, 2026. **Read-only investigation; nothing implemented.** The baseline is `8b7a7f7` (rules-v21 default, with D2). No sealed split was opened.

## Recommendation

**GO for a narrowly scoped Stage D.1:** an **inactive** split-recognition module, ported from the owner-reviewed V5 simulation and gated on exact parity with it. It includes the A77 consumer of `bounded`.

**NO-GO for:**
- an A77-only special case;
- wiring or activating the module;
- changing the reader to fix A58 within Stage D.1 (it's a separate, optional item; §6).

## 1. Why A77 remains unresolved

A77 isn't unresolved because of a bug in an existing component. **The component that would resolve it doesn't exist yet.**

| Component | State at `8b7a7f7` | Role for A77 |
|---|---|---|
| Reader (`answerStatements`, rules-v21) | Done. The person's statement keeps "…call those customers until they pay" in `text`. `readable` drops "until they pay" (SIDE_CLAUSE). `bounded` keeps it | Evidence: **complete** |
| Approved recognition data (markers and equivalents for 33 splits / 66 parts) | Owner-approved (R1 batches 1–4, P13/P14, Q1–Q5) and committed only as report data (`ai-service/evals/reports/m11/structured/v5-simulation.json`, `patterns`). Not in `src` | The A77 collections equivalent `…customers…until they pay` |
| Attribution algorithm (match parts to the person's own clauses; cancel for others' work and corrections; Q4 elided objects; A22 context; named tool; the failure-3 `bounded` consumer) | **Scratch only:** the session's V5 harness. Not in the repository | **Missing:** nothing computes per-part evidence |
| Rule table (`readStructuredAnswer`) | Done. Accepts `compound.parts[].{checked, textShowsWork, contradicted}` as **input** | Consumes per-part results; nothing produces them |
| Consistency (`assessConsistency`) | Done; not connected to the app | Whole-requirement consistency only |
| App workflow (questionnaire, persistence) | Stages E–F; not started. `ClarificationPart` schema is local only | Would carry ticks and parts |

**The A77 trace** ("I run the AR aging analysis, identify the overdue balances and call those customers until they pay"):

| Stage | Result |
|---|---|
| Extraction (clause splitting) | Correct: one own statement |
| Ownership | Correct: `performed`, subject self |
| Evidence | Correct: `bounded` = "…call those customers until they pay" |
| Recognition | **Absent** in `src`. In simulation it passes only with the consumer modeled (46 of 47) |
| Evaluation | `readStructuredAnswer` would apply O3 correctly if handed `textShowsWork: true` for both parts. Nothing hands it anything |

**Where the gap is:** not extraction, collection handling or evidence evaluation. It's the **recognition layer** that sits between them, and that layer is Stage D itself.

## 2. Proposed patch scope (Stage D.1, inactive)

### 2.1 New, inactive: `src/lib/ai/rules/split-recognition.ts`

A pure function, with no I/O, no model and no callers in the app:

```
recognizeParts(input: { splitId; explanation; textRules? }):
  { parts: { part; shown; contradicted; reasons[] }[]; transferAll: boolean; version: "splits-v1" }
```

- **Data:** the 33 approved splits' parts, markers and equivalents, plus the configured Q4 `elide`, A22 `context` and A53/A60 `tool`/`toolctx`. They are copied verbatim from `v5-simulation.json` into `src/lib/ai/rules/data/approved_splits.json`, with a provenance header naming the approval records. Nothing in this file is new or revised.
- **Algorithm:** a verbatim port of the reviewed V5 prototype:
  - own-clause selection;
  - subject-change and relative-clause cuts;
  - instrument and send-to removal;
  - the review-verb rule;
  - cancellation for others' work and for corrections;
  - Q4, A22 and the named-tool rules.

  Simplifications against the v21 reader (which already strips much of the same) are **deferred** to a later, measured step, so the port can be checked for exact parity.
- **The A77 consumer** (Stage B report §7.3; owner-approved specification):
  1. The A77 collections equivalent is matched against `bounded` only when it doesn't already match `readable`. It is never matched against `text`.
  2. When the matched object is "those/these customers", "them" or similar, the person's own earlier words must name overdue, unpaid or outstanding receivables. That is the approved `bound_antecedent` setting, limited to this equivalent: overdue, past-due, outstanding, unpaid, delinquent, owed, late. They must not also name another group.
  3. Ownership and correction metadata are checked independently of `bounded`: own `performed` statements only, never `exposureOnly` unless `narrowed`; others' work and corrections cancel the part.
- **Guards:**
  - Non-English explanations aren't read (D3).
  - Refused or directed text isn't read.
  - Without `bounded` (any reader other than v21), the consumer finds nothing. That direction is safe.

### 2.2 Not in scope

- No caller.
- No change to `answerStatements`, `readAnswer`, the engine, follow-ups, the save check or `RULES_VERSION`.
- No migration.
- No split activation.
- No questionnaire (Stage E) or persistence (Stage F).
- No A58 reader change (§6).
- No simplification of the ported heuristics.

### 2.3 Why an A77-only fix isn't the smallest *safe* change

The consumer needs the module's own-clause selection, its cancellation for others' work and corrections, and the other part's (aging analysis) markers. All of those are the generic module.

A special case would:
- duplicate that logic;
- couldn't be checked against the owner-reviewed simulation as a whole;
- would leave the other 32 splits for a second, divergent implementation.

The data-driven port is smaller *in risk*, even though it's more lines.

## 3. Other cases that could be affected

| Scope | Finding |
|---|---|
| Phrases that name an end condition | **Only one** in all 33 splits / 66 parts: A77 collections. The `bounded` consumer can't affect any other part |
| `bounded` in opened data (2,204 texts: 1,266 answers, 320 replies, 392 probes, 226 design rows) | 6 statements carry it; **none** newly matches the A77 phrase through it. "…call customers about past-due balances until they pay" already matches through `readable` |
| New A77 controls from opened data | fw-119 / pc-219 "stay on them until they agree to pay" (insurance claim) must **not** count as collections; fw-070 / pc-170 "until they can run it alone"; fw-016 reply "until they come down" |
| The app today | **None.** The module has no caller; the engine and follow-ups can't change |
| Later wiring (Stages E–F) | Every approved split's per-part reading. That is the scope of the Stage G sealed evaluation, `m11_parts` (312 scenarios) |

## 4. Test plan and gates (to be met before the module is called complete)

### 4.1 Permanent tests (`tests/split-recognition.test.ts`)

1. **Parity:** every one of the 273 V5 rows, plus the 11 failure-3 controls, gives exactly the simulation's `parts` and `transferAll`. That covers 198 design probes, 28 opened answers and 47 targeted probes. The expected outputs are frozen as a fixture generated from the scratch run and committed with provenance. **Any difference fails the gate.**
2. **A77 positive:**
   - the failure-3 sentence;
   - "I call past-due customers until they pay";
   - "I pull the list of unpaid invoices every Friday and call those customers until they pay".
3. **A77 negative:**
   - another person calls ("Our AR clerk… calls those customers until they pay"; "…our collector calls…");
   - unrelated calls ("…until they confirm their delivery dates"; "I schedule the deliveries and call those customers until they confirm a time");
   - no antecedent ("I call those customers until they pay");
   - an ambiguous antecedent ("I sort the new accounts and the overdue balances, and call those customers until they pay");
   - a correction ("…Actually, our collections agency makes the calls, I only send the statements");
   - a pronoun with a non-overdue antecedent ("I welcome new customers and call them until they pay");
   - **new:** "…stay on them until they agree to pay" (insurance), and "until they can run it alone".
4. **Never raw text:** with a statement whose `text` contains the phrase but whose `bounded` doesn't (another person's clause), the part isn't shown.
5. **Safety gates on all rows:**
   - no correction, only-one-part or supervise row is shown in full or reaches Supported through `readStructuredAnswer`;
   - no row where both parts are genuine is lowered against the simulation;
   - V5 stays at 46 of 47; failure 4 is kept as history.
6. **Guards:**
   - non-English → nothing read;
   - directed or injection text → nothing read;
   - P1's evaluator remarks → nothing read;
   - v20 reader → the consumer finds nothing.
7. **Isolation:** nothing in `src/app`, `src/lib/ai/analysis.ts` or the workflows imports `split-recognition` (the same pattern as the consistency module).

### 4.2 Gates on the unchanged app

| Gate | Requirement |
|---|---|
| Opened comparison (1,266 / 392 / 320) | Unchanged at `8b7a7f7` |
| Engine basis | Rows identical (label `rules-v21`) |
| Follow-up sets | 340 rows identical to `8b7a7f7` |
| Suites | Unit and integration pass; TypeScript, lint, schema, sealed guard and parts validate clean |
| Sealed splits | Unopened; `m11_parts` is reserved for Stage G |

## 5. Feature flag or version behaviour

- **Stage D.1 needs no runtime flag.** The module is inactive by construction: it has no caller, and an isolation test enforces that, as with `structured-consistency.ts` before it.
- It carries its own `version: "splits-v1"`, so later readings record which recognition data produced them.
- It depends on the rules-v21 reader for `bounded`. It reads with the default (v21) and degrades safely (no extra recognition) under any other reader.
- **A runtime flag belongs to the wiring stage (E–F):** for example, `STRUCTURED_SPLITS_ENABLED`, off by default and refused on Vercel like the earlier workflow flags. It stays off until Stage G passes.

## 6. Dependencies and reader limitations

| Item | Effect on Stage D | Proposal |
|---|---|---|
| **A58** ("I run the plumbing company and send plumbers out to install and repair systems") | The sent work is removed from `readable` but is **not** in `othersParts`. So neither F6 nor a per-part contradiction sees it, and a tick still gives Possible. That's down from a false Supported under v20 | **Separate, optional item; not in D.1.** The preferred fix keeps the reader unchanged: Stage D computes sent work itself (an exported `sentWork(detail)` helper from the same SEND_TO pattern) and marks matching parts `contradicted`. Changing `othersParts` instead would also change `readAnswer`'s view of others' work, which is a reader change needing its own regression |
| A60 stray statement "Actually" (unclear subject) | Says nothing and matches no marker. No effect | None |
| A58 readable ends in "and" | No marker effect | None |
| A87 "tune-ups"/"up" tokenization | A87 is unsplit. No effect on D.1 | Equivalence track |
| A78 vocabulary | Unsplit. No effect | Equivalence track |
| P13 failure 4 | The simulation keeps Hiring at Not enough information (owner decision); the parity gate keeps it | Kept as history |
| Label quality of `m11_parts` (46% agreement, 55 unsure) | Affects the Stage G reading, not D.1 | Stage G policy proposal |
| The follow-up guard after a denial (Stage C §4) | Not a recognition item | Separate |

## 7. Risks

| Risk | Mitigation |
|---|---|
| The port drifts from the reviewed simulation | Exact-parity fixture on 284 rows; any difference blocks |
| The ported heuristics overlap the v21 reader (double removal) | Ported verbatim for parity; simplification only later, measured |
| Recognition patterns overfit the author's probes (the 198 design probes share the author's bias) | The independent sealed `m11_parts` evaluation at Stage G is the real test; no tuning against it |
| The `bounded` consumer widens collections credit | The phrase is unchanged and only applies to `bounded` (never `text`); an own, unambiguous antecedent is required for demonstratives; 13 negative controls |
| Someone wires the module early | Isolation test; no flag exists until E–F |
| The A58 Possible persists in structured readings | Known residual; optional fix in §6 with its own approval |

## 8. Proposed sequence (each step stops for approval)

1. **D.1:** the inactive module, the data file and the tests above. Commit locally.
2. **D.2 (optional):** the A58 sent-work contradiction inside the module (no reader change).
3. **D.3 (later, measured):** simplify ported heuristics that the v21 reader already covers, keeping parity or reporting every change.

Then Stage E (questionnaire) and F (wiring, flag off), then G (freeze and the sealed evaluation).
