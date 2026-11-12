# Phase 5.3 R3: reader-fix design and regression plan

November 12, 2026. **Design and plan only, approved as such. No code change until a separate approval.**

**Delivery:** one rules change on the shared reader, `rules-v21` (a candidate), delivered the way rules-v20 was:
- behind an explicit opt-in (`textRules: "v21"`), with v20 staying the default for matching;
- adopted only as a separate owner decision, after the full comparison;
- with v20 kept selectable for comparison.

It includes DD3 (approved in principle) and R2 (conditionally approved).

**Files it would touch:**
- `src/lib/ai/evidence-boundary.ts` (clauses, ownership, corrections);
- `src/lib/ai/rules/answer-review.ts` (the requirement-asks checks);
- `src/lib/ai/rules/structured-consistency.ts` (contradiction per activity);
- `src/lib/ai/rules/structured-answer.ts` (one rule-table input, F6).

**Unchanged:** D1–D3, O1–O7, X2 (held), the engine, the equivalence table, and every split (all inactive).

## Fixes

### F1. Semicolons dropping first-person clauses

**Problem:** for "I do the individual 1040s start to finish; my manager takes the partnership and S-corp returns" (A26, also opened fw-024) and "I plan the campaigns; our agency runs them" (A60), the reader returns **no statements**. The sentence-level "someone else did it" handling discards the whole sentence.

**Fix:** split sentences at `;`, and at a dash between two independent clauses, before the ownership rules. Each side is then read on its own. The person's clause stays the person's, and the other side is someone else's work.

**Controls:**
- *Must stay below credit:* "I don't do the returns; my manager does".
- *Must stay below credit:* "My manager prepares the returns; I just file them" (O2).

### F2. Clause-level ownership and third-party attribution

**Problem:** a part's or requirement's words in someone else's clause are read as the person's. Examples:
- "the spec **Kevin designs**", "systems **another crew installed**", "campaigns **the agency plans**" (relative clauses without "that", present tense);
- "**HR handles** all the onboarding" (an acronym as the subject);
- "**send plumbers out to** install";
- "**from what the bookkeeper enters**" and "**using** the aging report" (instrument or source phrases);
- "bookkeeper" (an agent noun) read as "bookkeeping".

**Fix (from the DD1 simulation's V4b):**
- cut the person's clause at a change of subject, including relative clauses without "that" (a determiner and an agent, or a name, followed by a verb);
- treat "send/ask/tell/have X to do Y" as X doing Y;
- drop instrument and source phrases up to the next clause;
- never let an agent noun stand in for its activity.

**Controls (must keep credit):**
- "the parts I machine", "the spec I designed";
- "I install the cameras that the store ordered";
- "I use Excel to build the models";
- "I learned from Maria and now run the lathe myself".

### F3. Corrections that transfer work to another person (DD3)

**Problem:** "I do tune-ups at the shop. Mostly I write them up at the counter and the mechanics in back do the work, I only fix flats." (A87): "tune-ups" reads Supported on its own.

**Fix:** a later clause in which another person does the same activity (or "the work" or "all of it") cancels the person's earlier claim for that activity. **Cancellation uses other people's work only** (`othersParts(text, peopleOnly = true, withRetractions = false)`), never the person's own retracted claim. The DD1 simulation showed that otherwise a narrowing such as "…I only give the signals" would wrongly lose the narrowed part.

**Controls:**
- *Positive:* "I do tune-ups; mostly I also handle the brake jobs" keeps tune-ups.
- *Positive:* "The mechanics do the big overhauls; I do all the tune-ups myself" keeps tune-ups.
- *Negative:* "I do tune-ups. Really the mechanics in back do them; I just write them up" cancels tune-ups.

### F4. Corrections that narrow scope without erasing experience (DD3)

**Problem:** "I do the in-home measures for every sale. Well, not all of them — on the big commercial jobs our estimator goes out, and I only measure the residential rooms." (A78): the reader finds **no own statement** at all.

**Fix:** "I only/just X", "not all of them … I only Y" and "except …" **narrow**:
- The narrowed statement stays the person's own work for its scope, capped at Possible, with a scope note and a targeted question.
- A narrowing **never becomes a contradiction**.
- Whether a narrowed scope can meet a requirement in full is an owner interpretation (A78's residential scope stays open under DD4).

**R5 (A93):** "I build our annual budget. I mean, I fill in the template … I just give him my labor numbers" narrows to template entry and supplying numbers. That stays the person's own statement, but it **never establishes budgeting or forecasting**: Possible at most, with a targeted question. In the structured path the narrowed activity shows neither part.

**Controls:**
- *Positive:* "I measure residential rooms myself, about ten a week" is own work.
- *Negative:* "I don't measure; the estimator does all of it" is not own work.

### F5. Hiring, verifying and approving read as overseeing (R2)

**Problem:** "I recruit and hire the staff…" (P13) and "I verify every invoice … and approve them for payment" (A52) are read as *overseeing*, so genuine answers get a contradiction.

**Fix:** a narrow, act-specific exception. When the requirement or approved part names the act itself, the person's **own direct performance of that act** counts as the work:

| Act (the part or requirement names it) | Counts as performing it | Never counts |
|---|---|---|
| Hiring | "I hire …", "I make the hiring decisions", "I interview and decide", "I extend the offers", "I'm the one who chooses who we hire" | Supervising the people who hire; "I recommend candidates"; "I give input on hires"; "I sit in on interviews"; "HR makes the final call"; managing a recruiter |
| Invoice verification | "I verify/check/match invoices against POs and receiving" | "I send invoices to AP to verify"; "the clerk verifies them" |
| Payment approval | "I approve invoices for payment", "I sign off on payments up to $X", "I'm an approver on…" | "I submit invoices for approval"; "I route them to the controller"; "my manager approves them"; "I request approval" |

**Limits:**
- The exception applies only to the named act.
- It isn't a general management-verb exemption: "manage", "oversee", "supervise" and "lead" are unchanged.
- O1 (teaching others) and O2 (requesting, arranging, paperwork) are unchanged.
- The forwarding, recommending and requesting forms above stay O2 or oversight.

### F6. Contradictions overriding unsupported checkbox claims (D1 safeguard)

**Problem:** for "Our DevOps guy set up everything on AWS … I deploy my code through the pipeline he built", ticking "did it myself" still gives Possible. That happens today for 7 opened answers labeled not supported. The existing consistency check sees *some* own statement and calls the explanation consistent.

**Fix:** consistency is decided **per activity**, meaning per approved part, or the whole requirement when there's no split.
- When the explanation says someone else performed an activity, and the person shows no own performance of it, that activity is **contradicted**.
- A contradicted activity gets **no credit from the checkbox, not even Possible**, and a clarification.
- Distinct activities the person genuinely performed keep their credit. In "I pour the slabs; the finishers do the troweling", pouring stays shown, and the whole requirement is Possible.
- For an unsplit requirement whose only activity is contradicted, the result is no automatic credit (Not enough information) plus a clarification.

**Rule-table effect:** this is the one change to the Stage 2 rule table. A contradicted activity is treated as not done, rather than as Possible from the choice.

**Controls:**
- *Positive:* "I deploy and maintain the AWS infrastructure; the DevOps lead set it up" keeps maintaining.
- *Negative:* "Our DevOps guy set up everything and changes things there" gives no credit for either part.

### F7. Supervising the people who do the work

**Problem:** "I manage the HR coordinator who recruits and onboards new staff", "I review the forecasts and budgets my analysts prepare" and "I coach the reps who develop and deliver…" read as consistent with "did it myself". That's 10 supervision probes at Possible.

**Fix:**
- "manage/supervise/coach/run/oversee the X who do Y" is oversight of Y.
- Present-tense "review/check … the Y (that) others prepare" is oversight, not only past tense (rules-v20 handles past tense).
- With "did it myself", that's a contradiction for Y (F6).

**Control (must keep credit):** "I manage the schedule and also onboard the new hires myself".

## Targeted regression examples (permanent tests)

| Example | Today | Required after R3 | Positive control | Negative control |
|---|---|---|---|---|
| A87 tune-ups (fw-103) | "tune-ups" alone gives Supported | Tune-ups cancelled; flats kept as own work | "The mechanics do the overhauls; I do all the tune-ups myself" | "I do tune-ups. Really the mechanics do them" |
| A78 measures (fw-031) | No own statement | Own statement, narrowed scope, Possible plus a question | "I measure residential rooms myself" | "The estimator does all the measuring" |
| A93 budget (fv-025) | Possible | Possible at most; shows neither part; question | "I build the annual budget and the forecast myself" | "The finance guy builds both; I send my numbers" |
| A26 tax returns (fw-024) | No statement | Individual returns shown; business returns someone else's; Possible | "I prepare individual and small-business returns myself" | "My manager prepares all the returns; I gather documents" |
| A52 invoices | Read as overseeing | Verifying and approving shown when performed (F5); Supported reachable | "I verify invoices against POs and approve them for payment" | "I send invoices to the controller for approval" |
| A60 campaigns | No statement | Planning shown; running is the agency's; Possible | "I plan and run our campaigns myself" | "Our agency plans and runs them; I approve the budget" |
| P13 hiring | Read as overseeing | Hiring shown when the person decides (F5) | "I make the hiring decisions after the interviews" | "I recommend candidates; the owner decides" |

Also kept permanently:
- the 8 Stage 3 labeled regression cases;
- the 20 rules-v20 adoption tests;
- the ICD-10 labeled gain.

## Regression plan (all must pass before any adoption request)

- **Opt-in comparison, v20 against v21:**
  - 1,266 historical answers (including the 220 benchmark answers);
  - 392 earlier probes;
  - the 198 DD1 design probes;
  - new per-fix probes (positive and negative for F1–F7);
  - 320 follow-up replies;
  - the four follow-up regression sets;
  - the 2,121-row engine baseline.
- **Every changed verdict is reported** with its label.
- **Acceptance:**
  - 0 new false Supported;
  - 0 labeled-qualified losses;
  - 0 good follow-up replies newly refused;
  - the ICD-10 gain kept;
  - the engine unchanged, unless a change is reported and approved.
  - Expected: the D1 contradiction fix (F6) lowers checkbox-only Possible on contradicted answers. That's a lowering of *labeled not-supported* answers, reported as gains.
- **Suites:** unit, integration, TypeScript, lint and schema. The sealed hash guards run only.
- **Order:** implement F1–F7 under the opt-in; run the comparison; stop and report any unexpected change; commit locally only on a clean result; adopt only by owner decision.

## Risks to watch

- **F2 over-cutting:** product names and capitalized words before verbs ("Excel builds", "Google Ads runs"). Name detection needs controls, and the comparison will show any loss.
- **F5 broadening:** every "never counts" form in the F5 table becomes a negative test.
- **F6:** contradiction must be per activity. Any genuine distinct activity lowered is a labeled loss and blocks adoption.
