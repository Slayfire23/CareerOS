# Phase 5.3 Stage F5: the match page for structured findings and choice citations

November 14, 2026. **Owner-approved scope:** F5 only. Constraints, all in force:
- all three flags stay off by default;
- no migration, no hosted Supabase, no deployment;
- no change to rules-v21, rules-v22, `splits-v1.1`, the default recognition version, the F2 decision table, or F3's validator rules;
- no new scoring;
- no sealed split was opened.

## 1. Inventory: everything that can show a structured finding or citation

| Place | What it shows | F5 |
|---|---|---|
| Match page, finding card (`page.tsx`) | Verdict label, rule source, explanation, origin note, citations, rules-only verdict | Choice citations and the origin note (§3) |
| Match page, summary counts and run history | Verdict counts | Already masked (F4); a valid choice Possible now counts with the flag on |
| Review panel: questions, "Changed by your answers", "Your answers" | Questions, before/after, the answer's own text | Unchanged |
| Saved structured answer block (`structured-answer-form.tsx`) | The person's choices and the note on the match | Note is now flag-aware (§5) |
| Structured form hint, and the save/change confirmations (`review-actions.ts`) | The same note | Flag-aware (§5) |
| Other readers (question picker, older flow, follow-ups, shadow) | Stored findings, not shown | Through `currentFindings` (F4), now with choice validity (§4) |

## 2. Files changed

| File | Change |
|---|---|
| `src/app/dashboard/jobs/[id]/match/page.tsx` | A choice citation renders as "Your choice" plus CareerOS's wording (no link, no quotation marks). An unknown citation source renders without a link instead of crashing. The origin note for a choice says it's the person's choice, not their description or profile |
| `src/components/structured-answer-form.tsx`, `src/lib/ai/rules/structured-form-spec.ts`, `src/app/jobs/review-actions.ts` | Flag-aware wording (`matchEffect`); `FormSpec.countsTowardMatch` |
| `src/lib/ai/rules/structured-apply.ts` | A valid choice-only Possible is now stored, citing its choice. `withholdChoiceFindings` now withholds only choice findings that aren't sound (§4) |
| `src/lib/ai/analysis.ts` | The rules request carries `structured_choices`. `validChoicesFor` checks stored choice citations against the current wording. Specs carry `countsTowardMatch` |
| `e2e/job-structured-matching.spec.ts` | **New** browser spec (structured matching on) |
| `e2e/job-structured-form.spec.ts` | Skips when structured matching is on: it checks the flag-off wording. The new spec covers the on state |
| Tests | Unit: `structured-apply.test.ts` (+4 net), `choice-evidence.test.ts` (guards now describe F5). Integration: F3 lifecycle and F4 matching tests updated to F5 behaviour (§7) |

No new component, class or visual pattern: the choice citation reuses the existing citation row's classes.

## 3. UI before and after

| | Before (F4) | After (F5) |
|---|---|---|
| Choice-only answer, flag on | Not stored; finding stays Not enough information | **Possible**, cited as **"Your choice"** with CareerOS's fixed wording, e.g. "Structured answer, self-reported: CareerOS hasn't independently verified it. Choice: I did this work myself. How often: Weekly. Most recently: It's part of my job now." No link, not in quotation marks (it isn't the person's words) |
| Origin note for a choice | "From your profile…" (the fallback) | "From a choice you made in a structured answer, not from your own description. Self-reported: CareerOS hasn't independently verified it." |
| Explanation | — | "From your structured answer's choice. A choice on its own counts as Possible at most; what you describe doing yourself can show more." (F-6 time claims: the claim-rule wording, with no figures) |
| Described answer showing the work, flag on | Supported, "From an answer you gave", Experience link, the person's words in quotes | Unchanged |
| Unknown citation source | Crash (`source.href` of undefined) | "Evidence" label, no link |
| Flag off | Masked (F4) | Unchanged: masked; the page looks exactly as before |

Title-only (F-5) and split behaviour are unchanged from F4: the rule table decides, the page only renders.

## 4. Choice citations: persistence and safety

**Stored, with the flag on and only through the rules.** Each structured answer's choice item goes on the rules request (`structured_choices`), never in `evidence`, and never on a request to an AI provider:
- the choices are built only when `usesRules`;
- the local-AI suggestion request is built from AI-safe evidence only.

A `candidate_choice` result is Possible only. F3's unchanged validator checks it: it must be intact, quote exactly the choice's wording, be the only citation, and come from the rules.

**Shown only when sound** (`withholdChoiceFindings` with `validChoicesFor`, on every read path):
- Possible;
- basis `candidate_choice`;
- one citation;
- that citation is the **current** wording of an **active** answer's choice.

Anything else is withheld ("This relied on a choice in a structured answer that has since changed. Run the analysis again."): a revoked, superseded or deleted answer, edited wording, a malformed id, a Supported, another basis, or other evidence beside it. With the flag off there are no valid choices, so the F-9 mask applies first.

**Lifecycle (tested):**
- correction and replacement read as revoked (masked);
- revocation is masked, and the review re-runs;
- deletion scrubs every stored citation;
- another answer's choice is never affected.

**Never Supported.** Tested for every choice, at the module (F2), the validator (F3), the pipeline and the page. In the browser, only the described answer is Supported.

## 5. Saved-answer wording

| Where | Flag off (unchanged) | Flag on |
|---|---|---|
| Saved answer block | "This kind of answer doesn't change the match yet." | "It can count toward the match when you run the analysis again, depending on what you describe." |
| Form hint | "…only add what's accurate. This kind of answer doesn't change the match yet." | "…only add what's accurate. It can count toward the match when you run the analysis again, depending on what you describe." |
| Save / change confirmations | "Saved. This kind of answer doesn't change the match yet. You can change, revoke, or delete it below." | "Saved. It can count toward the match when you run the analysis again, depending on what you describe. You can change…" |

A unit test checks the wording never promises a better verdict and has no technical terms. Correction, revocation and deletion controls are unchanged.

## 6. Accessibility and layout

Browser, production build, all three flags (`e2e/job-structured-matching.spec.ts`):
- choosing with the keyboard (Space);
- the evidence link reachable by focus and named "Experience";
- the choice row named "Your choice" with its full wording as text (no link, no quote element);
- origin notes readable as text;
- **375 px**: no sideways scroll, and the choice citation visible;
- **dark mode**: the choice wording visible;
- revocation and permanent deletion through the existing controls.

Stage E's accessibility spec still passes with the form only.

## 7. Rollback and lifecycle verification

| Flags | Verified |
|---|---|
| Off (4 states) | A stored choice Possible is masked; counts and **run-history counts** go back to Not enough information; stale `choice:` references never crash (no citation is rendered for a masked finding, and unknown sources render safely) |
| On | Valid structured findings render; a choice-only Possible shows its self-reported citation; Supported still needs a qualifying description; correction, revocation and deletion invalidate stale evidence at once |

**Updated tests (none weakened):**
- F4's "choice alone: nothing stored" and the F3 lifecycle "withheld" controls described F4's temporary withholding. With F5 they expect the choice Possible to be stored and shown with the flag on, and masked with it off.
- The "irrelevant description" tests now pin the exact rule: never Supported, and any words quoted are exactly what the free-text reader quotes for the same words. For example, "I pick up parts for the HVAC techs" is related work to the existing reader, as free text too.

## 8. Results

| Gate | Result |
|---|---|
| Unit | **3,895** pass |
| Integration | **223** pass |
| TypeScript, `prisma validate`, production build | Clean |
| Schema and migrations | Unchanged |
| Lint | 1 existing warning, unchanged |
| Sealed guard / parts validate | 11 of 11 / pass |
| Parity | 343 pass |
| Protected files | Reader, recognition, rule table, consistency, the F2 module, engine, validator, choice evidence and config: unchanged since F4 |
| Browser: flags off | Match, clarification and dark-mode specs pass; the review, structured-form, structured-matching and offline specs skip as designed |
| Browser: form only | Structured-form (Stage E) and match specs pass; the matching spec skips |
| Browser: all flags | New structured-matching spec, match, and dark-mode specs pass. `job-clarification.spec.ts` fails, as it does on any server with the review on: it drives the basic panel, which the page hides when the review is on. Recorded in the Stage E report and confirmed again on the form-only server |
| Engine basis (2,121 rows), follow-up sets (340 rows) | Engine **byte-identical** to F4; follow-up: **0 of 340** rows differ on any field (only the timing field `latency`); all five runs exit 0 |

## 9. Remaining risks and blockers

- **Not for users yet.** Enabling still needs the Stage 1 and F1 production migrations, a Stage G result, and explicit approval.
- **Choice-only Possible is a claim.** The page now says so in three places (rule source, origin note, the wording itself). Whether people read it as intended is a usability question for Stage G or later.
- **"Related work" follows the existing free-text reader.** A description the reader counts as related (as for free text) is quoted for Possible. That is the free-text standard, not new behaviour.
- **The `job-clarification` spec** can't run with the review on (pre-existing).

## 10. Ready?

Yes. F5 is ready for approval:
- every gate passes;
- the flags stay off by default, and flag-off behaviour is unchanged;
- with structured matching on, structured and choice findings render safely and accurately.

F6 hasn't started.
