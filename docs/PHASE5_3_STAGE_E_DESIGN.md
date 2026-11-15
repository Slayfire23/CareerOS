# Phase 5.3 Stage E: the per-part clarification questionnaire: design and integration review

November 14, 2026. **Read-only review; nothing implemented or committed.**

The baseline is `b3d3e0e`:
- rules-v21 is the default;
- the split-recognition module is `splits-v1.1` and inactive;
- no sealed split was opened.

**Sources:**
- the Stage 4A design (`PHASE5_3_STAGE4A_STRUCTURED_OWNERSHIP_DESIGN.md`) with D1–D3;
- DD2 (`PHASE5_3_PRE_STAGE4_DESIGN_DECISIONS.md`, `PHASE5_3_DD1_DD2_SPEC.md` §4–5);
- the implementation sequence;
- the Stage B, C, D.1 and D.2 reports;
- the code at `b3d3e0e`.

## Recommendation

**GO for implementing Stage E as a local-only, flag-off form that saves structured answers but cannot change any verdict.** Three owner decisions come first (E1–E3, §9). There are four conditions:
1. **Requirements are linked to an approved split by exact wording only.** The existing `questionKey` is unsafe for this (§3.2).
2. **The form never shows the person which parts their words "showed".** It only asks targeted questions (§5).
3. **Structured answers stay ignored by matching** (`formVersion 2`, fail-closed, as today) until Stage F.
4. **Before Stage F activation:** the "My boss sends me out…" misreading must be fixed, or `transferred` must stay informational (§7).

## 1. Current workflow

| Step | Where | What happens today |
|---|---|---|
| Question shown | `rules/clarifications.ts` (`clarificationFor`), `review-queue.ts`; UI `job-clarification.tsx` (basic) and `job-review-panel.tsx` (behind `CLARIFICATION_REVIEW_ENABLED`) | One card per open requirement: "Yes, add details" / "No, I don't have this" / "Skip for now". "Yes" opens a role picker and **free text**; there is no ownership choice |
| Save | `clarification-store.ts` (`addRoleDetail`, …) and `clarification-review.ts` (`confirmWithDetail`, `correctAnswer`, …) via server actions in `src/app/jobs/*-actions.ts` | Verified user only; question must be one the person's own latest analysis asks; 30 a day under an advisory lock. Text is checked by **`answerProblem`**: lists, templates, instructions and remarks are refused (P1 and D2 included). Saved as `CandidateClarification` with **`formVersion` 1**; events store actions, never words |
| Evaluate | `analysis.ts` `activeAnswers` → `applyAnswers` → `readAnswer` | The rules run again. Each active **formVersion 1** answer is read by `readAnswer` (rules-v21) for its own question key. It can raise "Not enough information" to Possible, or reach Supported with matching own text. It never lowers the rules' own Supported or Not supported (Stage 1c exception: title-only credit) |
| Structured answers | `analysis.ts:128` | **`formVersion` 2 is excluded (fail-closed).** A structured answer gives nothing until the rule table is wired, so text is never read without its choice |
| Follow-ups | `follow-up.ts`, `follow-up-reply.ts` (behind `FOLLOW_UP_WORKFLOW_ENABLED` + review; local Ollama; never on Vercel) | Code-chosen questions; replies reach Possible at most (Self-reported) |
| Ready but unused | `structured-answer.ts` (rule table: D1, O3, F6, contradicted parts), `structured-consistency.ts`, `split-recognition.ts` (`splits-v1.1`) | Pure, inactive, tested; no caller |
| Schema | `CandidateClarification` (involvement, alsoDidSome, frequency, recency, claimedMonths, consistency, formVersion); `ClarificationPart` (partIndex, partText, checked) | Migration `20261110010000` is applied **to local databases only**; production needs separate approval |

## 2. What Stage E builds

The Stage 4A form (4A stage 4), extended by DD2 for approved splits:
- shown only with a new flag;
- saving `formVersion` 2 answers;
- changing **no verdict**: matching keeps ignoring them until Stage F.

The base question card is unchanged ("Yes / No, I don't have this / Skip for now"). **Yes** opens:

> **What was your part?** *(choose one)*
> ○ I did this work myself
> ○ I did some of it myself
> ○ I supervised it or assigned it to others
> ○ I arranged it, or requested it from a contractor or provider
> ○ I helped someone who did it
> ○ I watched it being done, or trained on it
> ○ Actually, I haven't done this

The rest of the form:
- For the lead choices (supervised, arranged, helped) on a requirement that doesn't ask for that kind of work: **Did you also do any of it yourself?** ○ Yes ○ No. "Yes" behaves as "I did some of it myself".
- For "did it myself" and "did some": **How often?** and **Most recently?** (4A §2). **Which role?** as today. **About how long in total?** only for time requirements.
- **What did you do yourself?** (optional, 1,000 characters). Hint: "Say what you did yourself, on what, and how often. Plain words are fine."

**For a requirement linked to an approved split**, one more group appears for "did it myself" and "did some". It doesn't appear for the other choices:

> **Which of these did you do yourself?** *(tick all that apply)*
> ☐ Installing residential plumbing
> ☐ Repairing residential plumbing

- The parts use the exact approved wording.
- **Nothing is preselected.**
- There is one explanation for the whole requirement (DD2), and nothing has to be written twice.

## 3. Linking a requirement to an approved split

### 3.1 Rule (proposed; decision E1)

A job requirement uses the per-part form only when its text, normalised, **equals** the requirement of one of the 33 approved splits. Normalisation means case, whitespace, punctuation and a leading "Experience with/in". Everything else gets the single-requirement form.

This is deliberately narrow. Matching other wordings to a split needs its own owner-reviewed list, the same way the splits themselves were approved.

### 3.2 Why not `questionKey` (measured)

| Check | Result |
|---|---|
| 33 approved splits → distinct keys | **31.** P1 "Bookkeeping and month-end reconciliation" = P8 "Perform bookkeeping and monthly financial reporting"; P13 "Recruiting and hiring staff" = P14 "Recruiting and onboarding new staff": different splits, different parts |
| The 76 requirements you decided to keep **unsplit** | 1 would be split anyway: "Experience operating a cash register and handling cash transactions" → P2 |
| Opened requirements (966) linked | 34; 6 by other wording, including **single-part requirements** ("Bookkeeping", "Inventory cycle counting", "Accounts receivable collections") that would wrongly get parts they never asked for |

## 4. Situations and how the form treats them

The recognition module (`recognizeParts`) and the consistency check run **on the server, after saving and on every read**. They decide only which **targeted question** to ask. The person never sees "shown / not shown / transferred".

| Situation (what the reader and module find) | What the person sees | Effect, when Stage F wires it (rule table, unchanged) |
|---|---|---|
| **Part ticked and shown** by the person's own words | Nothing extra | Counts toward Supported only if every necessary part is ticked and shown, the explanation is consistent, and the frequency is at least "a few times" (O3, D1, X2 held) |
| **Part ticked, not shown** | One targeted question (DD2): "You ticked **Repairing residential plumbing**. What did you do yourself?" Asked once, never repeated | Possible at most for the requirement until answered; a reply reaches Possible at most |
| **Part not ticked** | Nothing (it's their answer) | Possible at most; the missing part is named in the result (O3) |
| **Part `transferred`** (someone else's words, or delegated work, name it) and **ticked** | One neutral question: "Your description mentions others doing **Installing residential plumbing**. Did you also do some of it yourself?" ○ Yes, I did some myself ○ No, others did it | Informational until Stage F (§6). "No" unticks the part (the person's own edit) |
| `transferred`, **not ticked** | Nothing | — |
| **Own and delegated** (own words show it; delegated work also names it) | Nothing: the part is shown | Counts as shown (D.2 never cancels it) |
| **Supervision without performance** (choice "I supervised it…", "also did some" = No) | The part checklist isn't offered; a short note: "We'll show this as supervising, not doing the work." | Not enough information, unless the requirement asks for supervision (4A §4) |
| **Contradiction** (choice "did it myself", but the text gives the work to someone else or denies it: F6) | The 4A mismatch message: "Your description says someone else did this work. You can change your choice or your description." | No automatic credit (D1): Not enough information; for a part, that part only (failure 4) |
| **Correction that narrows** ("…, I only fix flats") | Nothing, if the narrowed part is ticked and shown; otherwise the targeted question | The narrowed part counts within its scope; the rest Possible at most |
| **Correction that transfers** ("Well, the mechanics do the work") | As `transferred`, ticked | As above |
| **Not plainly English** (D3) | Saved; the text isn't read. "We can't read this description, so your choice counts on its own." | The choice counts, Possible at most |
| **Instruction, template, quotes, list, evaluator remark** | Refused at save time with the reason (`answerProblem`, P1 protections) | Nothing saved |

**A checkbox or "I did it myself" can never produce Supported on its own:** the rule table caps a choice without shown text at Possible (D1), and shown text is required for every ticked part (X2 held).

## 5. Why the form never shows "what your words showed"

Showing per-part recognition ("we found *installing* in your words") would teach people which words unlock credit. A one-click over-claim (4A risk 1) would become a one-sentence one. Targeted questions give the same chance to add missing information without revealing the markers. The only per-part feedback is the question itself, which names the part, not the pattern.

## 6. Data flow and storage

```
form ──server action (flagged)──► validate: verified user · asked question · daily limit · answerProblem (v21, P1)
       ──► save CandidateClarification { formVersion: 2, involvement, alsoDidSome, frequency, recency,
                                          claimedMonths, detail, experienceId, questionKey }
           + ClarificationPart[] { partIndex, partText (approved wording), checked }   (only for linked splits)
           + ClarificationEvent { action, involvement }   (choices, never words)
       ──► on read: assessConsistency + recognizeParts (splits-v1.1) → targeted questions only
       ──► matching: unchanged (formVersion 2 ignored until Stage F)
```

- **`transferred` and `shown` are not stored.** They're recomputed on every read, like `consistency` and every other reading, so they always follow the current reader and recognition version.
- **Audit:** recording `splits-v1.1` beside each event's `rulesVersion` would need a column (a migration). That is **deferred to Stage F**, when readings start to matter.
- **No migration in Stage E.** The Stage 1 schema already holds everything.

### Supersession and old answers (4A §7, unchanged)

- Old free-text answers keep being read as today.
- "Add your part" creates a new answer that supersedes the old one, and the old one is kept as SUPERSEDED.
- **While the flag is on locally, a superseding structured answer would stop the old text answer from counting** until Stage F. That is why Stage E either **doesn't offer "Add your part" on answers that already count**, or keeps the old answer active (decision E2).

## 7. Reader limitations and questionnaire accuracy

| Limitation | Effect in the questionnaire | Before E build? | Before F activation? |
|---|---|---|---|
| **"My boss sends me out to install water heaters…"**: no own statement; the boss's clause counts as others' work | A genuine worker who ticks "did it myself" gets a **mismatch** (consistency) and both parts **`transferred`**, so the form would ask "others doing it?" of the person who did it | No (nothing affects verdicts) | **Yes:** fix the reader, or keep `transferred` out of verdicts **and** soften the mismatch for "sends me". Today it gives Not enough information, a lost legitimate answer |
| **A causative in the same statement** ("I call the past-due customers myself and have my clerk run the aging…"): the whole statement is read as overseeing | The person's own ticked part isn't shown → a targeted question → their reply can restore it at Possible | No | Recommended fix (it caps genuine work at Possible) |
| **Greedy send-to removal** ("…send the finishers out to trowel, and I pour the concrete myself") | The same: a targeted question recovers it at Possible | No | Recommended |
| "I run the crew…, and I repair the leaks myself" read as overseeing | The same | No | Recommended |
| The A58 design probe ("…install and repair **systems**") | Ticked parts not shown → a targeted question | No | No: by design, Possible at most |

**Summary:** none blocks building Stage E. "Sends me" must be resolved before Stage F lets `transferred` or the mismatch affect verdicts. The others lose legitimate experience only down to Possible, and the targeted questions give the person a way to restore it.

## 8. Implementation scope (smallest)

| Piece | What |
|---|---|
| Flag | `STRUCTURED_OWNERSHIP_FORM_ENABLED`: off by default, requires `CLARIFICATION_REVIEW_ENABLED`, **refused on Vercel** (as the follow-up flag) |
| `src/lib/ai/rules/approved-split-link.ts` (pure) | `approvedSplitFor(requirementText)`: exact normalised wording only (E1) |
| `src/lib/ai/rules/structured-form.ts` (pure) | The form model: which fields appear for which choice, validation of a submission (the database CHECK combinations), and which targeted questions to ask (`shown`, `transferred`, consistency → the questions in §4) |
| Server actions | `saveStructuredAnswer` / `correctStructuredAnswer`: the same scope, limit and `answerProblem` checks as today; write formVersion 2 + parts + event in one transaction |
| UI | `StructuredAnswerForm` in the review panel (4A §9: native radios and checkboxes in `fieldset`/`legend`, 44 px targets, errors at the top and by the field, mobile one column, dark mode); shown only when the flag is on |
| Not touched | `analysis.ts` matching (formVersion 2 stays excluded), the rule table, the reader, recognition, the engine, the schema, production |

## 9. Owner decisions

| # | Decision | Proposal |
|---|---|---|
| **E1** | How a job requirement is linked to an approved split | Exact normalised wording only; any other wording needs its own owner-reviewed list |
| **E2** | Offering "Add your part" on an old answer that already counts | Not in Stage E: a structured answer would stop it counting until Stage F |
| **E3** | Showing per-part recognition to the person | Never; targeted questions only (§5) |
| E4 | Wording | The 4A wording and the §4 questions, at a 6th–8th grade level; reviewed in the browser tests |

## 10. Tests and acceptance gates

| Area | Tests |
|---|---|
| Linking | All 33 approved requirements link to themselves; P1≠P8 and P13≠P14; none of the 76 unsplit requirements links; single-part requirements ("Bookkeeping", "Accounts receivable collections") don't link |
| Form model | Every choice shows exactly its fields; nothing preselected; "also did some = Yes" behaves as PART; parts only for PERFORMED/PART on linked splits; each submission the database CHECK allows is accepted, each it rejects is refused |
| Targeted questions | One per ticked-not-shown part; the `transferred` question only for ticked parts; none for shown, unticked or own-and-delegated parts; never repeated; the "sends me" case covered by a test documenting today's behaviour |
| Safety | No path gives Supported from ticks alone (rule table, every combination); `answerProblem` refuses instructions, remarks (P1), templates and lists on the new path; non-English saved but not read; events contain no words |
| No verdict change | With the flag on and structured answers saved, **every analysis result is identical** to flag-off (formVersion 2 ignored); engine basis identical; 340 follow-up rows identical |
| Flag | Off by default; refused on Vercel; needs the review flag |
| Integration (local DB) | Save, correct, revoke and delete a structured answer and its parts; RLS ownership; daily limit; supersession rules (E2) |
| Browser (local) | Keyboard-only, screen-reader labels, 375 px, dark mode, error focus |
| Existing gates | Unit, integration, TypeScript, lint, schema, sealed guard, parts validate; parity 284 of 284 |

## 11. Remaining dependencies

- **Stage F (wiring):**
  - reading formVersion 2 answers through the rule table;
  - whether and how `transferred` affects verdicts;
  - the "sends me" fix;
  - the recognition-version audit column (a migration);
  - the follow-up integration for parts.
- **The production migration** for the Stage 1 schema (separate approval; everything stays local).
- **Stage G:** freeze, then the sealed `m11_parts` evaluation, with the evaluation-quality policy decided first.
- **The reader backlog (§7):** separate approvals.
