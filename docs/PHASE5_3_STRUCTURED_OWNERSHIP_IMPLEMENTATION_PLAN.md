# Phase 5.3: Structured Ownership — Implementation Plan

November 10, 2026. **Plan approved 2026-11-10: O1–O7 approved, with the original D1–D3 conditions kept exactly. No stage has started; Stage 0 waits for the owner's go-ahead.** Nothing in it is implemented.
- No code, schema, migration or dependency has been added.
- The sealed split `m11_followup4` is unopened.
- Feature flags stay off.

**Builds on:**
- The approved design, docs/PHASE5_3_STAGE4A_STRUCTURED_OWNERSHIP_DESIGN.md, with the owner's D1–D3 conditions.
- Equivalence batches 1–4: commits a84d42b, 20da208, 1fa8b93 and e336f4d (table answer-equivalences-v5).

## Starting point

- **The equivalence table:**
  - 28 groups approved, all with past-tense exact phrases only.
  - 3 groups rejected.
  - 11 groups held.
  - The two proposed additional groups (Batch 5) haven't been reviewed yet. The approved order puts that review before structured ownership. It doesn't block Stages 0–1, so it can run alongside them (decision O6).
- **Who did the work:** rules-v19 reads it from free text and gets it right 51% of the time on the 400-text ownership benchmark.
- **Open release blockers:** every blocker found so far is still open (listed in §5). Most are about who did the work or whether it actually happened. A few are about word sense.
- **Local environment:** Docker was reinstalled. The integration database `careeros-test-db` has been rebuilt. The local Supabase stack (54321–54324) and Valkey (6379) have not. Stages 1, 4 and 5 need local Supabase. Rebuilding it uses only the documented local commands (`npm run supabase:start`, `npm run db:local:setup`) and never touches hosted Supabase.

## Owner conditions this plan must keep

| Condition | Where it's enforced |
|---|---|
| D1: "I did it myself" can reach **Possible** without matching text, but only when the role, frequency and recency are consistent | Rule table (Stage 2), consistency checks (Stage 3) |
| D1: **Supported never comes from a choice alone.** Specific personal-execution evidence is required | Rule table: Supported needs consistent text in the requirement's words or an approved equivalence |
| D1: **Contradictions block automatic credit** and trigger a question | Consistency checks (Stage 3), follow-up questions (Stage 6) |
| D2: Older than three years is **a note, not a loss**. A requirement that **explicitly asks for recent experience** is checked against its own window | Rule table (Stage 2) |
| D3: Non-English text is **kept unchanged and not read.** The choice can reach Possible at most. Nothing claims the text was understood | Rule table, consistency (`text_unread`), user-facing wording |
| Historical answers and audit events are preserved. Choices stay self-reported. The local model has no say in verdicts | Stages 1, 5, 6; regression gates in §6 |
| A separate sealed evaluation for the new workflow. `m11_followup4` is never reused for it | Stage 0; Stage 7 opens each split exactly once |

## 1. Who did the work: doing it versus teaching, watching, ordering, filing or supervising it

**What the structured choice handles.** The person states their part (design §1). The seven choices already cover:
- doing it themselves, or doing part of it;
- supervising or assigning it;
- arranging or requesting it;
- helping someone who did it;
- watching it, or training on it;
- not having done it.

Supported always also needs consistent text.

**Two cases the approved choice list doesn't name**, both from the Batch 3–4 probes:
- **Teaching others to do it** ("I teach new hires how to operate a forklift"). The person may well be able to do the task, but teaching isn't the requested work unless the requirement is about training.
  - Proposal (O1): add "I taught or trained others to do it".
  - Rule: Possible at most, like "did some of it". It counts as "did it myself" only when the requirement is itself about training or teaching.
  - The question "Did you also do any of it yourself?" follows, as it does for the other lead choices.
- **Handling paperwork, records or orders for the work** ("I filed the contracts the attorneys drafted", "I printed and filed the lesson plans", "I collect timesheets and send them to the payroll company").
  - Proposal (O2): don't add an eighth choice. Treat this as **arranged / requested / handled the paperwork**.
  - The wording becomes "I arranged it, requested it, or handled the paperwork for it". It reaches Not enough information unless the requirement is about coordination or records.
  - The text-mismatch rule catches it when someone picks "did it myself" but describes paperwork.

**The text reader** still reads every old answer (they have no choice) and checks new answers for consistency. So Stage 3 adds clause rules to it.
- These rules work on sentence structure, not on lists of ambiguous words, which the owner ruled out.
- Each rule maps to an open blocker:

| Structure | Example (blocker) | Reading |
|---|---|---|
| Teaching or training others to do it: "teach/train/show *someone* (how) to …" | B4-TEACH, B3-BLUEPRINT | Not the person's own execution. Possible at most |
| Purpose or instrument: "… people use to …", "… for … to …" | B3-BLUEPRINT ("the books people use to read blueprints") | Not execution. Not enough information |
| Someone else did the work, in a relative clause: "the *X* (that) *someone else* *did*" | B4-OTHERS ("the contracts the attorneys drafted") | The other person did it. The person's own verb (filed, reviewed, printed) is what counts |
| Passive with someone else as the actor: "was *done* by …" | B4 ("I was supervised by a team lead") | Already Not enough information. Kept as a regression test |

Every rule is checked against spent and opened data plus the probe sets before it's adopted. Any labeled loss is reported and needs owner approval (§4).

## 2. Completed work versus plans, training or learning

**Structured path:**
- "I watched it being done, or trained on it" covers classes, demos and current learning.
- "Actually, I haven't done this" is a denial.
- The **frequency** answer ("once", "a few times") caps the verdict at Possible.
- The **recency** answer feeds D2.

**Text path** (Stage 3): attitude, intention, learning and future clauses get the same treatment as today's hypotheticals:
- "I'm learning to …", "I need to learn to …", "I want to …", "I hope to …", "I'll … once …", "I hate to …" (B4-INTENT, B3-BLUEPRINT, the ductwork probes)
- These are read as not done: Not enough information. A plain "I hate to make cold calls" doesn't deny the work, but it isn't evidence of it either.
- With a structured choice of "did it myself", such text is a **mismatch**. The more conservative reading is used, and the person is asked to clarify (D1).

**Recency (D2):**
- If the requirement explicitly asks for recent or current experience (for example "recent", "currently", "within the last *N* years"), the recency answer is compared with that window.
  - Outside the window: Possible at most, with the reason shown.
  - Inside the window: no effect.
- If the requirement doesn't ask for recency, "more than 3 years ago" only adds a note.
- The requirement's own words decide whether recency is asked for, using the existing structured-requirement fields where they exist. No new word list. An unclear requirement is treated as not asking.

## 3. Compound requirements with several distinct tasks

**The problem:**
- "Conduit bending and installation" and "Handle patient scheduling and insurance verification" each ask for two tasks.
- Credit for one part must not establish both (B3-CONDUIT).
- Their questions must not be merged with a question about one part.

**Proposal (O3):**
1. **Detection, measured before it's used.**
   - A deterministic splitter proposes parts only when a requirement joins two task phrases with "and", "as well as", "&" or a comma list, and each part names its own work.
   - Fixed terms that look compound ("research and development", "health and safety", "accounts payable and receivable") are handled by structure, not by a word list: a split happens only if each part would make sense as a requirement on its own.
   - The splitter runs first over the 2,121 baseline requirements and the opened sets. Its proposed splits go to the owner for review before anything uses them.
2. **The question.**
   - A compound requirement gets one card that lists its parts.
   - "Which of these did you do yourself?" uses a checkbox per part, and the ownership choice applies to each checked part.
3. **The verdict is the lowest part's verdict.** All parts done can reach Supported, under the usual text rule for each part. Some parts done reaches Possible at most and says which part is missing. That matches the labels: the Tasha answer in m11_followup3 is labeled Possible.
4. **Question keys.** A part's question can be shared with a single-task requirement for the same part ("Conduit bending"). The compound question is never merged with either part alone. The held conduit group stays held.

**Text path:** an old answer to a compound requirement keeps its rules-v19 reading. For new answers, the per-part check replaces inference.

## 4. Keeping genuinely qualified historical answers

- **Nothing is rewritten.** Saved answers keep their words, verdict and meaning. A null `involvement` means "read as text, exactly as today". The person can add their part, which creates a superseding answer and records the verdict before and after (design §7).
- **Labeled legitimate answers are pinned.** These answers become a regression list, and each must never drop below its current reading:
  - the four in the Batch 3 held groups;
  - the four in the Batch 4 held groups;
  - the bank-reconciliation answer and the surgical-dressings answer (both are already labeled losses and stay recorded);
  - every m11_review and m11_remediation answer labeled qualified.
- **Regression gates at every stage that touches readings:**
  - the 1,266 historical answers;
  - the 2,121 engine rows, which must stay unchanged because the engine isn't touched;
  - the ownership benchmark;
  - the combined Batch 1–4 probe sets.

  Every verdict change is reported with its label: gains, losses, and unlabeled. **A labeled loss stops the stage** until the owner decides.
- **Recognition is reported alongside safety**, every time: legitimate matches newly missed, as well as false credits removed.

## 5. The existing base-reader blockers

Each blocker has an owner and a release criterion. A blocker that remains open at freeze is listed in the report and blocks release unless the owner explicitly accepts it.

| Blocker | Example | Kind | Addressed in | Release criterion |
|---|---|---|---|---|
| B1 payroll company | collecting timesheets for the payroll company is Supported | someone else did it / paperwork | Stage 3 text rule; O2 choice | Not Supported for payroll processing |
| B1 office party budget | managing a party budget is Supported for budgeting | word sense / scale | O4 | Not Supported, or owner accepts |
| B1 recognition | "paid vendor invoices" blocked by DONE_ELSEWHERE; "kept the books" and bank reconciliation lost | recognition | Stage 3 (DONE_ELSEWHERE review) | Recovered without new false Supported, or recorded |
| B2 medication paperwork | disposal returns and reimbursement forms are Supported for medication administration | word sense | O4 | Not Supported |
| B2 parking registration | parking-permit registration is Supported for patient registration | word sense | O4 | Not Supported |
| B2 "passed medications" | read as assisted | recognition | Stage 3 | Possible or better for genuine med passes |
| B3-OIL | restaurant fryer oil is Supported for oil changes | word sense / domain | O4 | Fryer not Supported; engine-oil positive kept |
| B3-CONDUIT | bending alone credited for bending and installation | compound | §3 | Neither part alone establishes both |
| B3-BLUEPRINT | teaching, learning, intention, purpose with "read blueprints" | who did it / plans | §1–2 text rules | All eight cases below Supported with the group approved; the group stays held until then |
| B4-TEACH | "I teach new hires how to operate a forklift" | teaching | §1 | Possible at most |
| B4-INTENT | "I hate to / I'm learning to make cold calls" | plans / learning | §2 | Not Supported |
| B4-OTHERS | "I filed the contracts the attorneys drafted" | someone else did it | §1 | Not Supported |
| B4-PERSONAL | "my own doctors", "my own guitar practice" | personal, not work, context | Structured question ("in a job") plus a Stage 3 text rule for "my own …" | Not Supported |
| B4-MODIFIER | "forklift rental counter", "customer complaints data", "picked orders up" | word sense / phrase boundary | O4 | Not Supported |

**Word-sense blockers (O4).** Structured ownership answers *who did the work*. It doesn't answer *which meaning of the words*. The owner ruled out hand-kept lists of ambiguous words.
- **Recommendation:**
  - First simulate one structural rule, on spent data only: an exact or requirement-word match followed directly by a noun that makes it a modifier ("forklift *rental counter*") or a separable particle ("picked orders *up*") doesn't count as the task.
  - Domain blockers (fryer oil, parking registration, medication paperwork) become **targeted questions**, as the owner directed for ambiguous description matches. When an answer's only link to the requirement is the requirement's own words and the person hasn't chosen a part, the code asks "Was this [requirement] as part of a job doing that work?" instead of crediting it.
  - Both changes are simulated first, and the losses reported, before any decision.

## 6. Stages, tests and acceptance criteria

These are the eight approved stages. Each one ends with the regression gates in §4, the full unit and integration suites, TypeScript and lint, and a report. **Each stage stops for owner review before the next.**

| # | Stage | Main work | Tests that must pass |
|---|---|---|---|
| 0 | New sealed split | About 160 structured scenarios, written by one agent and labeled by another, committed unopened. Includes: every choice; contradictions; frequency and recency; recency-required requirements (D2); non-English text (D3); compound requirements; every §5 blocker pattern in fresh wording; injections; replies | Only the integrity hash and count are checked. Nobody opens it. Written **before** any reader change, so it stays independent |
| 1 | Schema, local only | The additive nullable fields from design §8, plus `involvement` on the event table, plus a per-part record for compound requirements (O3). Local migration only; RLS unchanged | Migration replays into a fresh database with no drift; old rows read unchanged; integration tests for creating, superseding, revoking and deleting; RLS checks |
| 2 | Rule table | A pure `readStructuredAnswer()` implementing design §4–5, D1–D3, O1–O3 and compound minimum logic. No input/output and no model | An exhaustive table test (every choice × requirement kind × frequency × recency × text state); property tests (a choice alone is never Supported; a mismatch never raises; non-English text is never read); the D2 window cases |
| 3 | Consistency checks and text-reader rules | Text compared with the choice; mismatch messages; the §1–2 clause rules in the text reader (rules-v20); the O4 simulations, reported before adoption | Probe sets for each rule (positives and traps); the full historical comparison with labels; the ownership benchmark; zero labeled losses without owner approval |
| 4 | Forms | Both flows: progressive disclosure, per-part checkboxes, accessibility (design §9), plain language, honest wording for non-English text | Browser tests: keyboard only, screen reader labels, mobile at 375 px, dark mode, every choice path, a contradiction prompt, no preselection |
| 5 | Saving and supersession | Server actions, superseding old answers, audit events (the choice, never the words), revocation and deletion | Integration: account isolation, forged ownership fields, stale versions, supersession chains, events hold no free text |
| 6 | Follow-up integration | Code-chosen questions on a mismatch, partial work or a compound gap. The reply reader gets the choice. The model only suggests wording | Replies never raise a verdict above Possible; a reply never changes a choice (it prompts the person); injection probes |
| 7 | Freeze and evaluate | Freeze the code. Open `m11_followup4` once (text path, compared with its recorded sealed rules-v18 counts) and the Stage 0 split once (structured path). No tuning after opening | See the release criteria below |

**Proposed release criteria** (O5; the owner sets the final numbers before freeze):
1. **0 false Supported** on the new structured split and on `m11_followup4`.
2. **0 Supported from a choice alone.** Every Supported has quoted personal-execution text in the requirement's words or an approved equivalence.
3. **Contradictions are always caught:** every contradiction scenario gives no automatic credit and a clarification prompt.
4. **0 injection successes** above Not enough information.
5. **Unsafe Possible at or below the rules-v19 level** on `m11_followup4`, and reported by category.
6. **Recognition at or above rules-v19** on `m11_followup4`. On the structured split, genuine "did it myself" answers with matching text reach Supported in at least the share the owner sets.
7. **Engine unchanged:** 0 of 2,121 rows. Historical: 0 labeled losses unless approved one by one.
8. **Every §5 blocker** is resolved or explicitly accepted by the owner.
9. **Feature flags off by default.** Hosted builds can't turn them on (as today). No production migration without separate approval.

## Decisions for the owner

- **O1.** Add the choice "I taught or trained others to do it" (Possible at most, unless the requirement is about training)? *Recommended: yes.*
- **O2.** Fold paperwork, records and ordering into "I arranged it, requested it, or handled the paperwork for it", rather than adding an eighth choice? *Recommended: yes.*
- **O3.** Compound requirements: a deterministic splitter, its proposed splits reviewed by the owner before use, per-part checkboxes, and the verdict taken from the lowest part? *Recommended: yes.*
- **O4.** Word-sense blockers: simulate the modifier and particle rule, and targeted questions for answers whose only link is the requirement's own words, then decide from the reported losses? *Recommended: yes, as a simulation only.*
- **O5.** Confirm or adjust the release criteria above, including a recognition target for the structured split.
- **O6.** Review the two proposed equivalence groups (Batch 5) alongside Stages 0–1, or before starting? *Recommended: alongside. They touch neither the split nor the schema.*
- **O7.** Rebuild the local Supabase stack and Valkey with the documented local commands before Stage 1? *Recommended: yes. They're needed for the local migration and the browser tests, and they don't touch hosted Supabase.*

**Effort:** about 7–9 working sessions, slightly more than the design estimate because of the compound-requirement and text-rule work. Nothing runs outside this machine, and nothing ships without approval.

**Note added 2026-11-10, after Batch 5 was simulated** (docs/EQUIVALENCE_REVIEW_BATCH5.md). Both proposed groups fail the no-new-false-Supported bar as drafted, through the same teaching, learning, personal and modifier patterns that Stage 3 targets. So O6 in practice means: keep both out of the table now, and re-simulate them after Stage 3. Neither touches Stages 0–2.

## Files and acceptance tests per stage

Existing modules named here are the current ones. New files are marked *new*.

| # | Stage | Files and modules affected | Acceptance tests |
|---|---|---|---|
| 0 | New sealed split | *new* `tests/fixtures/m11_structured/` (`scenarios.json`, `labels.json`, a hash manifest), written and labeled by separate agents; *new* `tests/eval/structured.eval.ts` (harness, not run until Stage 7); `TESTING.md` | A manifest check that the hash and count match; a guard test that fails if any non-eval test reads the folder; `m11_followup4` untouched |
| 1 | Schema, local only | `prisma/schema.prisma` (`Involvement`, `WorkFrequency`, `WorkRecency`; nullable fields on `CandidateClarification` and `ClarificationEvent`; a per-part table for compound requirements); *new* `prisma/migrations/2026111x…_structured_ownership/`; regenerated `src/generated/prisma/` | The migration replays into a fresh shadow database with no drift (`migrate diff`); `tests/integration/ai-clarifications.integration.ts` extended (old rows read unchanged, null = text path, RLS unchanged, deletion cascades); 176+ integration tests |
| 2 | Rule table | *new* `src/lib/ai/rules/structured-answer.ts` (`readStructuredAnswer()`, pure); `src/lib/ai/requirement-structure.ts` (asks-for-recency and compound-part detection, O3, the splitter output reviewed by the owner before use); `src/lib/ai/rules/review-queue.ts` (compound question keys); *new* `tests/ai-structured-answer.test.ts` | An exhaustive table test for every choice × requirement kind × frequency × recency × text state; property tests (never Supported without consistent text; a mismatch never raises; non-English text is never read; the lowest part decides a compound); a splitter report over the 2,121 baseline requirements |
| 3 | Consistency and text rules | `src/lib/ai/rules/answer-review.ts` and `src/lib/ai/clauses.ts` (teaching, purpose, others' relative clause, intention and learning, personal context; rules-v20); `src/lib/ai/evidence-boundary.ts` (shared boundary); `src/lib/ai/answer-language.ts` (`text_unread` for D3); *new* consistency module beside `structured-answer.ts`; O4 simulations in scratch only | Probe suites per rule; the 1,266-answer historical comparison with labels (0 labeled losses unless approved); the ownership benchmark; the 2,121-row engine baseline unchanged; all equivalence batch tests; Batch 5 re-simulation |
| 4 | Forms | `src/components/job-clarification.tsx`, `src/components/job-review-panel.tsx` (the choice, follow-ups, per-part checkboxes, progressive disclosure); `src/app/dashboard/jobs/[id]/match/page.tsx`; `e2e/job-clarification.spec.ts`, `e2e/job-review.spec.ts` | Browser tests: every choice path, a contradiction prompt, no preselection, keyboard only, labels, 375 px, dark mode (`e2e/dark-mode-forms.spec.ts`); a clean-clone build |
| 5 | Saving and supersession | `src/app/jobs/clarification-actions.ts`, `src/app/jobs/review-actions.ts`, `src/lib/ai/clarification-store.ts`, `src/lib/ai/clarification-review.ts`, `src/lib/ai/answer-deletion.ts` | Integration: account isolation and forged fields (`e2e/account-isolation.spec.ts`, `ai-review.integration.ts`); stale versions; supersession chains; events hold the choice only, never the words; revoke and delete |
| 6 | Follow-up integration | `src/lib/ai/follow-up.ts`, `src/lib/ai/rules/follow-up-reply.ts`, `src/app/jobs/follow-up-actions.ts`, `src/components/job-follow-up.tsx`; the model stays behind its flag in `src/lib/ai/interpretation*.ts` | `tests/integration/ai-follow-up.integration.ts` extended: replies never above Possible, a reply never changes the choice, injection probes; `e2e/job-follow-up.spec.ts` |
| 7 | Freeze and evaluate | Freeze tag; *new* evaluation report in `docs/`; `tests/eval/followup.eval.ts` (text path, `m11_followup4`) and `tests/eval/structured.eval.ts` (the Stage 0 split), each run once | The release criteria in §6; flags off by default and refused on Vercel; no production migration |
