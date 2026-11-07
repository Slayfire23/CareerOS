# Phase 5.3 Stage 4A: Structured Ownership — Design

November 7, 2026. **Design only.**
- No code, migrations or dependencies were added.
- The matching engine is unchanged.
- The sealed split `m11_followup4` hasn't been opened.

## Why

Five evaluation rounds and the parser study say the same thing. Inferring the person's part from free text is where qualification errors come from:
- supervision read as doing the work;
- requests read as doing the work;
- "we";
- corrections;
- someone else's work described in the same sentence.

On the 400-text ownership benchmark, rules-v19 identifies who did the work 51% of the time. Neither offline parser did better.

The fix is to **ask the person directly** what their part was, as a choice, and use free text for what they did. The rules then decide from the choice and the dates, and use the text only to check consistency and find the requirement's own words. Everything stays self-reported, and nothing is called verified.

## 1. The question

Each requirement still appears as one question card, with the same three entry points as today. Only "Yes" opens a different form.

> **Have you done this in a job: “Install residential electrical wiring”?**
> [ Yes ] [ No, I don't have this ] [ Skip for now ]

**Yes** opens one required choice, worded in the person's terms:

> **What was your part?** *(choose one)*
> ○ I did this work myself
> ○ I did some of it myself
> ○ I supervised it or assigned it to others
> ○ I arranged it, or requested it from a contractor or provider
> ○ I helped someone who did it
> ○ I watched it being done, or trained on it
> ○ Actually, I haven't done this

Nothing is preselected, so no answer is suggested. "Actually, I haven't done this" leads to the same place as "No, I don't have this" (a denial).

**For the three "lead" choices** (supervised, arranged, helped), one more question follows. It only appears when the requirement isn't asking for that kind of work:

> **Did you also do any of it yourself?** ○ Yes ○ No

"Yes" switches the answer to **I did some of it myself**, and that answer's fields appear. This is how a supervisor who also does the work gets credit for it. Your Stage 2 decision allows that.

## 2. How often and how recently (only when they did some of it)

Two short choices, shown only for "did it myself" and "did some of it":

> **How often?** ○ Most days or shifts ○ Weekly ○ Monthly ○ A few times in total ○ Once
> **Most recently?** ○ It's part of my job now ○ Within the last year ○ 1–3 years ago ○ More than 3 years ago

**Which role?** stays as today (it's required, and it's what a citation points to). It's the existing role picker, defaulting to nothing.

**For time requirements** ("3+ years of X"), one field is added: **About how long in total?** (years and months). It's a claim, read by the existing rule: Possible at most, with the earlier-roles question. Time only ever comes from role dates.

**Credentials** keep today's entry form (a name, who issued it, and when). No ownership choice is asked.

**At most five controls are visible at once:** the choice, role, how often, most recently, and the text box.

## 3. What they did (optional text) and consistency checks

> **What did you do?** *(optional, up to 1,000 characters)*
> Hint: "Say what you did yourself, on what, and how often. Plain words are fine."

The text is optional, but **only text can lift an answer above Possible** (§4). The hint encourages it without demanding jargon. Placeholder examples aren't used, because copied example text is refused as a template.

The existing readers check the text against the choice:

| The choice says | The text shows | Result |
|---|---|---|
| Did it myself / did some | The person's own clause doing the work | Consistent |
| Did it myself / did some | Supervising, arranging, helping, watching, someone else doing it, or a denial | **Mismatch.** The more conservative reading is used, and the person is told: "Your description sounds like you supervised this. You can change your choice or your description." |
| Supervised / arranged / helped / watched | The person doing it themselves | **Mismatch,** the other way. The choice stands, and the person is asked: "Did you also do any of it yourself?" |
| Any | An instruction, a template, quoted text, or a list | Refused, as today, with the reason |
| Any | Not plainly English | **Kept, but not read.** The choice still counts, up to the choice's ceiling (§4). Today these answers get nothing. |

A mismatch never raises a verdict. It can only keep it lower, or prompt a question.

## 4. Deterministic rules: from answer to verdict

Every structured answer is **Self-reported.** It's read only for its own requirement, and it can raise a finding from "Not enough information", never lower the rules' own Supported or Not supported. The one exception is the approved Stage 1c rule, which lets an answer remove title-only credit.

| Their part | Requirement asks for… | Verdict |
|---|---|---|
| **Did it myself** | the work itself | **Supported** only if all hold: (a) consistent text shows the work in the requirement's own words or an *approved* equivalence; (b) it's done at least *a few times in total*; (c) the requirement doesn't ask for a level or a length of time. Otherwise **Possible** (decision D1) |
| **Did some of it** | the work itself | **Possible** at most |
| **Supervised / assigned** | leading or supervising | As "did it myself" |
| **Supervised / assigned** | anything else, and they didn't also do it | **Not enough information**, with the reason shown (rule 2) |
| **Arranged / requested** | coordination, vendors, service requests, scheduling | As "did it myself" |
| **Arranged / requested** | anything else | **Not enough information** (rule 3) |
| **Helped someone** | assisting itself | As "did it myself" |
| **Helped someone** | anything else | **Possible** at most, never Supported (rule 4) |
| **Watched / trained** | a skill or tool | **Possible** at most (limited familiarity) |
| **Watched / trained** | experience, proficiency, professional, hands-on, or years | **Not enough information** (rule 5) |
| **Haven't done this**, or "No" | — | **Does not meet** (`gap`), as today's denial |
| **Skip** | — | Unchanged |

**Frequency and recency** limit, never lift:
- "Once" or "A few times in total" caps the answer at Possible, as limited activity.
- "More than 3 years ago" adds a caveat ("last done more than 3 years ago"). Whether it should also cap at Possible is decision D2.
- Neither ever turns a "No" into anything else.

## 5. Doing the work isn't the same as proficiency

A structured answer can show **personal execution.** It never shows **proficiency** or **professional level** by itself:
- When a requirement asks for a level ("advanced", "expert", "proficient", "senior", "professional", a rating), an answer is capped at **Possible**, with the caveat "Your answer shows you've done this. It can't show the level asked for."
- Time comes only from role dates.
- Credentials come only from entries.
- Classes, workshops and demos count as "watched / trained". They're never professional experience.

This keeps today's ceilings and makes them visible to the person.

## 6. The local model's role

- **It decides nothing.** The choice and the rules decide. The model (`qwen3:8b`, local only, behind the flag) may only *suggest a question*, as now.
- **Code asks first.** A *mismatch* (§3), or "did some of it" without a description, prompts a code-chosen question ("Which parts did you do yourself?"). The model is only consulted for a paraphrase that code can't link.
- **Replies are read by the Stage 2 reader.** It now also gets the structured choice. A reply can raise "Not enough information" to Possible only, and only if it's consistent with the choice, or explains a change.
- **Choices change only through the person.** A reply suggesting a different part ("actually I did it myself") is shown as a prompt to update the choice. The person edits it.

## 7. Existing answers

- **Nothing is rewritten.** Every saved answer keeps its words, its outcome, and its meaning. The new fields stay empty, meaning "not stated".
- **Answers without a choice are read exactly as today,** by the rules-v19 text reader. Their verdicts don't change when this ships. The engine baseline and reading comparisons will check that.
- **The person can add their part.** Old answers show "Add your part (optional)". Choosing creates a **new answer that supersedes the old one** (the existing `supersedesId` chain). The old row stays, with status SUPERSEDED, and an event records the verdict before and after. Revoking or deleting works as now.
- **Denials stay denials.** Nothing is converted.
- **Follow-up questions and replies stay attached** to the answer they were about.

## 8. Schema changes (for later; no migration now)

All additive and nullable, so old rows and old code keep working:

```prisma
enum Involvement { PERFORMED PART SUPERVISED REQUESTED ASSISTED OBSERVED_TRAINED NOT_DONE }
enum WorkFrequency { MOST_DAYS WEEKLY MONTHLY FEW_TIMES ONCE }
enum WorkRecency { CURRENT WITHIN_YEAR ONE_TO_THREE_YEARS OVER_THREE_YEARS }

model CandidateClarification {
  // …existing fields unchanged…
  involvement      Involvement?    // null: answered before structured ownership; read as text, as today
  alsoDidSome      Boolean?        // the answer to "Did you also do any of it yourself?"
  frequency        WorkFrequency?
  recency          WorkRecency?
  claimedMonths    Int?            // "About how long in total?" for time requirements; a claim, never dates
  consistency      String?  @db.VarChar(30)  // "consistent" | "text_mismatch" | "text_unread" | "no_text", recomputed on read
  formVersion      Int      @default(1) @db.SmallInt  // 2 for structured answers
}

model ClarificationEvent {
  // …existing fields unchanged…
  involvement      String?  @db.VarChar(20)  // what the person chose, for the audit trail; never their words
}
```

- **RLS:** unchanged, because the rows still belong to the user.
- **Deletion:** permanent deletion already removes the row, and the event row holds no words.
- **Rollout:** local first. Production needs a separate migration approval, as with the seven migrations already waiting.

## 9. Accessibility, mobile, and length

- **Native controls.** Native radio buttons in a `fieldset` with a `legend`, labels that can be clicked, and hit targets of at least 44 px. Hints are linked with `aria-describedby`.
- **Errors.** Errors are listed at the top and next to the field, and focus moves to the first one. Color is never the only signal.
- **Progressive disclosure.** Only the fields the chosen part needs appear. Changing the choice keeps what was typed.
- **Mobile.** Choices stack in one column. A card shows one question at a time. Buttons span the full width below 640 px.
- **Plain language** at about a 6th–8th grade level, with no jargon. "Assisted" is "I helped someone who did it".
- **Fewer questions.** Questions about the same work are grouped, as now (`coveredKeys`), never asked twice, and capped per job. A short "why we ask" line explains that it helps match fairly.
- **Testing.** Keyboard-only and screen-reader passes (NVDA, VoiceOver), dark mode, and mobile viewport checks are in the browser tests.

## 10. Compared with rules-v19

| | rules-v19 (free text) | Structured ownership |
|---|---|---|
| Who did the work | Inferred. 51% on the ownership benchmark | **Stated by the person.** Accuracy depends on honesty, not on parsing |
| Supervision, requests, helping, watching | Phrase and verb lists. Recurring misses on new wording | **Explicit choice,** with the rules applied directly |
| "We", passives, corrections | Frequent errors | The choice resolves them. Text is only a consistency check |
| Relating the answer to the requirement | Needs the requirement's words (paraphrases missed) | The question is *about* the requirement, so the choice reaches Possible without matching words. Supported still needs the words or an approved equivalence |
| Answers in other languages | Nothing | **The choice counts** (Possible at most). The text isn't read |
| Follow-up questions | Many, some to unqualified people | Fewer: only for a mismatch or partial work |
| Audit | Text and verdicts | Text, the choice, how often and how recently, and verdicts before and after |

**Limits and risks:**
1. **Over-claiming is one click.** The choice is self-reported, like free text. That's why D1 keeps a choice without supporting text at Possible, the same ceiling as today's text answers.
2. **Form fatigue.** One required choice and two short ones, shown only when needed.
3. **A meaning shift for old answers.** Avoided: they're read as before until the person updates them.
4. **The evaluation must change.** The sealed `m11_followup4` has free-text answers only, so it measures the text path (still used for old answers and for consistency). The structured path needs its own new sealed split, with written choices.
5. **A migration is required** before any of it reaches real data.

## Decisions for you

- **D1.** May "I did this work myself" with a role, how often and how recently, but no matching text, reach **Possible**? Or should it stay "Not enough information" and prompt a question? I'd recommend Possible: it's more than a bare yes, and it's still capped and self-reported.
- **D2.** Should "More than 3 years ago" cap at Possible, or only add a caveat? I'd recommend a caveat only.
- **D3.** Should answers not in English count through the choice, at Possible at most? I'd recommend yes. It's the first safe step toward the multilingual goal: the text stays unread, so nothing is inferred from it.

## Implementation stages (after approval)

| # | Stage | What | Complexity |
|---|---|---|---|
| 0 | A new sealed split | About 120 structured scenarios (choice, frequency, recency, text, reply), written and labeled by separate agents, committed unopened | Medium |
| 1 | Schema, local only | The additive fields above and a local migration. **Production migration needs your separate approval** | Small |
| 2 | The rule table | A pure `readStructuredAnswer()` beside `readAnswer`, with exhaustive tests for every row of §4 and §5 | Medium |
| 3 | Consistency checks | The text against the choice, reusing the Stage 1–2 readers. Mismatch messages | Medium |
| 4 | Forms | Both flows (the review panel and today's clarification), progressive disclosure, accessibility, and browser tests | Medium–large |
| 5 | Saving and supersession | Server actions, supersession of old answers, audit events, revocation and deletion paths | Medium |
| 6 | Follow-up integration | Code-chosen questions on mismatch or partial work, and the reply reader taking the choice | Small–medium |
| 7 | Freeze and evaluate | Unseal `m11_followup4` (text path) and the new structured split once each. Full suite with flags off and on | Medium |

**Overall: large, about 6–8 working sessions.** The flags stay off by default throughout, and nothing ships without your approval.
