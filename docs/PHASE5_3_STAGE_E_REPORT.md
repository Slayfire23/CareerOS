# Phase 5.3 Stage E: the structured "your part" questionnaire (implementation)

November 14, 2026. **Owner-approved design** (`docs/PHASE5_3_STAGE_E_DESIGN.md`, decisions E1–E4).

Constraints, all in force:
- the questionnaire sits behind `STRUCTURED_OWNERSHIP_FORM_ENABLED`, which is off by default;
- structured answers are saved but **change no verdict**: matching still reads free-text (formVersion 1) answers only;
- the reader (rules-v21), recognition (`splits-v1.1`), the 33 approved patterns, the engine, the rule table, the schema and the migrations are unchanged;
- no sealed split was opened.

## 1. What was built

| Piece | File | What it does |
|---|---|---|
| Flag | `src/lib/ai/config.ts` | `structuredForm`: on only with `STRUCTURED_OWNERSHIP_FORM_ENABLED=true` **and** `CLARIFICATION_REVIEW_ENABLED=true`, and never on Vercel |
| Split matcher (E1) | `src/lib/ai/rules/approved-split-link.ts` | `approvedSplitFor(text)`: exact wording, ignoring only case, spacing, punctuation and a leading "Experience with/in". Anything else fails closed, so the requirement is asked as a whole, as before. **`questionKey` is not used** |
| Form rules, browser-safe | `src/lib/ai/rules/structured-form-spec.ts` | The eight choices (Stage 4A plus O1 "taught"), how often, most recently, the hints, and `fieldsFromSpec` (which fields each choice shows) |
| Form model, server | `src/lib/ai/rules/structured-form.ts` | `formContext` / `formSpec`; `parseSubmission`, which restates the database CHECK and stores "supervised it, and also did some" as PART with `alsoDidSome`; and `targetedQuestions`, the neutral follow-ups. A question covering several requirements gets no parts (fail closed) |
| Save, correct, part questions | `src/lib/ai/clarification-review.ts` | `saveStructuredAnswer`, `correctStructuredAnswer` and `answerPartQuestion`. Details in §1.1 |
| Server actions | `src/app/jobs/review-actions.ts` | `reviewSaveStructured`, `reviewCorrectStructured` and `reviewPartQuestion`, with per-field errors |
| Page data | `src/lib/ai/analysis.ts` (page data only) | Form specs per question when the flag is on; each structured answer's own choices plus its plain questions. Structured rows **never count as denials**, and with the flag off they don't hide the ordinary question. They stay listed so they can be revoked or deleted |
| UI | `src/components/structured-answer-form.tsx`, `job-review-panel.tsx`, the match page | Details in §1.2 |

### 1.1 The save path

The structured save keeps the protections of every existing save:
- a verified user, and a question the person's own analysis really asks;
- the daily limit, taken under the advisory lock;
- `answerProblem` on the description: instructions, templates, quotes, lists, and evaluator remarks (P1).

It adds:
- **E2:** it refuses (`already_answered`) when a free-text answer, an entry or a denial already counts for the question. It replaces only an earlier structured answer.
- **No evidence id**, so nothing can cite a structured answer.
- **Events record the choice, never the person's words.** "Part question done" is recorded with the approved part wording.

### 1.2 The UI

The question card opens the structured form instead of free text only when the flag is on.

The form:
- native radios and checkboxes in fieldsets with legends;
- 44 px targets;
- hints linked by `aria-describedby`;
- an error summary at the top that receives focus, plus per-field errors with `aria-invalid`;
- one column below 640 px;
- nothing preselected;
- what was chosen or typed is kept when the server turns the answer away.

Saved structured answers show the person's own choices, the note "This kind of answer doesn't change the match yet.", the open plain questions, "Change this answer", and Revoke / Delete.

### 1.3 The questions (E3, E4)

The person never sees what the reader found.

| Situation | Question | Buttons |
|---|---|---|
| A ticked part the description doesn't show | "You ticked “Repairing residential plumbing”. What did you do yourself?" | "Add to my description" / "Leave it as it is" |
| A ticked part others' words or delegated work name | "Your description mentions other people doing “…”. Did you also do some of it yourself?" | "Yes, I did some myself" (edit) / "No, others did it" (unticks the part, as the person's own edit) |
| The description gives the work away, or denies it (F6) | "Your description says someone else did this work, or that you didn't. You can change your choice or your description." | — |
| Not plainly English (D3) | "We can't read this description, so your choice counts on its own." | — |

Each part question is asked **once**: answering or leaving it records it.

## 2. Validation

| Gate | Result |
|---|---|
| **Flag off: behaviour unchanged** | Browser specs on a flag-off server: clarification, match and dark-mode forms pass; the review and structured specs skip as designed. Unit and integration suites pass. Engine and follow-up sets: §2.1 |
| **Flag on, structured answers saved: verdicts unchanged** | Integration test: a requirement's verdicts are identical before and after saving a "did it myself" answer whose description **would give Supported as free text**, plus a "haven't done this" answer. The same holds rerun with the flag off. Structured "haven't done this" is never a denial. A part-question answer and corrections change nothing |
| **No credited answer silently replaced (E2)** | Refused with `already_answered` when a free-text answer or a denial counts. That answer stays ACTIVE and its verdict is unchanged |
| **Nothing reaches Supported on its own** | Exhaustively: every choice × frequency × recency × ticks, with no text, unread text, or text not showing the parts → never Supported (rule table). A description showing only some ticked parts → not Supported. `readStructuredAnswer` is called nowhere in the app (new guard test) |
| **All 33 split mappings** | Each links to itself with its approved parts. P1≠P8 and P13≠P14, though `questionKey` merges them (documented in the test). None of the 76 requirements kept whole links. Single-part requirements don't link. Other wordings fail closed |
| **Form and validation** | Every accepted submission satisfies the database CHECK (restated in the test); missing or extra answers are refused; part wording always comes from the approved list |
| **Accessibility (browser, local)** | `e2e/job-structured-form.spec.ts` passes. It covers the 8 unselected radios in a labelled group, choosing with the keyboard (Space), progressive fields, an invalid submission (error summary focused, field `aria-invalid`), saving, the verdict still Not enough information, the plain follow-up asked once, 375 px with no sideways scroll, dark mode, and permanent deletion |
| Unit / integration | **2,978** pass (25 new) / **191** pass (8 new) |
| TypeScript, `prisma validate`, sealed guard (11 of 11), parts validate, recognition parity (284 rows) | Clean; pass |
| Lint | 1 existing warning (`tests/eval/run-eval.eval.ts`), unchanged |
| Unchanged files | The reader, recognition and its data, the engine, the rule table, the consistency module, the save-time check, schema and migrations; `activeAnswers` still reads formVersion 1 only |

### 2.1 Engine and follow-up sets

Compared with the D.2 (`b3d3e0e`) run. All five runs exited 0.

| Suite | Rows | Changed |
|---|---|---|
| Engine basis | 2,121 | **byte-identical** |
| m11_followup dev / blind | 40 / 80 | 0 / 0 |
| m11_followup2 blind | 100 | 0 |
| m11_followup3 blind | 120 | 0 |

### 2.2 Guard tests updated (none weakened)

The three isolation guards now allow exactly the Stage E files, and gained stricter checks:

| Guard | Change |
|---|---|
| Rule table | The import must match the module path exactly. The Stage E files may use only types, plus `requirementAsks` in the form model. **New:** `readStructuredAnswer` is called nowhere in the app |
| Consistency module | Allowed only on the save path (audit state) and in the form model. `analysis.ts` must not use it |
| Recognition | Allowed only in the split matcher and the form model. The matching path (`analysis.ts`, `answer-review.ts`, `engine.ts`, `follow-up-reply.ts`) must not reach it |

## 3. Notes and deviations

- **One browser spec fails when the review flag is on.** `job-clarification.spec.ts` drives the basic clarification panel, which the page hides whenever the review is on (`!review && …`, unchanged). It passes with the flags off. The review spec runs only when `.env` turns the review on, which this stage didn't change.
- **The F6 contradiction check is narrow.** "Our plumbers do all of the installs and repairs; I book the appointments" isn't called a contradiction, because the others' clause doesn't name every requirement term. Each ticked part then gets its own question, so nothing is credited. This is recorded in a test.
- **A local launch entry** (`careeros-structured-3100`, root `.claude/launch.json`) starts a production build with both flags set for that process only. `.env` is unchanged.

## 4. Prerequisites for Stage F (not done here)

- Reading formVersion 2 answers through the rule table; how `transferred` and the per-part answers feed it.
- **Reader limitations** (Stage D.2 report §4; design §7):
  - "My boss sends **me** out…": a mismatch, and parts read as others' work. **This must be fixed** before `transferred` or the mismatch can affect verdicts.
  - A causative in the same statement makes the statement read as overseeing.
  - Greedy send-to removal.
  - "I run the crew…, and I repair…".
- An audit column recording the recognition version (a migration).
- Follow-up integration for part replies.
- The production migration for the Stage 1 schema (separate approval).
