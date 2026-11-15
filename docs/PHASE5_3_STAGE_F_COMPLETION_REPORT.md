# Phase 5.3 Stage F: completion report (F6 audit)

November 15, 2026. **Scope:** F6 only. This is a read-only audit and regression run of F0–F5. No code was changed in F6. The only things added were this report, the documentation entries, and two local launch entries (outside the repository). Constraints, all in force:
- no production flag, migration, deployment, push or merge;
- no hosted Supabase;
- no change to rules-v21, rules-v22, `splits-v1.1` or the recognition default;
- no sealed split was opened.

**Overall status: Stage F is functionally complete, with ONE confirmed defect (D1, low severity, needs approval to fix) and test-harness gaps (T1–T3).** Stage G can begin once D1 is fixed or explicitly accepted. Production remains blocked (§12).

| Stage | Commit | Delivered |
|---|---|---|
| F0 | `a09c49c` | rules-v22, opt-in "directed at the person" reader |
| F1 | `52972ab` | `recognitionVersion` audit columns; `experience:<id>` evidence ids for structured answers |
| F2 | `138b472` | The pure `matchStructuredAnswer` module over the approved rule table |
| F3 | `610fff9` | `candidate_choice` citations and validation |
| F4 | `3a1a427` | Wiring behind `STRUCTURED_MATCHING_ENABLED`; F-9 rollback masking; F-10 freshness |
| F5 | `9b518a0` | Match-page rendering; choice-only Possible stored and shown with the flag on; flag-aware wording |

## 1. The lifecycle, traced

| Step | Where | Notes |
|---|---|---|
| Questionnaire | `structured-answer-form.tsx`, `structured-form-spec.ts` (Stage E) | Flag-aware wording (F5) |
| Validation | `parseSubmission` (restates the database CHECK); `answerProblem` | Unchanged since Stage E |
| Storage | `saveStructuredAnswer` / `correctStructuredAnswer` | `experience:<id>` set in the creating write (F1); `recognitionVersion` on events that used split data (F1) |
| Recognition | `recognizeParts` (`splits-v1.1`), `assessConsistency`, `readAnswer`; default reader | Called only from `structured-apply.ts` on the matching path (guarded) |
| Matching | `applyAnswers` (free text first) → `applyStructuredAnswers` → `matchStructuredAnswer` → `readStructuredAnswer` → `applyFollowUps` | Only with the flag on, only for the rules |
| Citation validation | `validateMatchResponse` | `candidate_choice` rules (F3) |
| Persistence | `JobMatchAnalysis` (findings; `recognitionVersion`) | Choice items travel only on the rules request (`structured_choices`) |
| Display | `getAnalysisPageData` → masks → `page.tsx` | Masks applied in order: F-9 structured mask, revocation mask, then choice validity |
| Correction, revocation | New row or status change; masks apply at once | |
| Deletion | `scrubAnalyses` (`experience:<id>` and `choice:<id>`) | |
| Rollback | `structuredMaskFor` + `currentFindings` on every reader of stored findings (**except D1**, §5) | |

## 2. Design decisions and deviations

| Item | Approved | Implemented | Status |
|---|---|---|---|
| F-1 | rules-v22 opt-in | As approved; v21 default | PASS |
| F-2 | `transferred` → `contradicted` only after v22 is adopted | `contradicted` always false | PASS |
| F-3 | Every ticked part shown | As approved | PASS |
| F-4 | `candidate_choice` ≤ Possible, `choice:` item | As approved | PASS |
| F-4b | Exact per-part quotes | **Not done** (would change `splits-v1.1`); approved fallback quote used | Approved deviation (F4) |
| F-5 | Title-only rule applies to structured descriptions | Applied exactly as to free text | PASS |
| F-6 | Claimed months raise an `employment_dates` gap to Possible at most | As approved, via `candidate_choice` | PASS |
| F-7 | Grouped questions with a split fail closed | As approved | PASS |
| F-8 | Audit migration, evidence-id backfill | As approved. **Refinement:** event versions only where recognition data was used | Reported in F1 |
| F-9 | Flag off: stored structured findings don't count | All readers except D1 | **FAIL (D1)** |
| F-10 | Freshness only with the flag on | As approved. **Refinement:** markers by answer id, not key and choice (catches every correction) | Reported in F4 |
| F0 | "me and two techs" as a team clause (design suggestion) | Kept the v21 reading (conservative) | Reported in F0 |
| F2 | Lead choices on splits | Not enough information (no part ticks) | Approved in F4 |
| F2 | Whole transfer | Contradicts the tick (reviewed simulation) | Approved in F4 |
| F4 | Unrelated words cited as Possible support | Words cited only where the reader relates them to what's asked | Reported in F4 |
| F3 | No UI change | One approved `RULE_SOURCE` label | Approved |
| F4→F5 | Choice-only results withheld (option A) | Lifted in F5 for valid choices | Approved in F5 |

## 3. Matching correctness

| Criterion | Status | Evidence |
|---|---|---|
| A choice alone never produces Supported | PASS | 62,150-combination table (F2); validator refuses any Supported citing a choice (F3); pipeline and page tests (F4/F5); browser: only the described answer is Supported |
| Supported needs evidence of the required work | PASS | Rule-table Supported **and** a verbatim quote from the requirement reading, or recognition of every ticked part (F2, "consistency gap" tests) |
| A rules Supported is never lowered | PASS | Every choice, including NOT_DONE (F4 unit and integration) |
| Free-text precedence | PASS | `freeTextCounts` (F2); E2 at save; integration with a forced coexisting row (F4) |
| Denials and contradictions | PASS | NOT_DONE as a deny record; F6 contradictions give nothing; whole transfer contradicts (F4, all 33 splits) |
| Title-only rule (F-5) | PASS | Engine fw-082 case: the structured finding is identical to free text (F4) |
| Splits isolated; all 33 mappings | PASS | 33 × 9 (F2) + 33 × 4 through the validator (F4); P1/P8 and P13/P14 distinct; edited or duplicate parts fail closed; parity 343 |
| Grouped splits fail closed | PASS | F2 and F4 tests |
| Transferred work gets no personal credit | PASS | Whole transfer → nothing; shared participation isn't whole transfer (F4) |
| Claimed months never establish dates | PASS | Only an `employment_dates` gap → Possible, as a claim; never above Possible (F2/F4) |
| Recognition versions recorded accurately | PASS | `splits-v1.1` only when recognition was used (F1/F4); NULL otherwise; database format checks |
| rules-v21 default; rules-v22 opt-in | PASS | Guards; v22 readings refused unless explicitly expected (F2); the app never selects v22 |

**Related but different work (the HVAC example).** I ran it in F6 against the local test database, for both "Personally performing HVAC repairs" and "Repairing commercial HVAC systems", with "I pick up parts for the HVAC techs.":

| Answer | Verdict | Explanation | Citation |
|---|---|---|---|
| Structured, "did it myself" | Possible (`candidate_answer`) | "Your structured answer describes related work, or part of what this asks for." | "I pick up parts for the HVAC techs" (Experience; "From an answer you gave. Self-reported…") |
| Free text, same words | Possible (`candidate_answer`) | "Your answer describes related work, or part of what this asks for." | The same quote |

- **PASS:** CareerOS never says the person performed repairs; the citation shows exactly what was claimed.
- **Open question (O1):** the rules-v21 reader classes this as "part of what is asked", and the shared wording "…or part of what this asks for" can be read as "did part of the repairs". This is pre-existing free-text behaviour. Changing the wording or the reader is a rules change outside F6 (§10).

## 4. Citation integrity

| Criterion | Status | Evidence |
|---|---|---|
| Choice citations are self-reported | PASS | Fixed wording "Structured answer, self-reported: CareerOS hasn't independently verified it…"; origin `candidate_choice`; page: "Your choice" with the origin note |
| Choice justifies Possible at most | PASS | Validator; page withholds any non-Possible choice finding |
| Supported needs description evidence | PASS | `candidate_answer` must cite the answer's verbatim words (validator unchanged) |
| Exact wording validated | PASS | Validator (intact item, exact statement); page (current wording of an active answer) |
| Stale or malformed citations withheld | PASS | `withholdChoiceFindings` + `validChoicesFor`; revoked, superseded, deleted, edited, malformed, Supported (F5 unit, F3/F4 integration) |
| Unknown sources can't crash the page | PASS | Fallback "Evidence" label |
| AI providers never receive choices | PASS | Built only when `usesRules`; suggestions use AI-safe evidence; validator refuses choice citations from language models |
| Structured descriptions never become AI evidence | PASS | `evidenceForAi` strips answer evidence; descriptions are evidence only with the flag on (F-10) |
| Origin labels accurate | PASS | Profile, answer and choice each labelled; browser-verified |
| Evidence ids stable and traceable | PASS | `experience:<id>` per row (F1, backfilled); `choice:<id>` derived from the same id; each correction is a new row and id |

## 5. Feature flags and rollback

| Criterion | Status | Evidence |
|---|---|---|
| Invalid combinations fail closed | PASS | 11 config cases: matching needs the form and the review; exact `"true"`; refused on Vercel |
| Off by default | PASS | Config tests; `.env` unchanged |
| No influence with the flag off | PASS | Four flag-off states: verdicts and stored results identical (F4 integration); engine byte-identical |
| Stored structured findings masked consistently | **FAIL (D1)** | Page, counts, run history, question selection, older flow, follow-ups, shadow: PASS. **"Changed by your answers" and `_RESULT` audit events: FAIL** |
| Free-text matching unchanged | PASS | Engine byte-identical to `c4ebce9` (pre-Stage F); 0 of 340 follow-up rows |
| Freshness (F-10) | PASS | Mutation-checked (F4) |

**D1, confirmed in F6.** With structured matching off, a stored structured Supported is correctly masked on the page. But answering any question re-runs the review, and `recheck()` (`src/lib/ai/clarification-review.ts:69`) reads the earlier analysis **unmasked**. So "Changed by your answers" shows "Install and repair residential plumbing: Supported → Not enough information", and the same pair is stored as a `CONFIRMED_RESULT` audit event.

- **Impact:** a summary line and audit row describe a verdict the person was never shown. No verdict, score or citation is wrong.
- **Narrow fix (needs approval):** read `before` through `currentFindings(...)` with the same config, plus one integration test. Nothing else changes.

**Searching for other consumers.** Every `jobMatchAnalysis` read in `src` was checked:

| Reader | Treatment |
|---|---|
| Page view and run history | Masked |
| `asked`, `askedQuestion`, `proposeFollowUp`, shadow | `currentFindings` |
| `clarification-store` `reevaluate` | Reads only the fresh analysis, computed under the current flags |
| Feedback | Uses the index only |
| Deletion | Scrubs |
| **`recheck` `before`** | **Not masked: D1** |

Follow-ups and the shadow reader go through `currentFindings` by construction; neither has a dedicated test.

## 6. Evidence lifecycle

| Case | Status | Evidence |
|---|---|---|
| Initial structured answer | PASS | F1/F4 integration; browser (F5) |
| Correction / replacement | PASS | New id; the old one masked as revoked (F1/F3/F4) |
| Revocation | PASS | Masked at once; the review re-runs (F3/F4/F5, browser) |
| Permanent deletion | PASS | Every version's `experience:` and `choice:` citations scrubbed (F1/F3/F4/F5, browser) |
| Historical analyses | PASS | Masked when off; recomputed run-history counts (F4/F5) |
| Superseded evidence ids | PASS | F1 integration, F1 migration check |
| Choice citations | PASS | F3/F5 lifecycle |
| Description citations | PASS | F1/F4 |
| Flag on ↔ off | PASS except D1 | F4 rollback test; D1 |

## 7. Database migrations

**F6 rehearsal on a throwaway local database (11 of 11):**
1. applied the 17 pre-Stage-1 migrations;
2. inserted pre-Stage-1 data (every answer outcome, an analysis citing an answer, an event);
3. applied Stage 1, then F1.

| Result | Status |
|---|---|
| Every existing row unchanged after each migration | PASS |
| All answers become formVersion 1 with no structured field | PASS |
| `recognitionVersion` NULL everywhere | PASS |
| Row-level security on for every Stage F table | PASS |
| F1 requires Stage 1 first | Verified |
| F1 rollback removes the columns and keeps the data | PASS |
| Throwaway database dropped | PASS |

**Also verified:** F1's earlier 37-check run (format constraints, idempotent backfill); local status 19 of 19 applied.

| Item | Status |
|---|---|
| Ordering (Stage 1 `20261110…` before F1 `20261114…`) | PASS (and required) |
| Idempotency | PASS for the backfill. The `ALTER … ADD` statements run once, as Prisma migrations do |
| Existing-data preservation | PASS |
| Recognition-version constraint | PASS |
| Evidence-id backfill | PASS (a no-op in production: there are no formVersion 2 rows) |
| Rollback | F1: script present and tested. **Stage 1: no rollback script (M1)**. After structured answers exist, rolling Stage 1 back loses them, and the restored stricter CHECK would reject structured rows without text. It needs a written, tested procedure before production |
| Production compatibility | **BLOCKED**: production state not checked (hosted Supabase is off-limits). Production is recorded as lacking the Stage 1 migration |

## 8. Regression results (F6 run)

| Gate | Result |
|---|---|
| TypeScript | Clean |
| `prisma validate`; local migration status | Valid; 19 of 19 applied |
| Lint | 0 errors, 1 warning (existing, `tests/eval/run-eval.eval.ts`) |
| Production build | Compiled |
| Unit | **3,895 of 3,895** pass |
| Integration (local test database) | **223 of 223** pass |
| Parity (split recognition) | **343 of 343** |
| Sealed guard | **11 of 11** (no sealed split opened) |
| Parts validate (counts only) | Pass (1 passed, 1 skipped by design) |
| Engine basis (2,121 rows) | **Byte-identical** to F5 and to Stage E `c4ebce9` (before Stage F) |
| Follow-up sets (340 rows) | **0 of 340** differ on any field vs `c4ebce9`; only the timing field `latency` differs |

**Browser (production build, four flag states; per-spec results):**

| State | Passed | Failed | Skipped |
|---|---|---|---|
| All flags off (**full suite**, 36 specs) | 29 | **1**: `job-match-assisted` (**BLOCKED, E1**) | 6 by design |
| Review only | match, dark-mode, **review** (temporary copy, §9) | `job-clarification` (**T1**) | — |
| Review + form | structured-form, match, dark-mode | `job-clarification` (**T1**); review (temporary copy) not applicable, the form replaces free text | structured-matching |
| All three flags | structured-matching (keyboard, 375 px, dark mode, revoke, delete), match, dark-mode | — | structured-form (by design) |

**Not every browser test passed.** Three items are open:
- **E1, `job-match-assisted.spec.ts` (BLOCKED, environment).** The local E2E account isn't on `AI_LOCAL_LLM_ALLOWED_USERS`, so the page never offers "Rules + AI suggestions" and the spec times out. Booleans checked in F6: local AI enabled, model valid, service configured, the E2E user found but not allowed. Stage F didn't touch this configuration (`config.ts` diff: the new flag only). Remedy: add the current E2E user id to the local allowlist (a `.env` change for you to make), then re-run with the AI service up.
- **T1, `job-clarification.spec.ts`.** Fails whenever the review is on (§9).
- **T2, `job-review.spec.ts`.** Skips whenever `.env` has the review off, even against a review-on server (§9). It passed when run as a temporary copy without its skip.

## 9. The `job-clarification.spec.ts` investigation

| Question | Answer |
|---|---|
| Did it fail before F5? | **Yes.** The page has hidden the basic clarification panel whenever the review is on (`!review && <ClarificationPanel…>`) since `a4eadfb` (2026-11-04). The Stage E report (`c4ebce9`) recorded the failure |
| Is it meant to run with the review on? | **No.** It already skips when `.env` has `CLARIFICATION_REVIEW_ENABLED=true`, pointing to `job-review.spec.ts` |
| Is the test configuration wrong? | **Yes.** The skip reads only the `.env` file. The local launch entries set the flags in the server process, so the spec can't see them. `job-review.spec.ts` has the mirror-image gap (T2): it never runs against a review-on server whose `.env` says off |
| Is the application correct? | **Yes**, by design: the review replaces the basic panel. No application defect |
| Should it be scoped explicitly? | **Yes.** It already is in intent; the scoping signal is incomplete |

**Proposed minimal test-only change (NOT applied; needs approval):** in `job-clarification.spec.ts`, also skip when the run declares a review-on server. In `job-review.spec.ts`, also run in that case:

```ts
const reviewOn = parse(readFileSync(".env")).CLARIFICATION_REVIEW_ENABLED === "true" || process.env.E2E_REVIEW === "true";
```

Use it as `test.skip(reviewOn, …)` in the clarification spec and `test.skip(!reviewOn, …)` in the review spec. Set `E2E_REVIEW=true` when testing against the `careeros-review-3100`, `careeros-structured-3100` or `careeros-matching-3100` entries. Evidence that it's right: the review spec passed against the review-only server as a temporary copy without its skip, and the clarification spec passes on the flags-off server.

**T3 (note):** the review spec drives the free-text answer box, so it doesn't apply when the structured form is on; there the structured specs cover the review. This should be stated in the spec's skip, not left implicit.

## 10. Known limitations and open questions

| # | Item |
|---|---|
| **D1** | `recheck()` before-verdict unmasked with the flag off (§5). **Fix before Stage G** (approval needed) |
| T1/T2/T3 | Browser-test scoping (§9). Test-only fix proposed |
| E1 | Assisted browser spec blocked by the local allowlist (§8) |
| M1 | No Stage 1 rollback procedure (§7) |
| O1 | "…or part of what this asks for" wording for related work (§3). Pre-existing reader behaviour; a rules or wording decision for you |
| L1 | Dispatched work ("My boss sends me out to…") gives nothing until rules-v22 is adopted (separate decision) |
| L2 | F-4b not done: split quotes use the fallback statement |
| L3 | Lead choices on approved splits give Not enough information (no part ticks), conservatively |
| L4 | Real-text accuracy of "shows the work" is unmeasured outside author-written probes. Stage G is the independent test |
| L5 | Follow-up and shadow rollback is by construction (`currentFindings`), without a dedicated test |

## 11. Stage G prerequisites

1. **D1 fixed** (or explicitly accepted) and re-verified.
2. T1/T2 test-scoping change approved and applied, so every browser state runs its intended specs.
3. E1 resolved locally, so the assisted spec has a real result.
4. The evaluation-quality policy from the design (R-c: 46% writer–labeler agreement, 55 unsure labels) decided.
5. A decision on O1 (wording) and on whether Stage G evaluates rules-v21 only or v21 and v22.
6. Sealed splits still unopened until Stage G starts, as now.

## 12. Production rollout blockers

1. **Database:**
   - the Stage 1 migration (`20261110010000_structured_ownership`), then F1 (`20261114010000_structured_matching_audit`), in that order;
   - each needs separate approval, and production's actual migration state must first be confirmed read-only by you;
   - a Stage 1 rollback procedure (M1).
2. **A Stage G result** on the sealed splits.
3. **D1 fixed.**
4. **Explicit approval to enable** `CLARIFICATION_REVIEW_ENABLED`, `STRUCTURED_OWNERSHIP_FORM_ENABLED` and `STRUCTURED_MATCHING_ENABLED` in production. The latter two are refused on Vercel by design; enabling them where CareerOS is hosted needs a deliberate change to that refusal.
5. **The open questions O1 and L1** decided, or accepted as limitations.
6. **Push, merge (PR #4) and deployment**, each with separate approval.
