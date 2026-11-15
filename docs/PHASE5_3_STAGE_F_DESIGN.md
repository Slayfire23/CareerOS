# Phase 5.3 Stage F: structured answers in matching: design and decision report

November 14, 2026. **Read-only review. Nothing implemented, migrated or committed.**

The baseline is `c4ebce9`:
- rules-v21 is the default;
- `splits-v1.1` is inactive;
- the Stage E form is behind its flag;
- no sealed split was opened.

**Labels used throughout:**

| Label | Meaning |
|---|---|
| **[A]** | Already approved |
| **[V]** | Verified in the code |
| **[P]** | Proposed; needs approval (§10) |
| **[R]** | Unresolved risk |

## 1. Current architecture and verified findings

### 1.1 The matching path today [V]

| Step | Where | Behaviour |
|---|---|---|
| Answers read | `analysis.ts` `activeAnswers` | `formVersion: 1` only: active `ROLE_DETAIL_ADDED` (with a role) and, with the review on, `DENIED`. A structured answer gives nothing (fail-closed since Stage 1) |
| Answers applied | `answer-review.ts` `applyAnswers` | Per finding, by question key. A **rules Supported is never lowered**; the only exception is the Stage 1c title-only rule (`titleContradicted`). A denial makes a non-Supported finding **Not supported** (`candidate_denied`). Otherwise `readAnswer` raises Not enough → Possible, or anything below → Supported, with a verbatim citation (`candidate_answer`). `gap` stays, except `employment_dates` with a confirm (`claimsMoreTime`, Possible at most) |
| Evidence | `evidence.ts` `buildEvidence` | Every active `ROLE_DETAIL_ADDED` **with a description** becomes evidence `experience:<answerId>`, `source: "clarification"`. **This has no formVersion filter, so Stage E descriptions are already in it** |
| Rules and AI | `evidence-boundary.ts` | `evidenceForRules` and `evidenceForAi` remove answer evidence. It's a citation target only, which is why Stage E changed no verdict |
| Validator | `match-validation.ts` | Supported or Possible **needs a verbatim citation** ("verdict without evidence"). `candidate_answer` must cite an answer's own words |
| Revocation | `analysis.ts` `maskRevoked` | Masks findings citing a non-active answer's **stored `evidenceId`**. **Stage E structured rows have `evidenceId = null`** |
| Deletion | `answer-deletion.ts` `scrubAnalyses` | Scrubs by `experience:<id>` and by quoted words. That would already cover structured citations; `ClarificationPart` goes by cascade |
| Staleness | `evidence.ts` `evidenceFingerprint` | A hash of evidence plus answer keys. **With the Stage E flag on, saving a structured description already marks an analysis "out of date"**, because its description enters the evidence. Display only; a Stage E side effect |

### 1.2 The rule table [A][V]

`structured-answer.ts` `readStructuredAnswer` already encodes:
- the Stage 4A rules and D1–D3;
- O1–O3;
- F6 contradiction (whole and per part);
- level, time and recency caps;
- role-date conflicts;
- O3 lowest part.

Nothing in the app calls it (a guard test enforces that). **Stage F should supply its inputs, not add rules.**

## 2. The ownership-reader bug ("My boss sends me out to…")

### 2.1 Root cause [V]

`splitBySubject` assigns a clause to its **grammatical subject**. In "My boss sends me out to install water heaters", the subject is "My boss", so the clause is "other". No rule recognises **"someone sends / has / assigns me (out) to do X"** as the person's own act; the person is only the object.

Three effects:
1. No own statement, so `readAnswer` gives Not enough information.
2. The clause enters `othersParts`, so recognition (V4 cancellation) marks the parts **`transferred`**.
3. Consistency finds no own statement but others' text, so it gives a **text_mismatch**. The Stage E form then says "Your description says someone else did this work".

Traced variants:

| Wording | Today | Correct reading |
|---|---|---|
| "My boss sends me out to install water heaters and fix leaks" | others; both parts transferred; mismatch | **own work** |
| "The company sends me to…", "Dispatch sends me out to…", "My supervisor has me install…" | the same | **own work** |
| "I get sent out to…", "I'm sent out to…" | no statement at all (lost, not misattributed) | own work |
| "I am assigned to install…" | own, performed (F8 already handles it) | own work |
| "…sends me out to **help** the plumbers install", "…to **watch**…", "…to **pick up parts for** the plumbers who…", "…sent me to **a class on** installing…", "…**never** sends me…", "…**wants to** send me…" | others | **not** credit: helping, watching, other work, training, a negation, an intention |
| "My boss sends **the plumbers** out to…" | others | others' work (correct) |

### 2.2 Real-data surface [V]

Of 1,976 unique opened texts, 19 match "verb + me …" or a passive "sent/assigned". **None is genuine "sends me out to do X" work.** They are:
- templates and injections: "told me to put…", "told me to tell you…";
- things received: "sends me what she finds";
- refusals: "doesn't let me touch…";
- requests: "asks me things".

Those are exactly the false-positive risk.

### 2.3 Smallest safe correction [P] (decision **F-1**)

A narrow "directed at the person" rule, applied before the subject split, **only** when all of these hold:
- **the verb** is send, dispatch, assign, schedule or put, followed by **me** (out) **to** + a verb; or have/had + me + a bare verb. **tell, ask, let, make, want, expect, need are excluded**;
- **there is no negation or modality** on the directing verb (never, not, won't, would, could, wants to, going to, if);
- **what follows "to" is a verb**, not a noun ("to a class", "sends me what…").

When they hold, the clause is read as **the person's own clause** ("I install water heaters…"). That is like the F8 "assigned to" rewrite: every existing rule then applies, so "help…" reads as assisted, "watch…" as observed, "pick up parts for the plumbers who install" keeps only the person's part, and "supervise…" reads as overseeing. The directing clause is **not** added to `othersParts`.

"me and two techs" becomes a "we" clause (team, not sole).

| Item | Detail |
|---|---|
| Affected patterns | Every reader consumer (`answerStatements`, `othersParts`, `othersText`, consistency, recognition), so every split whose work is dispatched field work: A58, A20, A51, A57, A67, A76, P3, P12, A63, and P13 ("HR has me screen applicants") |
| D.2 interaction | No conflict: D.2's delegation needs a worker object and excludes "me" |
| Placement | The reader has been the default since Stage C, so this changes default matching. **Proposal: a rules-v22 opt-in** (`textRules: "v22"` = v21 + this rule, `src/lib/ai/evidence-boundary.ts` and `src/lib/clauses.ts`), compared and adopted like v21 (the Stage B/C process). Alternative: an in-place v21 patch with a `RULES_VERSION` bump. Either way, it is not part of rules-v21 now |
| False-positive risk [R] | Being sent is not always doing it ("…and the installer does it while I hold the light"): later own clauses still apply. Passive "I'm sent to" is safe. The excluded verbs carry the real-data risk (§2.2) |
| Fail-closed alternative | Without the fix, Stage F stays safe: the mismatch keeps the answer at **Not enough information** and asks; the person can rephrase. It loses legitimate credit and shows a misleading message |

Regression tests:
- the 17 variants above, with positive and negative controls;
- all 19 opened-data hits unchanged;
- the opened comparison (1,266 answers, 392 probes, 320 replies, 226 design rows) with an expected 0 changes;
- V5 and the 284 parity rows unchanged;
- the D.2 delegation controls unchanged;
- the engine and the 340 follow-up rows;
- a new constructed probe set for dispatched field work, written before the code.

## 3. Structured-answer evaluation design [P]

A new pure module, `src/lib/ai/rules/structured-matching.ts`, sits beside `answer-review.ts`. Nothing changes in the rule table, the reader or recognition.

1. **Input per active formVersion 2 answer:**
   - the involvement, `alsoDidSome`, frequency, recency and `claimedMonths`;
   - the description;
   - the role (from `experienceId`), as months and months-since-end at `as_of_month`;
   - the stored parts, and the question key plus covered keys.
2. **Consistency:** `assessConsistency` (rules-v21) on the description, giving no_text, text_unread, consistent or text_mismatch (with F6 `contradictedBy`).
3. **Compound** (only for a requirement that `approvedSplitFor` links **and** an answer that isn't grouped):
   - each part's `checked` comes from `ClarificationPart`;
   - each part's `textShowsWork` comes from `recognizeParts(...).parts[i].shown`;
   - the whole `textShowsWork` is **every ticked part shown**: DD1 / X2 held, exactly as the reviewed simulation and the 284-row parity fixture compute it (decision **F-3**);
   - `contradicted` is `transferred && checked` **only if F-2 is approved**, otherwise false.
4. **Reading:** `readStructuredAnswer` gives the verdict, the limits and the clarifications.
5. **Applying (the same contract as free-text answers):**
   - a rules **Supported is never lowered**, except the approved Stage 1c title-only rule (F-5);
   - a structured Supported raises Not enough or Possible;
   - a structured Possible raises only Not enough;
   - Not enough changes nothing;
   - **NOT_DONE acts as today's denial**: a non-Supported finding becomes Not supported (`candidate_denied`), following 4A §4 "as today's denial";
   - a `gap` stays, except `employment_dates`, where `claimedMonths` ≥ required → Possible, the 4A claim rule reusing `claimsMoreTime` (F-6).

### 3.1 Citations and evidence (decision **F-4**)

- **Supported or Possible with a description:** cite the person's own words, `experience:<answerId>`, with basis `candidate_answer`. The quote is the own statement that showed the work (needs F-4b).
- **Possible from the choice alone** (D1, no description) has nothing verbatim to cite today. Proposal:
  - a new basis `candidate_choice`;
  - an evidence item `choice:<answerId>` whose text is CareerOS's fixed wording of the choice, never the person's words ("Self-reported: I did this work myself, weekly, part of my job now");
  - a validator rule: `candidate_choice` ≤ Possible, must cite its `choice:` item, and is excluded from the rules and AI like answers.
- **F-4b:** to quote the exact clause that showed a part, `recognizeParts` would return the statement index per shown part. That is a behaviour-identical addition (splits-v1.2; parity unchanged). Without it, quote the description's first own statement (verbatim, ≤ 300 characters).

## 4. The decision table [A] (rule table) + [P] (application)

Requirement R and its finding F before answers. "Raises" means only from a lower verdict, per §3 step 5.

| Choice | Conditions | Reading | Effect on F |
|---|---|---|---|
| **NOT_DONE** | — | gap | F Supported: unchanged. Otherwise **Not supported** (`candidate_denied`) |
| **PERFORMED** | role dates contradict the recency | Not enough + question | none |
| | text_mismatch with F6 (`contradictedBy`) | Not enough + question | none |
| | text_mismatch, other | ≤ Possible (the lower of choice and text) + question | raises Not enough → Possible |
| | text_unread (D3) | ≤ Possible + caveat | raises Not enough → Possible |
| | no_text | Possible + "needs specific text" | raises Not enough → Possible (`candidate_choice`, F-4) |
| | consistent, text doesn't show the work | Possible | raises Not enough → Possible |
| | consistent, shows the work, frequency FEW_TIMES or ONCE | Possible ("limited frequency") | raises Not enough → Possible |
| | consistent, shows, regular frequency, R asks a level or time | Possible (caveat) | raises Not enough → Possible |
| | consistent, shows, regular, the recency window not met or unclear | Possible + question | raises Not enough → Possible |
| | consistent, shows, regular, no caps | **Supported** | raises to **Supported** (`candidate_answer`, cites the words) |
| **PART** (incl. lead + "also did some") | — | Possible at most ("part only") | raises Not enough → Possible |
| **SUPERVISED / REQUESTED / ASSISTED / TAUGHT** | R asks for that kind of work (supervision / coordination / assisting / training) | as PERFORMED | as PERFORMED |
| **SUPERVISED** | otherwise | Not enough | none |
| **REQUESTED** (O2) | otherwise | Not enough | none |
| **ASSISTED** | otherwise | Possible at most | raises Not enough → Possible |
| **TAUGHT** (O1) | otherwise | Possible at most | raises Not enough → Possible |
| **OBSERVED_TRAINED** | R asks experience, level or time | Not enough | none |
| | otherwise (a skill or tool) | Possible at most | raises Not enough → Possible |
| any lead choice, "also did some" unanswered | — | + "ask_also_did_some" | as its row |
| **Compound** (approved split, O3) | no part ticked, or all ticked parts F6-contradicted | Not enough | none |
| | some parts ticked | Possible at most + "missing parts" | raises Not enough → Possible |
| | all ticked; any ticked part not shown | Possible | raises Not enough → Possible |
| | all ticked and all shown, plus the PERFORMED conditions | **Supported** | raises to Supported |

**Answer status:**

| Status | Effect |
|---|---|
| Revoked | Ignored, and stored findings citing it are masked (needs `evidenceId`, §7) |
| Permanently deleted | Gone, and scrubbed (existing) |
| Superseded | Ignored |
| Unknown enum, broken stored combination, or missing role | **Ignored (fail closed)**, logged as an event |

"Unsupported" in this table means only Not supported (`gap`) from NOT_DONE. **No choice, tick or reply produces Supported without the person's own words showing the work (and, for a split, every ticked part).**

## 5. Split-requirement aggregation [A] (DD2, O3) + [P]

| Item | Rule |
|---|---|
| Linking | `approvedSplitFor` exact wording only (E1), so P1/P8 and P13/P14 stay apart; the 76 unsplit requirements and single-part requirements never get parts |
| Checked parts | A part counts only when ticked **and** shown by the person's own clause (recognition, D.2 delegation removed) |
| Unchecked parts | Possible at most, and the result names the missing part (O3) |
| Lowest part | Every necessary part must be ticked and shown for Supported (O3, X2 held) |
| One explanation, no double counting | One answer per question key (E2 + `retireCurrent`), and recognition runs once over that one description. A shown part counts once. A grouped answer (several requirements) is read per requirement with that requirement's own text, never sharing parts |
| Follow-up answers | Stage E's part questions are **corrections** of the same answer ("No, others did it" unticks; "Add to my description" re-saves). They're re-read like any answer, never added as separate evidence. Free-text follow-up replies (`applyFollowUps`) stay for formVersion 1 only |
| Stored parts don't match the current approved list (count or wording) | **Fail closed** [P]: read as an approved split with no part ticked, so Not enough plus a question |
| Grouped question that includes an approved split | The form showed no parts, so O3 gives that requirement Not enough (fail closed) **(F-7)** |

## 6. Evidence precedence and conflicts [P]

1. **Rules evidence first.** A Supported from the resume or profile is never lowered by a structured answer, of any choice. The only exception is the approved Stage 1c title-only rule, applied to the structured description as to free text (F-5).
2. **One answer per question.** If a formVersion 1 and a formVersion 2 answer are both active (impossible by construction, E2 + `retireCurrent`), the **formVersion 1 answer wins** and the structured one is ignored and logged.
3. **Denials:**
   - a free-text denial stays as it is;
   - a structured NOT_DONE is a denial when the Stage F flag is on;
   - `activeDenials` (masking) includes formVersion 2 **only when the flag is on**.
4. **Follow-up replies** attach to formVersion 1 answers only.
5. **Evidence IDs:**
   - Supported or Possible with words cites `experience:<answerId>`;
   - a choice alone cites `choice:<answerId>` (F-4);
   - **every structured row gets `evidenceId` set** on save (`experience:<id>`), so revocation masking works.
6. **Staleness:** with the Stage F flag on, structured answers enter the fingerprint as `structured:<key>:<involvement>`. With it off, structured descriptions are excluded from the fingerprint. That also removes the Stage E side effect (F-10).

## 7. Database migration and audit plan [P] (decision **F-8**; not created)

```sql
-- 2026111X010000_structured_matching_audit (local first; production only with separate approval, after the Stage 1 migration)
ALTER TABLE "JobMatchAnalysis"   ADD COLUMN "recognitionVersion" VARCHAR(20);  -- null: no structured answer applied
ALTER TABLE "ClarificationEvent" ADD COLUMN "recognitionVersion" VARCHAR(20);  -- null: not a structured reading
ALTER TABLE "JobMatchAnalysis"   ADD CONSTRAINT "JobMatchAnalysis_recognitionVersion_format"
  CHECK ("recognitionVersion" IS NULL OR "recognitionVersion" ~ '^splits-v[0-9]+(\.[0-9]+)*$');
ALTER TABLE "ClarificationEvent" ADD CONSTRAINT "ClarificationEvent_recognitionVersion_format"
  CHECK ("recognitionVersion" IS NULL OR "recognitionVersion" ~ '^splits-v[0-9]+(\.[0-9]+)*$');
-- Data: give existing structured answers the evidence id revocation masking needs (local rows only; none in production).
UPDATE "CandidateClarification" SET "evidenceId" = 'experience:' || "id"
  WHERE "formVersion" = 2 AND "outcome" = 'ROLE_DETAIL_ADDED' AND "evidenceId" IS NULL;
```

| Item | Plan |
|---|---|
| What's tracked | **Analyses:** `recognitionVersion` is set when any structured answer was applied, beside the existing `methodVersion` (rules version). **Events:** CONFIRMED / CORRECTED / *_RESULT for structured answers. **Findings:** per finding (JSON, no migration), `structured: { limits, clarifications }` for audit. **Answers:** none; readings are recomputed on read |
| Existing records | Null means "before Stage F, or no structured answer": correct as is. No backfill of versions |
| Recalculation | None. Old analyses keep their results; a re-run uses the current versions |
| Compatibility | Additive, nullable columns; old code ignores them. The `evidenceId` update is idempotent |
| Rollback | Code: turn the flag off (§8). Schema: drop the two columns and constraints. The `evidenceId` values are harmless to keep |
| RLS | Unchanged: the same tables, rows owned as now. No new table |
| Constraints | Only the format checks above. The Stage 1 structured CHECK is unchanged |

## 8. Feature flags and rollback [P] (decision **F-9**)

| Item | Plan |
|---|---|
| Flag | **`STRUCTURED_MATCHING_ENABLED`**: off by default |
| Dependencies | Needs `STRUCTURED_OWNERSHIP_FORM_ENABLED`, which needs `CLARIFICATION_REVIEW_ENABLED`. **Refused on Vercel**, as the follow-up and form flags are |
| Stage E flag | Unchanged: forms work with matching off, as today |
| Off | `activeAnswers` keeps `formVersion: 1` only, fingerprints exclude structured descriptions, and structured NOT_DONE isn't a denial. **Byte-identical to `c4ebce9`** |
| Local and test | The integration suite runs both flag states. Playwright gets a launch entry with all three flags, and a skip guard like the Stage E spec |
| Production | Not enabled. It needs the production migrations (Stage 1 + §7), a Stage G result, and explicit approval |
| Verifying "off = current" | Engine basis, the 340 follow-up rows, the opened comparison, and every integration test (with structured answers saved) run flag-off and must be identical to `c4ebce9`. Flag on with **no** structured answers must also be identical |
| Rollback | Turn the flag off. The next analysis ignores structured answers. **Stored findings that cite a structured answer (`experience:<id>` of a formVersion 2 row, or `choice:`) are masked while the flag is off** ("Run the analysis again"), extending `maskRevoked`, so nothing computed under Stage F lingers |

## 9. Test plan and acceptance gates

### 9.1 Tests to reuse [V]

- `ai-structured-answer.test.ts`: the rule table, exhaustive.
- `structured-form.test.ts`: the form, linking, and no Supported from ticks.
- `split-recognition.test.ts`: the 284 parity rows, A77, D.2.
- `ai-rules-v21.test.ts`, `ai-rules-v20.test.ts`.
- `structured-form.integration.ts`, `ai-review.integration.ts`.
- `e2e/job-structured-form.spec.ts`.
- `sealed-splits.test.ts`.
- The engine-basis and follow-up evaluations.

### 9.2 New tests [P]

| Area | Tests |
|---|---|
| Decision table | Every row of §4: each choice incl. TAUGHT, lead with "also did some" yes/no/unanswered, each frequency and recency, role-date conflicts, level/time/recency caps, text no_text / unread / consistent / mismatch / F6 |
| Splits | All 33: a full tick-and-show gives Supported; one part missing gives Possible; none ticked gives Not enough; F6 per part; stored parts mismatched fails closed; grouped answers; P1/P8 and P13/P14 separate; unsplit requirements never use parts |
| Transitions | Not enough → Possible / Supported; Possible → Supported; Supported unchanged (every choice); Not supported from NOT_DONE; gap `employment_dates` + `claimedMonths` |
| Reader (if F-1) | §2.3 positives and negatives; the 19 opened hits unchanged; the comparison sets |
| Precedence | Rules Supported never lowered; the Stage 1c title rule; formVersion 1 wins over 2; free-text denial vs structured; follow-up replies stay formVersion 1 only |
| Lifecycle | Revoke masks (evidenceId); delete scrubs (citations and parts); correct re-reads; supersede |
| Malformed | Unknown enum, a broken combination (bypassing the CHECK in a test DB), a missing role, unknown part indexes: all ignored (fail closed) and logged |
| Flags | Off = identical (all suites, engine, follow-ups, opened data); on with no structured answers = identical; Vercel refused; rollback masking |
| Audit | `recognitionVersion` set only when applied; event versions; null for old rows; the migration applies and rolls back locally |
| Citations | `candidate_answer` quotes are verbatim; `candidate_choice` ≤ Possible and only cites its `choice:` item; the validator rejects anything else |
| Browser | Saving a structured answer changes the shown verdict as the table says, labelled Self-reported; revoke reverts; flag off reverts with "run again" |
| Guards | "Nothing calls `readStructuredAnswer`" becomes "only `structured-matching.ts` calls it"; matching never reaches recognition except through it |

### 9.3 Acceptance gates

- **0 Supported** without the person's own words showing the work (and every ticked part).
- **0 changes with the flag off**, including the engine, the 340 follow-up rows and the opened data.
- **0 rules Supported lowered**, except the Stage 1c rule.
- Every decision-table row is covered by a test.
- All 33 splits are covered.
- Revocation, deletion and rollback leave nothing citing a structured answer.
- Unit, integration, Playwright, TypeScript, lint, schema, sealed guard, parts validate and parity all pass.

**Stage G** (the sealed `m11_structured` and `m11_parts`) stays the independent check; it isn't opened in Stage F.

## 10. Open questions for approval

| # | Decision | Recommendation |
|---|---|---|
| **F-1** | The "sends me" reader fix: (a) rules-v22 opt-in with the narrow rule (§2.3), compared and adopted like v21; (b) an in-place v21 patch plus a version bump; (c) no fix: fail closed (Not enough + question) | **(a)**. Implement and compare before Stage F wiring, and adopt only on a clean comparison |
| **F-2** | Map `transferred` (ticked parts) to the rule table's `contradicted` | **Only after F-1 is adopted.** Until then, `contradicted` stays false; transferred parts are just not shown (Possible + question) |
| **F-3** | Compound `textShowsWork` = every ticked part shown (DD1 / X2 held, as the simulation) | Yes |
| **F-4** | Citing a choice-only Possible: the new basis `candidate_choice` with a `choice:` evidence item (CareerOS wording, ≤ Possible) | Yes; the alternative (requiring a description) would undo D1 |
| **F-4b** | `recognizeParts` returns which own statement showed each part (behaviour-identical, splits-v1.2) for exact quotes | Yes |
| **F-5** | The Stage 1c title-only rule applies to structured descriptions (4A §4 names it as the one exception) | Yes |
| **F-6** | `claimedMonths` on `employment_dates` gaps: Possible at most, via the existing claim rule (4A §2) | Yes |
| **F-7** | A grouped question that includes an approved split: fail closed (Not enough + question) | Yes |
| **F-8** | The audit migration (§7) and the `evidenceId` backfill, local only | Yes |
| **F-9** | `STRUCTURED_MATCHING_ENABLED` (dependencies, Vercel refusal) and rollback masking | Yes |
| **F-10** | Fingerprints: structured answers count only with the flag on (also fixes the Stage E staleness side effect) | Yes |

### Unresolved risks [R]

- **R-a:** the F6 contradiction check is narrow ("Our plumbers do all of the installs and repairs; I book the appointments" isn't a contradiction). Those parts end up not shown, so Possible + question; never Supported.
- **R-b:** the reader-limitation backlog stays open (causative in the same statement, greedy send-to, "I run the crew…, and I repair…"). These under-credit; they never over-credit.
- **R-c:** parity proves fidelity to author-written probes. Stage G is the independent test, with the evaluation-quality policy (46% writer–labeler agreement, 55 unsure labels) still to be decided.
- **R-d:** production still lacks the Stage 1 migration, so Stage F cannot reach production without separate approval.

## 11. Recommended implementation order

Each step is small, testable on its own, and stops for approval.

| Step | Content | Files | Gate |
|---|---|---|---|
| **F0** | (If F-1a) rules-v22 opt-in "directed at the person" + tests; then the comparison and adoption decision | `evidence-boundary.ts`, `clauses.ts`, `tests/ai-rules-v22.test.ts` | Stage B-style comparison: 0 new false Supported, 0 labelled losses, 19 hits unchanged, parity, V5 |
| **F1** | The audit migration (local) and `evidenceId` on structured saves + backfill; no behaviour change | `prisma/schema.prisma`, the migration, `clarification-review.ts` | Migrate and roll back locally; all suites identical |
| **F2** | The pure `structured-matching.ts`: building rule-table input (consistency, role, compound, fail-closed rules) and the raise-only application with citations. **Not wired** | `src/lib/ai/rules/structured-matching.ts` (+ F-4b in `split-recognition.ts`) | Decision-table and 33-split tests; parity unchanged |
| **F3** | The validator and evidence for `candidate_choice` (F-4) | `match-validation.ts`, `evidence.ts`, `evidence-boundary.ts` | Validator tests; flag off identical |
| **F4** | Wiring behind `STRUCTURED_MATCHING_ENABLED`: `activeAnswers`, `applyAnswers` composition, denials, masking, fingerprint, `recognitionVersion` | `config.ts`, `analysis.ts`, `answer-review.ts` (composition only) | Flag off byte-identical; flag on: only answered requirements change, per the table; precedence, lifecycle and rollback tests |
| **F5** | UI: verdict labels and explanations for structured answers ("Self-reported, from your choice"), and messages no longer saying "doesn't change the match yet" when the flag is on | the match page, `structured-answer-form.tsx` | Playwright: change, revoke, flag-off revert; accessibility |
| **F6** | The F report and the regression run; Stage G planning (separately approved) | docs | All gates in §9.3 |
