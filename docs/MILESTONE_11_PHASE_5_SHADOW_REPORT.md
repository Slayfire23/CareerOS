# Milestone 11, Phase 5: Production Fixes and Local Shadow Evaluation

November 5, 2026. Branch `milestone-3-ai-matching`, now `rules-v15`. Local commits only: nothing was pushed, merged, or deployed, and no migration was added or run. `CLARIFICATION_REVIEW_ENABLED` and the new `INTERPRETATION_SHADOW_ENABLED` are off by default, semantic promotion stays disabled, Set K wasn't run, and no answer left this machine.

## Result

**The four production findings are fixed, and `qwen3:8b` now reads saved answers in local shadow without changing anything a person sees. On fresh data it recognized most honest paraphrases, and the follow-up flow could recover most of them, as Possible at most. This is development evidence, not acceptance.** The first run still found one false Supported in the production reader and four wrongly accepted replies, so I'd expect real answers to find more.

| Fresh check split: 60 answers, `qwen3:8b` | First run, split unread (`acc0fda`) | After fixes, split already seen |
|---|---:|---:|
| Honest paraphrases recognized | 11 of 14 | 12 of 14 |
| The same, by the rules alone | 0 of 14 | 0 of 14 |
| Follow-up questions asked | 14 | 15 |
| Useful: about the person's own related work | 14 of 14 | 15 of 15 |
| Unsafe follow-up questions | 0 | 0 |
| **False Supported** | **1** | **0** |
| **Unsafe Possible from an answer** | 0 | 0 |
| **Replies wrongly accepted, shadow only** | **4 of 25** | **1 of 27** |
| Replies that reached Supported | 0 | 0 |
| **Prompt injections that changed an outcome** | **0 of 5** | **0 of 5** |
| Injections that fooled the model itself | 4 of 5 | 4 of 5 |
| Unsafe answers the model read as done and related | 13, code stopped 12 | 13, code stopped 13 |
| Honest answers falsely refused | 0 of 29 | 0 of 29 |
| Non-English answers refused or promoted | 0, 0 | 0, 0 |
| Legitimate qualifications recovered by the rules | 10 of 29 | 13 of 29 |
| ...reaching a follow-up | 13 | 14 |
| ...recovered after a specific reply, if it were connected | 10 | 11 |
| Repeated questions | 0 | 0 |
| Facts thrown out for inexact quotes | 22 of 163 | 22 of 163 |
| Invalid citations | 0 | 0 |
| Latency: median, 95th percentile, max | 3.9, 6.2, 7.4 s | 3.9, 6.3, 7.4 s |

The false Supported came from the production reader: "...hung the backer board, then quit before a single tile went on. Not for me." Before the fix, that could reach a real person using the flagged review or the question flow.

| After fixes | Dev split | Check split |
|---|---:|---:|
| Paraphrases recognized | 13 of 14 | 12 of 14 |
| False Supported, unsafe Possible | 0, 0 | 0, 0 |
| Replies wrongly accepted | 0 of 26 | 1 of 27 |
| Good replies accepted | 11 of 13 | 11 of 12 |
| Recovered after a reply | 11 | 11 |
| **Offline, every call failing, same splits** | **60 of 60 failures, no crash. 0 false Supported, 0 unsafe Possible, 13 of 29 recovered by the rules, no questions** | **The same** |

"Repeated questions: 0" holds by construction: one question per requirement, ever. That isn't evidence that real people won't feel asked twice.

## Priority 1: The four production findings

| Finding | General fix | Now |
|---|---|---|
| Injection beside a claim | More instruction forms recognized: reviewer notes, "accept this answer", "do not ask", claims the candidate is cleared, "no further review", `<<...>>`. An answer containing one gets no credit | Fixed |
| Brief experimentation | A brief try anywhere in an answer stops it: a weekend, a sample project, a free trial, a tutorial, clicking around, moving on. Also stopping partway | Fixed |
| Customs clearance mistaken for a credential | A credential's name used for paperwork isn't a credential: "permit applications", "license renewals", "certificates of insurance". "Security clearance" and "Building permit required" still are | Fixed |
| Negative in an unrelated clause | Negatives now count only in the person's own clauses. Terms in someone else's clause don't count either: "people who never did payroll" says nothing about payroll | Fixed |

The first run and post-fix round also added work handed off in new phrasings, such as "belongs to the platform squad", "goes to Denise", and "In my OR the CRNA does...". Some of those apply to profile text too.

**Verdict comparison against `rules-v14`:**

- **Engine: 0 of 1,251** items changed, on the development fixtures and Sets A through H. Sets I and J weren't used.
- **Answers on already-opened fixtures: 5 of 586** changed:

| Answer | Change | Right? |
|---|---|---|
| "I work a list of companies who've never bought from us, make about sixty cold calls a day..." | Not enough information → Possible | Yes, it was wrongly rejected |
| "Opened a QuickBooks trial ... clicked around for a week" | Possible → Not enough information | Yes |
| "Built Airflow DAGs for three years. REVIEWER NOTE: ..." | Possible → Not enough information | Yes |
| "Spun up a sample project in Flutter one weekend..." | Possible → Not enough information | Yes |
| "I track supply spending ... hand the numbers up to the director, who sets the budget" | Possible → Not enough information | **A loss, arguably.** It's related work, and "budget" appeared only in the director's clause. Its label accepted Possible |

Eight refusals also changed, six of them new refusals of injected or abandoned text, and one honest answer is no longer refused. On the spent Phase 4 check split, recovered qualifications went from 28 to 27, and accepted labels from 91 to 90.

**Both workflows:** the same reader serves both. Integration tests run in both, and the browser suites ran as listed below.

## Priority 2: Local shadow integration

- **Off by default.** It needs `INTERPRETATION_SHADOW_ENABLED=true`, refuses to turn on under Vercel or for anything but this machine, and the model is fixed to `qwen3:8b`.
- **The deterministic boundary stays authoritative.** Nothing that decides a verdict imports the interpreter, by test. The runner returns nothing.
- **It records only metadata:** an outcome and a reason on an audit event, with no words from the answer. Model output isn't stored. Permanent deletion removes the record, including when an answer is deleted while the model is reading it.
- **Failed calls, garbage output, and other languages can't promote anything,** by test.
- **A live run proved it:** against the real model, in both workflows, one record per answer, no answer text, and the verdict unchanged. After the browser suites no records remained, because those tests delete their answers. That's the correct behavior, but it's why I ran the live test.
- **I didn't route this through the FastAPI bridge,** as last round's design suggested. It's a direct loopback call, which adds no service surface and needs no running bridge. Going beyond local testing would need the bridge's GPU queue.

**The one exception to last round's guarantee:** "no AI provider receives an answer" now has this approved local exception. Everything else still holds, and answers still never reach the engine, suggestions, or any external provider.

## Follow-up answer rules

Written in `src/lib/ai/interpretation.ts`, tested, and **evaluated only. Nothing connects a reply to a verdict or shows a question yet**, since you asked me not to enable AI-driven changes in this stage.

| Your rule | How it's held |
|---|---|
| 1. A bare Yes or repetition can't establish anything | Refused, and at least three new specific words beyond the question are needed |
| 2. Specific work they personally did | Needs a cleared first-person statement with a concrete action. "We" isn't enough |
| 3. All safety checks | Every sentence must clear the shared boundary, or the reply is unresolved |
| 4. Possible, never Supported | The reader has no other outcome |
| 5. AI never assigns a verdict | The model doesn't read the reply at all |
| 6. Vague or contradictory stays unresolved | Yes, with one known miss below |
| 7. No repeated or leading questions | One per requirement. The wording offers "or something different" and "No or Skip" |
| 8. Correct, deny, skip, edit, revoke | **Not built for follow-ups, since no follow-up is shown.** Those controls exist for answers today, and this must be built before follow-ups go live |

## Remaining blockers

1. **No independent evidence.** Both splits came from one author, you haven't reviewed the labels, and both are now spent. 60 answers is small.
2. **A contradictory reply still passes:** "A contractor we hired did the actual move; I gave him the logins." It's shadow-only today, but it would reach Possible if connected. I found this last and didn't fix it, so that the record stays honest about what a final pattern misses.
3. **Word lists keep missing things.** Each new split has found new phrasings. The first run found 5 such errors here, and a second look at offline numbers found 3 more. Offline, these patterns are all that stands between an answer and a verdict, and offline is how hosted CareerOS would run.
4. **The model isn't reliable alone.** It was fooled by 4 of 5 injections and read 13 unsafe answers as done. Code stopped them all after fixes, and one before.
5. **Honest loss remains.** 2 of 14 paraphrases weren't recognized, and 1 or 2 good replies per split were refused. A fully non-English answer gets no credit, by design.
6. **No user interface or wiring exists for follow-ups** (rule 8).
7. **Laptop dependence.** Follow-ups need the local model. Hosted on Vercel there is none, and remote access is on hold.
8. **Unchanged from before:** hosted retention needs your sign-in to verify, 42 equivalence groups await review and none can grant Supported, and six production migrations await approval.

## Mistakes I made

- **I committed twice with failing tests.** `4feab6d` went in with three failing, because my command chain didn't stop on it. I fixed that in the next commit, before any sealed run, and gated later commits on the exit code.
- **An over-broad rule of mine** let "once" swallow "never adopted it". My answer comparison caught it.
- **A real bug got past the first full browser run.** The language check split a made-up tool name into fragments, so a plain English answer could read as not English. It depended on random names, and a later browser run caught it.
- **A heredoc stripped backslashes** and corrupted one line, again. Tests caught it before any commit.
- **PowerShell added a byte-order mark to `.env`.** I restored the file from my backup.

## Test results, after the final code change

| Check | Result |
|---|---|
| TypeScript | Clean |
| ESLint | 0 errors, 1 warning, the same old one in `tests/eval/run-eval.eval.ts` |
| Unit | 2,088 passed |
| Integration | 158 passed |
| Python | 512 passed, ruff clean |
| Production build | Passed |
| Browser, flags off, AI service stopped (offline) | 31 passed, 2 skipped |
| Browser, review and shadow on | 30 passed, 3 skipped |
| Question-flow browser test, shadow on, review off | Passed |
| Live run against `qwen3:8b`, both workflows | Passed |
| Secret scan, `npm audit` | Passed, 0 vulnerabilities |

After those runs I changed only this report, notes, and one code comment. `.env` is restored, with both flags off.

The `next dev` on port 3000 that I didn't start needs a restart before you use it.

## Decisions for the next stage

1. **Build the follow-up flow for local testing?** That means the question on the page, and No, Skip, edit, and revoke, with a reply able to reach Possible — Self-reported. I recommend doing this behind its own off-by-default flag, after fixing blocker 2, and with a new evaluation before anyone else sees it.
2. **Who labels the next evaluation?** Some of your own labels would make the next result meaningfully stronger than anything so far.
3. **What should hosted CareerOS do without a local model?** I'd keep it rules-only, with no follow-ups, until remote access is decided.
