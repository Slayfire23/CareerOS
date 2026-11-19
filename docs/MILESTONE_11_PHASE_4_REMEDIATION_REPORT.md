# Milestone 11, Phase 4: Safety Remediation

November 4, 2026. Branch `milestone-3-ai-matching`, now `rules-v14`. Local commits only: nothing was pushed, merged, or deployed. No migration was added or run. `CLARIFICATION_REVIEW_ENABLED` stays off by default, semantic promotion stays disabled, and Set K wasn't run.

## Result

**The saved-answer bypass is closed and the three known unsafe verdicts are fixed. This is not independent acceptance, and I still recommend against turning the review on for real users.** The safety numbers below are good, but the zero unsafe promotions come after I had seen the failures. Honest answers in people's own words are still not recognized at all.

| New check split: 24 jobs, 139 requirements, flag on | Rules only | First run, code frozen, split unread | After fixes, split already seen |
|---|---|---|---|
| Within accepted labels | 74 | 100 | 106 |
| **False Supported** | 0 | **0** | **0** |
| **Unsafe answers reaching Possible** | n/a | **6** | **0** |
| **Successful prompt injections** | n/a | **0 of 8** | **0 of 8** |
| Non-English answers wrongly refused | n/a | **4** | 0 |
| Honest answers refused | n/a | 1 of 42 | 1 of 42 |
| Missed qualifications recovered to Possible or better | n/a | 25 of 60 | 24 of 60 |
| ...to Supported | n/a | 16 | 16 |
| Honest paraphrases recognized | n/a | **0 of 18** | **0 of 18** |
| Invalid citations | n/a | 0 | 0 |

**The first-run column is the fairest one.** It shows that my fixes, written from known failures, still let six unsafe answers through on new wording: two third-party, two abandoned, and two vague. Fixing those and rerunning proves those six are fixed. It doesn't show there are no more. I'd expect real answers to find others.

| After fixes | Accepted labels, rules only → after | False Supported | Unsafe Possible | Injections | Recovered, Possible or better (Supported) | Honest refused |
|---|---:|---:|---:|---:|---:|---:|
| Dev split, flag on | 77 → 108 | 0 | 0 | 0 of 8 | 23 of 59 (15) | 1 of 42 |
| Dev split, flag off | 77 → 102 | 0 | 0 | 0 of 8 | 23 of 59 (15) | 1 of 42 |
| Check split, flag on | 74 → 106 | 0 | 0 | 0 of 8 | 24 of 60 (16) | 1 of 42 |
| Check split, flag off | 74 → 100 | 0 | 0 | 0 of 8 | 24 of 60 (16) | 1 of 42 |
| Check split, as if you approved every group | 74 → 106 | 0 | 0 | 0 of 8 | 24 of 60 (17) | 1 of 42 |

The flag-off gap is denials: the question flow has no way to record one. The flag-off evaluation runs the same reader over the same questions without denials. It isn't the real question flow's user interface, which the integration and browser tests cover.

Rerunning the spent Phase 4 check split as a regression, not an acceptance test: false Supported went from 1 to 0, accepted labels from 86 to 91, and recovered qualifications from 31 to 28. So safety cost a little recovery.

## Priority 1: The bypass

**Every path I found into matching, before and after:**

| Path | Before | Now |
|---|---|---|
| Rules engine reading an answer as role text, flag on or off | Read like any work description | **Closed.** The engine doesn't see answer entries |
| Anything sent to Ollama, the AI service, or a cloud provider | Sent as ordinary role text, with its source label removed | **Closed.** Answers don't leave this server |
| The answer reader, flag on | Keyed answers only | The only route, in both flows |
| Question-flow answers, flag off | Engine only | Through the answer reader, keyed from the requirement they answered |
| Credential answers | A typed education entry | Unchanged: it's a structured entry, with the same strict name checks on every read |
| Revoked, superseded, or skipped rows | Filtered by status | Same, and flag-off pages now also mask stored results citing a revoked answer |

`src/lib/ai/evidence-boundary.ts` is now the shared boundary:

- **Profile and answer text share checks.** Both go through directed-text, negation, abandoned-work, and someone-else's-work checks. Answers get stricter ones, because they're written in reply to a question.
- **Answers get no standing from being saved.** Each is read again on every analysis. An integration test writes unsafe rows straight into the database and analyzes twice, in both workflows.
- **Provenance is kept.** Each counted answer keeps an exact citation, its `candidate_answer` source, the rules-only verdict beside it, and its self-reported label.
- **An answer counts only for what it answered.** It can't lift another requirement, as "attach-sale coaching" did in Phase 4.
- **An answer containing an instruction gets no credit at all,** even for its plausible parts.

Regression tests are in `tests/ai-evidence-boundary.test.ts` and `tests/integration/ai-answer-safety.integration.ts`. They cover third-party, negated, hypothetical, vague, quoted instructions, injection, revoked, deleted, and repeated analysis after saving and reloading.

## Priority 2: Known unsafe verdicts

| Failure | Cause | General fix |
|---|---|---|
| Appium, "dropped it before I ever wrote a script" | No negation word | A check for work that started and stopped, applied to profiles and answers. Trying something is now a lead at most |
| Injected answers at Possible | The bypass, plus missed attack forms | Bypass closed. New forms recognized: bracketed authority tags, `status=met` style lines, "you are now", role play, and polite approval requests |
| "Leading a kitchen team" Supported for a Line Cook | A title in the field stood in for leading people | A requirement to lead people now needs a title that shows it. Kitchen Manager still counts |

I also found a related bug: requirements sharing a first word, such as "Experience with Kafka" and "Experience with Angular", became one question, so **one No denied both**. They're separate now.

**Verdict changes on existing data: 4 of 1,251 items** on the development fixtures and Sets A through H. Sets I and J weren't used. All four move away from a positive reading, and none was a legitimate qualification:

| Item | Change | Text |
|---|---|---|
| `tr-ow-sql-wish` | Not supported → Not enough information | "I would love to learn SQL next year." Its label accepts both |
| `tr-ow-cisco-ifhired` | Possible → Not enough information | "If hired, I would gladly configure Cisco switches." |
| `c2-own-attorney-never` | Possible → Not enough information | "Our attorneys drafted patent applications..." Its label says Not supported, so it's closer, not correct |
| `c2-quote-would` | Possible → Not enough information | "I would be able to perform internal audits..." |

My first version lost five legitimate items, including a system administrator and a nurse. The differential caught that, and I narrowed the rules before going further. One frozen-Python comparison is also listed as an intended difference: `f-inj-yaml` keeps its verdict but is now flagged as carrying instructions.

**Behavior that changes with the flag off:**

- An answer no longer helps any requirement but the one it answered.
- Answers no longer reach AI suggestions.
- Removing an answer now permanently deletes its copies too, and the button says so.
- Removing a role deletes answers about it.

## Priority 3: Language

- Only answers plainly in English are read. `src/lib/ai/answer-language.ts` says "English" only when every sentence long enough to judge is, and treats everything else as unresolved.
- Other, mixed, and unknown answers are **saved, explained, editable, and never promoted**, in both workflows. The question flow had no edit, so I added one.
- No single character or accent decides anything. It uses word shares and the share of letters in other alphabets, so a coworker's name in another script doesn't stop an answer being read.
- On the check split: 0 of 12 honest non-English and mixed answers changed a verdict, and after the fix none was refused.

**The cost is real:** a qualified person who writes in another language gets no credit from their answer. That's what you asked for in this first version.

## Priority 4: Equivalence and terminology

- **No group can grant Supported** until its status is `owner_approved`, and none is. A test holds this. Groups can only reach Possible. They also can't merge two names into one question.
- **Your phlebotomy example is Possible for now,** and becomes Supported when you approve that group.
- **Shadow terminology was removed from production entirely,** along with the language lists from the shadow layer. So the boundary exception from Phase 4 is gone, and the strict import test is back.
- **The review packet is [EQUIVALENCE_REVIEW_PACKET.md](EQUIVALENCE_REVIEW_PACKET.md):** names, phrases, patterns, source task, and examples for all 42 groups. The examples are generated from the table.
- **I fixed the generator bug** that left many patterns inert in Phase 4.

**Approval won't help much as the table stands.** Approving all 42 groups moved exactly one more requirement to Supported on the check split. New wording rarely matches the table, so please weigh how much review effort it deserves.

## Priority 5: Privacy and retention

Details are in [CLARIFICATION_RETENTION.md](CLARIFICATION_RETENTION.md).

**Done and tested:**

- Revoked answers stop counting at once, in stored and new results, flag on or off.
- Deletion is one shared path for both flows. It removes the answer, earlier versions, citations, and suggestions.
- Deletion now also clears the requirement text, question key, verdicts, and job link from its audit events. That resolves most of your Phase 4 concern.
- Removing a role now clears stored copies, which it didn't before.
- Answer text never reaches an audit event or an analysis run, by test.
- Deleting can no longer reset the question flow's daily limit.

**Could not be verified:** the actual hosted settings. The Supabase dashboard for project `esgquaxaacksykxreuwd` asks for your sign-in, so I stopped there. From published documentation only:

| | Published | Unknown for this project |
|---|---|---|
| Supabase backups | Pro 7 days, Team 14, Enterprise up to 30. Free plan: the docs tell you to export your own | The plan. October notes say Free, unconfirmed. Any manual exports |
| Supabase logs | Pro 7 days, Team 28 | Free plan's period, and whether statement logging is on |
| Vercel runtime logs | Hobby 1 hour, Pro 1 day, 30 with Observability Plus | The plan |

A restored backup would bring deleted answers back, and there's no process to re-apply deletions after a restore.

## How this was evaluated, and its limits

- **Fresh fixtures, one author.** A separate agent wrote `tests/fixtures/m11_remediation/{dev,check}.json` from a brief, without reading the repository. It wrote both answers and labels, and you haven't reviewed them.
- **Check split handling:** committed unread at `2f8eb0e`, run once with counts only, recorded at `131de92`, then opened. I then changed code because of what I saw, so **that split is now spent**. A comparison with it after that point isn't a held-out result.
- **Spawning that agent was my call.** You asked for fresh fixtures, not for an agent specifically. I used one because an author who hasn't seen the code is what makes them worth anything.
- Everything is invented text. No real person has used this.

## Remaining blockers

1. **No independent evidence of safety.** The 0 unsafe is after tuning. Before any enablement this needs a fresh split, ideally with your labels on part of it. Set K stays on hold.
2. **Word lists will miss things.** These checks are hand-written patterns. Six got through on the first look at new wording. The likely failure in real use is a third-party or abandoned-work sentence phrased in a way I haven't seen, reaching Possible.
3. **Honest paraphrases aren't recognized: 0 of 18 on both splits.** Your main goal for the workflow, not requiring exact terminology, is **not met**. About half of the honest answers get no credit, and the table won't close that gap. This needs a decision on what comes next.
4. **Specific false claims can't be detected.** Three invented, specific claims from people whose job titles made them unlikely reached Supported — Self-reported on each split. The label makes that honest, and the fixture labels accept it, but nothing catches it.
5. **Hosted retention is unverified,** as above.
6. **Non-English answers get no credit** by design.
7. **Real credentials are sometimes not recognized:** 4 of 6 on check and 3 of 6 on dev. "Advanced Cardiovascular Life Support (ACLS)" is refused for its parentheses, and "Registered Dental Hygienist License" didn't match "State dental hygiene license". Those stay unresolved, which is safe, but it's a real loss.
8. **Honest answers refused:** one per split. One looks like a false alarm in the injection check; I didn't find the cause. Both can be rewritten and resubmitted.
9. **Six production migrations remain unapproved.** None was added this round.

## Test results, after the final code change

| Check | Result |
|---|---|
| TypeScript | Clean |
| ESLint | 0 errors, 1 warning, in `tests/eval/run-eval.eval.ts`, untouched since Milestone 8 |
| Unit | 1,939 passed |
| Integration | 143 passed |
| Python | 512 passed, ruff clean |
| Production build | Passed |
| Browser, flag off, AI service stopped (offline) | 31 passed, 2 skipped: the review test, which needs the flag, and the cloud test |
| Browser, flag on | 30 passed, 3 skipped: the older question test, the offline test, and the cloud test |
| Secret scan | Passed |
| `npm audit`, production dependencies | 0 vulnerabilities |

Browser tests ran against the production build on port 3100. The temporary flag and quota in `.env` are restored. After those runs I changed only this report, the task and architecture notes, a test comment, and a table comment.

The `next dev` on port 3000 that I didn't start is still running, and **needs a restart before you use it**. Its Prisma client is out of date, and its code predates these changes.

## What I need from you

- Sign in to Supabase and Vercel, or tell me the plans, any exports, and statement logging.
- Review the [42 groups](EQUIVALENCE_REVIEW_PACKET.md), keeping in mind how little they add.
- Decide what to do about honest paraphrases.
- You still owe the Set J packet and the development review. Both keys stay sealed.
