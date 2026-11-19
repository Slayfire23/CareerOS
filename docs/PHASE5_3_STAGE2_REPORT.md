# Phase 5.3 Stage 2: Follow-up Validation — Report

November 7, 2026. **rules-v19.**

- **Commits:** local only, `39ff55c`, plus `2586238` for the harness counts. Nothing pushed, deployed, or migrated.
- **Flags:** off by default.
- **Not touched:** the sealed split (`m11_followup4`) is still unopened. The matching engine is unchanged (0 of 2,121 verdicts).

## What changed

**The same standard as answers.** A reply now gets the answer reader's strict standard when the original answer showed any of these:
- someone else doing the asked work;
- the person leading, arranging, helping or watching;
- the person not doing the work.

Under that standard, the reply has to describe the asked work itself, in more detail (what, on what, how much or how often). Describing it means either using the requirement's own words, or naming the same action or object the answer gave away or denied. Plain words are enough; jargon isn't needed.

**What still counts:**
- **Genuine clarification.** A supervisor can show they also do the work. An earlier job counts ("at my last job I…"). So does a reversal that says what changed ("until last year I picked full-time…").
- **Input from someone else first.** "My manager sends the photo and I build it" counts.

**What doesn't count:**
- **A flat reversal of the answer** stays unresolved, as a contradiction.
- **Someone else doing the asked work**, even within the reply itself.
- **Someone else finishing the person's work after it**, as in "I wrote up the rule requests…, he applied them".
- **Assistance, a contractor's work, or brief exposure.** These keep their limits, and a reply can only ever reach Possible.

**Fixes to the reader:**
- "Nothing at work really" now counts as a no.
- The contradiction check reads every verb in someone else's part, including short verbs ("owns") and "haven't done".
- "The encoder software" is no longer read as a person.
- "Make the room assignments" counts as overseeing.

**The audit trail.** A raised verdict keeps a note of what it was before, and which question the reply answered. The original answer and the reply are stored as before. The harness now reports accepted and rejected replies separately, by reason.

## Results

### Every reply in the spent and opened data (416), against the rules-v19 Stage 1 code

| | Before | After |
|---|---|---|
| Replies accepted | 98 | 90 |
| **Bad replies accepted** | **8** | **0** |
| Good replies rejected | 76 | 76 |

**Moved toward their labels (10):**
- **Now rejected:** fv-005, fv-011, fw-001, fw-004, fw-020, fw-047, fw-053, fw-102.
- **Now accepted:** fv-029 and fw-105, honest replies that had been misread.

**Moved away (2):**
- **fu-102 changes your rules-v17 decision.** The answer was about arranging an exterminator, so the reply has to describe the asked work. "I set out the sticky traps myself" shares no word with "pest control treatment", so it's now rejected. That's a vocabulary gap, not a policy question, and a pest-control equivalence group in Stage 4 would fix it. Your human label for this reply is unchanged.
- **fw-110 is a policy choice.** After "Not QuickBooks, no", a reply about Xero can't establish QuickBooks. The label accepts it as a related tool. I kept it rejected, because a reply mustn't raise a verdict beyond what it shows.

**Answer verdicts:** 0 of 1,046 changed. The only other change is that fw-020's answer now gets a "did you do it yourself?" question.

### The full follow-up workflow on the two opened splits (regression data, with the model)

| | m11_followup2: Stage 1 → 2 | m11_followup3: Stage 1 → 2 |
|---|---|---|
| False Supported | 0 → 0 | 2 → 2 |
| Unsafe Possible | 0 → 0 | 5 → **3** |
| …from replies | 0 → 0 | 3 → **1** |
| Replies accepted | 7 → 8 | 6 → 5 |
| **Bad replies accepted** | **0 → 0** | **2 → 0** |
| Contradicting replies accepted | 0 → 0 | 2 → 0 |
| Legitimate experience still missed | 20 → 19 | 34 → 33 |

On m11_followup3, rejected replies break down as:

| Reason | Replies |
|---|---|
| Not specific | 10 |
| Undercuts itself | 8 |
| No own work | 6 |
| Repeats the question | 3 |
| Contradicts the answer | 1 |

The one remaining "unsafe from a reply" is **fw-082**. That's correct: the reply explains a specific change ("Gloria retired in June and I took over the ordering; I place the daily McKesson order myself now"). Your Stage 2 rules allow that clarification. The split's label judged the answer alone.

## Remaining failures, by category

| Category | Cases | Where it belongs |
|---|---|---|
| Brief exposure not recognized ("finished the free Codecademy Python course over a couple of weekends"; "one semester of ASL 101") | fw-090 (**false Supported**), fw-115 | Answer reader: brief-exposure wording |
| Passive voice with no actor ("Incoming steel gets checked…") | fw-016 | Parser investigation (Stage 3) |
| Word-sense collisions in role descriptions | 9 engine cases | Stage 3, or a sense table |
| Workplace in a non-English title; assisting roles not in the word list (Scrub Technician, Office Runner); an injected phrase in a role description | 4 engine cases | Engine follow-up |
| Vocabulary gaps: paraphrases and unlisted terms ("sticky traps" for pest control) | fu-102, plus paraphrase misses | Stage 4 equivalence review |
| Labeling difference | fw-083 (dates cover a dental-receptionist requirement) | None |

## Checks

| Check | Result |
|---|---|
| Unit | 2,253 passed |
| Integration | 176 passed |
| Lint | Clean |
| Engine baseline | Unchanged |
| Answer readings | Unchanged |
| New Stage 2 regression tests (`tests/ai-phase5-3.test.ts`) | 9, covering every identified unsafe reply, bare confirmations, contradictions with and without an explanation, a supervisor who also does the work, an earlier job, assistance, contractor work, brief exposure, and the audit note |
| Older tests updated | 2 Phase 5.2 tests now read replies with the whole answer, as production does. The fu-102 test records the changed decision |

Still to run at the freeze: the browser suites with flags off and on, and the single unsealing of `m11_followup4`.

## Next: Stage 3

Stage 3 is the offline parser comparison. It needs your approval before anything is downloaded.

The plan is to compare wink-nlp with its English lite model, compromise, and UDPipe via WebAssembly, in a scratch folder outside the project. Each would run on about 400 opened answers and replies, and be measured on:
- finding subjects and verbs;
- passive voice;
- several actors in one sentence;
- negation and corrections;
- speed, license, and maintenance.

I'll give each package's exact version and size before downloading.
