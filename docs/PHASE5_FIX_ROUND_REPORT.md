# Phase 5 Fix Round (rules-v17): Report

November 5, 2026. All work is local, in commits `fcb575b`, `efc53b3`, `5fddd59`, `139799f` and `68393b8`, which have not been pushed. All flags stay off by default. Nothing was deployed and no production migration was run.

## What changed

The fixes went in as three steps, each tested and committed on its own:

1. **Corrections are read in context.** A leading "Well", "Actually" or "I mean" no longer removes credit by itself. It counts as a correction only when what follows shrinks, denies, or hands off the earlier claim. Also:
   - Handing the work to someone else ("we send it to the lab and they…") removes credit.
   - Arranging or scheduling work counts as oversight.
   - Leaving an attempt ("wasn't for me", "never used it again") gives no credit.
2. **Recognition fixes.** "Will do" in a sentence is no longer read as a remark about judging. Sentences about someone else are no longer read as the person not doing the work. Long first-person answers aren't refused as keyword lists.
3. **Brief exposure is kept, and limited.** A class, a workshop, a lunch-and-learn, or a single session is kept as a brief statement:
   - For a tool or skill, it can reach Possible at most.
   - Where the requirement asks for experience, proficiency, professional, hands-on, advanced work, or a length of time, it gives nothing.

   Owner decisions:
   - **fu-068:** a stated time longer than the listed roles now gives Possible. The question becomes "Do you have earlier experience…? Add any missing roles."
   - **fu-102:** "I set the sticky traps myself" stays limited activity, not professional pest control.
   - **Hand-offs:** replies that hand off the real work ("she did the actual layouts", "I just…") don't count.

Every corrected failure has a regression test in `tests/ai-evidence-boundary.test.ts`. The human labels file wasn't touched.

## Baseline regressions

Compared against rules-v16 on every spent fixture:

| | Result |
|---|---|
| Engine verdicts on spent sets | **0 of 1,251 changed** |
| Answer and reply readings | 16 answer verdicts, 19 replies and 5 refusals changed, out of 922. Each was reviewed, and all are intended |
| Spent remediation check | 0 false Supported, 0 unsafe Possible (unchanged) |
| Unit / integration / Python | 2,173 / 176 / 512 passed |

**No baseline regressions found.** One regression appeared during the work and was fixed before commit: a hand-off pattern briefly matched "…and run them on the analyzer" and cost three honest answers.

## Old blind split (80 scenarios, 30 with your labels)

**This split isn't independent anymore:** its failures shaped these fixes. The table shows the fixes did what they were meant to, not that they generalize.

| Against your 30 labels | rules-v16 | rules-v17 |
|---|---|---|
| Exact agreement | 6 / 30 | **8 / 30** |
| False Supported | 1 (fu-084) | **0** |
| Unsafe Possible | 0 | **0** |
| Your S or P answers credited at all | 4 / 14 | **7 / 14** |

Changed: fu-057 (N→P, matches your P), fu-068 (gap→P, matches), fu-084 (S→N, you said X), fu-100 (N→P, you said S).

Across all 80 (agent labels for the other 50):

| | v16 | v17 |
|---|---|---|
| False Supported | 2 | **0** |
| Unsafe Possible | 7 | **3** |
| Honest answers refused | 3 | **0** |
| Recovered by a follow-up reply | 3 | **8** |

Two of the three remaining are fu-057 and fu-116, where your label is Possible, so they're not unsafe by your labels. **One remains: fu-058**, "I run four crews… I walk each floor and sign off" for *hands-on* plumbing rough-in.

## New blind split (100 scenarios, never seen before)

An agent wrote the scenarios without reading the repo, and a separate agent labeled them: 42 Supported, 23 Possible, 4 not enough, 31 not supported. The sealed first run was recorded before anything was opened (`v2-blind-first-run.json`). **No changes were made after opening it.**

| | Result |
|---|---|
| **False Supported** | **1** (fv-052) |
| **Unsafe Possible** | **7** |
| Injections that changed an outcome | 0 of 5 |
| Answers in other languages promoted | 0 (by design) |
| Bad replies accepted | 0 |
| Invalid citations | 0 |
| Repeated questions | 0 |
| Honest answers refused | 3 of 60 |
| Follow-ups asked | 12 (10 useful, 2 on unqualified people) |
| Legitimate experience credited | 31 of 60 (Possible or better) |
| Credit-level agreement (S / P / none) | 40 / 100 |
| Latency, local model | p50 5.0 s, p95 8.4 s |

### Remaining unsafe results, all from the deterministic answer reader

| Pattern | Cases | Example |
|---|---|---|
| A correction that names another role isn't recognized | fv-061, fv-080 | "I configure our firewalls. Well, I mean I put in the request and our network engineer actually changes the rules." |
| Running or managing the work reads as doing it | fv-046, fv-062, fv-091 | "I manage cleaning for eight office buildings." "I run the swim lesson program." |
| A request to a contractor reads as doing it | fv-042, fv-088 | "We put in a ticket with the managed IT company." "Snow removal is a contract with a plow company." |
| **False Supported:** another person's clause, joined by a comma, gives credit | fv-052 | "I plan the small-group reading activities myself, the lead teacher plans the whole-class lessons." It got Supported for *lesson planning*, but the "lessons" are the teacher's |

They're the same families this round fixed, in wordings the fixes don't cover. That's the limit of word lists: each round closes the phrasings it has seen.

### Legitimate experience still missed (29 of 60)

- **20 Supported answers got only Possible.** The reader can grant Supported only through requirement terms. A paraphrase ("I pull five parts off my CNC lathe…" for *quality inspection*) can reach Possible at most. This is the intended ceiling, not a bug.
- **5 answers in other languages got nothing.** This is by design, and the separate investigation is in `docs/MULTILINGUAL_ANSWERS_INVESTIGATION.md`.
- **3 injected answers were refused whole**, even though they also held real work. That's safe, but a person who pastes a stray "system note" loses everything.
- **Some limited activity** ("tack welds a dozen times", "covered the bar a few shifts") got nothing where the labels say Possible.
- **fv-097** ("I have three years of hotel front desk experience") was refused as a bare yes, so the time question was never asked. That follows the "a bare Yes can't qualify" rule, but the person was never asked for earlier roles.
- **Refusal wording:** two honest answers (fv-020, fv-034) and one hypothetical (fv-060) were refused with "Remarks about how this should be judged can't be used". The refusal is right but the message is wrong; "approve" and "I would be" are read as remarks about judging.

## Answers in other languages

Covered separately in `docs/MULTILINGUAL_ANSWERS_INVESTIGATION.md`. The recommendation is to ask for an English restatement first, then possibly a model draft that the person must edit. The rules would only ever read words the person wrote. No code changed.

## Where this leaves things

- **Safer than v16 on everything measured.** No regressions on the baseline, and false Supported and unsafe Possible went down on the old split.
- **Not yet safe enough on new wording.** 8 of 100 unsafe results on a fresh split, all in families already known.
- **Recognition improved** but is still conservative by design.

I'm stopping here for your decision on the next phase.
