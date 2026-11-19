# Milestone 11, Phase 5: Local Follow-Up Workflow

November 5, 2026. Branch `milestone-3-ai-matching`, now `rules-v16`. Local commits only: nothing was pushed, merged, or deployed. One new migration was applied to local Supabase and the test database only, and no production migration ran. Every flag is off by default, semantic promotion stays disabled, Set K wasn't run, and no answer left this machine.

## Result

**The delegation blocker is fixed, and the follow-up workflow works end to end for local testing. On the blind split, follow-up replies caused no unsafe promotions. The existing answer reader did: 2 false Supported and 7 unsafe Possible out of 80, by the independent labeler's judgment.** That's the main blocker, and it isn't new to this phase: it's how the reader already reads answers. These numbers are against an agent's labels, not yours, and they may move once you've labeled.

| Blind split, 80 scenarios, first and only run, counts only | Result |
|---|---:|
| **False Supported** | **2** |
| **Unsafe Possible** | **7** |
| ...from follow-up replies | **0** |
| Bad replies accepted | 0 of 5 |
| Good replies accepted | 3 of 3 |
| **Prompt injections that changed an outcome** | **0 of 5** |
| Non-English answers promoted | 0 |
| Honest answers refused | **3 of 30** |
| Legitimate qualifications the rules missed | 29 |
| ...recovered by the answer reader | 6 |
| ...recovered by a follow-up reply | 3 |
| ...still missed | **20** |
| Honest paraphrases recognized | 5 of 15 |
| Follow-up questions asked | 8 |
| ...useful, about the person's own qualifying work | 4 |
| ...about work that wasn't qualifying | 4 (harmless, but wasted) |
| Repeated questions | 0, with 1 repeat avoided |
| Invalid citations | 0 |
| Latency per model call: median, 95th percentile, max | 4.2, 6.7, 12.1 s |

The dev split, used for development, ended with 0 false Supported, 0 unsafe Possible, 0 honest refusals, 5 questions (4 useful), and 2 of 3 good replies accepted. That's after I fixed what it showed me, so the blind numbers above are the ones to trust.

**What this says:** follow-ups are safe as built, but they recover little. Only 3 of 29 missed qualifications came back that way, because the model and the boundary between them suggest few questions. The bigger problem is the reader's word lists on new wording. I haven't opened the blind results, and I won't until you've labeled.

## Priority 1: The delegation blocker

"A contractor we hired did the actual move; I gave him the logins." got through because my clause logic jumped to "we hired" and lost the real subject, "A contractor". It's fixed with a general ownership reading, applied to answers and replies, in `rules-v16`:

| Kind | Example | Counts as doing the work? |
|---|---|---|
| Personally did it | "I run payroll for the crew every other Friday." | Yes |
| Delegated | "I paid a locksmith to…", "I had the crew do…", "I brought in a firm…" | No |
| Supervised or approved | "I oversaw tile setting…", "I approved the forecasts…" | **Only if the requirement asks to supervise or hire** |
| Assisted | "I assisted the nurse with…", "I gave her the logins…" | **Only if the requirement asks to assist** |
| Observed | "I shadowed…", "I observed…" | No |
| Mixed | "I did the framing and Luis did the wiring." | Only the person's own clause counts: framing yes, wiring no, in either order |
| A described thing with "we" inside | "A contractor we hired did the move." | No: the subject is the contractor |

Tests cover each kind and the counter-cases that must still count, such as "I did wound care for her" and "invoice processing for our contractors". **No engine verdict changed on 1,251 existing items.**

## Priority 2: The workflow

It's behind `FOLLOW_UP_WORKFLOW_ENABLED`, off by default. It also needs `CLARIFICATION_REVIEW_ENABLED`, it's refused on Vercel, and it talks only to `qwen3:8b` on this machine.

| Your step | How it's built |
|---|---|
| 1–2. Analyze the answer with qwen3:8b | After an answer is saved and the rules have re-read it, and only if it's still Not enough information |
| 3. A specific, open-ended question | Written by code: *You said "…". What, if anything, in that work involved "…"? Describe what you personally did. If it didn't, you can choose No or Skip.* At most 3 open per job |
| 4. Shown to the person | In the review section, labeled as suggested by a local model, with a note that it changes no result |
| 5. Answer, deny, skip, correct, edit, revoke | All built. Deleting a reply removes its words and copies, and the question doesn't return |
| 6. The shared boundary | Every reply is read by `rules/follow-up-reply.ts`, with no model. A bare yes, an echo of the question, or an instruction is turned away and the text is kept. Delegation, contradiction, another language, or a credential is saved but stays unresolved, with the reason shown |
| 7. Possible at most | A separate basis, `candidate_follow_up`, which the validator rejects at any verdict but Possible |
| 8. What changed and why | The reply shows its reason, the change history lists *Not enough information → Possible*, and the finding names its source. **Gap:** the confirmation message disappears when an answered card moves, so the reason only appears on reload |
| 9. No repeats | One question per requirement per person, enforced by the database, and none about words already asked about |
| 10. Deletion and provenance | The table holds offsets into the answer, not its words. Deleting an answer or its role removes replies and their copies. Revoking an answer stops its reply. Correcting an answer closes an open question. Turning the workflow off masks replies in stored and new results |

**AI never assigns a verdict.** The model reads only the original answer, and only to suggest a question. Code decides whether to ask, and code alone reads the reply. Nothing that decides a verdict imports the model client, by test. The 42 unapproved groups still can't grant Supported.

**Not covered:** the workflow reads clarification answers, not resume text. Your goal mentions resumes too. That would be a separate step, with its own deletion story.

## Priority 4: Hosted fallback

Hosted CareerOS gets no model: the workflow refuses to turn on under Vercel or for any non-local address, by test. With the workflow on and the model down or returning garbage, no question appears, the answer stays unresolved, and the page says: *"CareerOS couldn't look for related work in your answer just now, so it stays unresolved. Nothing was assumed."*

## Priority 3: The blind packet

**[PHASE5_BLIND_LABEL_PACKET.md](PHASE5_BLIND_LABEL_PACKET.md)** has 30 of the 80 blind scenarios, a fixed spread chosen by position. A script wrote it, and I haven't read it.

- **Separation:** one agent wrote the scenarios, a second labeled them from a copy without types, and I wrote the code. All three are the same model family, so this separation is practical, not complete.
- **Engine predictions:** stored as counts only, in `ai-service/evals/reports/m11/followup/blind-first-run.json`. No per-scenario result exists anywhere yet.
- **After you label:** I'll compare your labels with the agent's and then with the engine's results. Only then would I open the blind details for error analysis.

## Remaining blockers

1. **The answer reader on new wording:** 2 false Supported and 7 unsafe Possible out of 80 blind scenarios, against agent labels. This decides whether anything here can go further.
2. **Little recovery:** 20 of 29 missed qualifications stay missed, and 10 of 15 paraphrases weren't recognized. Opening verbs like "look" or "touch" read as saying little, and some honest sentences don't clear the boundary.
3. **Honest refusals:** 3 of 30 on the blind split.
4. **Half the questions were wasted** on work that wasn't qualifying.
5. **No live-model browser test.** The browser test uses a stand-in for the model so it's repeatable. The model itself was measured by the evaluation, and the database flow by integration tests with the model faked.
6. **Unchanged:**
    - Hosted retention needs your sign-in to verify.
    - The 42 equivalence groups await review.
    - **Seven** production migrations await approval, counting this round's new local one.
    - The laptop must be on for any of this.

## Mistakes I made

- **The implementation commit `04a61a1` held only fixtures.** One path in my add command didn't exist, so git added nothing else, and I didn't check before committing. `139272f` holds the code. It's the exact working tree the blind run used, unedited between, and the tests had passed on it.
- **Browser test fixes.** My first follow-up browser test expected messages that disappear when a card moves. I fixed the test, and that exposed the UX gap in step 8.

## Test results, after the final code change

| Check | Result |
|---|---|
| TypeScript | Clean |
| ESLint | 0 errors, 1 warning, the same old one |
| Unit | 2,122 passed |
| Integration | 176 passed, 18 of them for this workflow |
| Python | 512 passed, ruff clean |
| Production build | Passed |
| Browser, review and follow-ups on, model stand-in | 31 passed, 3 skipped, including the new follow-up test |
| Browser, all flags off, AI service stopped | 31 passed, 3 skipped |
| Secret scan, `npm audit` | Passed, 0 vulnerabilities |
| Engine verdicts against `rules-v14`, 1,251 items | 0 changed |

`.env` is restored with every flag off. The `next dev` on port 3000 needs a restart before use, more so now that the Prisma client has a new table.

## What I need from you

1. **Label the 30 scenarios** in the packet.
2. **Then decide** whether to open the blind details, and whether the reader's word-list approach should keep being patched or be rethought, given blocker 1.
