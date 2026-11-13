# Phase 5.3: DD1/DD2 specification and simulation

November 11, 2026. **Design and scratch simulation only. Nothing is implemented.**
- No split is active, and matching and rules-v20 are unchanged.
- No equivalence was added, and no sealed split was opened.
- Owner decisions: docs/PHASE5_3_PRE_STAGE4_DESIGN_DECISIONS.md.
- Evidence: `ai-service/evals/reports/m11/structured/dd1-simulation.json`.

## 1. What the design must guarantee

1. **Per-part evidence:** each approved part needs evidence specific to that activity. A whole-requirement verdict never establishes a part (X2 is held).
2. **No lost credit for wording alone,** within limits. Recognition comes from owner-reviewed markers plus explicitly approved, narrow equivalents. There are no broad semantic equivalences, and related activities are never treated as the same.
3. **Ownership at clause level:** a part's words count only in the person's own clause, as their own act.
4. **Corrections (DD3):** a transfer to someone else cancels that part, and a narrowing keeps the narrowed work.
5. **Incomplete evidence leads to a targeted question,** never a guess.
6. **Unchanged:** D1–D3, O1–O7, no Supported from a checkbox or an unsupported self-report, and no credit for someone else's work.

## 2. Data: an approved split as Stage 4 would read it (not created yet)

| Field | Content | Who sets it |
|---|---|---|
| `requirement` | The original requirement text, unchanged | — |
| `parts[]` | The exact approved part wording (33 splits, 66 parts) | Owner (done) |
| `markers[part]` | The patterns that tell this part apart from its sibling parts | Proposed here; **the owner approves each** |
| `equivalents[part]` | Narrow, phrase-level alternative wordings, each with a reason | Proposed here; **the owner approves each, or none** |
| `status` | `owner_approved` before any use | Owner |

**Not created by this report:** no list, file or table of approved splits exists. Drafts for all 66 parts are in the appendix.

## 3. DD1: per-part attribution (the algorithm)

For each requirement with an approved split and a ticked "did it myself" (or "did some"):

1. **Language (D3):** if the explanation isn't plainly English, nothing is read. Ticked parts reach Possible at most.
2. **The person's own statements:** the existing reader's statements whose subject is the person and whose ownership is *performed*, excluding exposure-only, brief, teaching (O1) and paperwork-for-others (O2) statements. rules-v20 is unchanged.
3. **Clause cuts, so a part's words count only in the person's own clause:**
   - Cut at a change of subject, including a relative clause without "that": "the spec *Kevin designs*", "systems *another crew installed*", "the campaigns *the agency plans*".
   - Drop instrument and source phrases, up to the next clause: "*using* the aging report …", "*from* what the bookkeeper enters".
   - Drop "send / ask / tell / have X *to do Y*" (others do Y).
   - Agent nouns never match an activity marker: "bookkeeper" isn't "bookkeeping".
4. **Review and oversight verbs:** under review, check, audit, oversee, supervise, coach, approve, sign off, log or "write up", a part's words in the *object* don't count. Only a part that *is* that verb counts. ("I review the forecasts and budgets my analysts prepare" shows neither part.)
5. **Matching:** a part is shown when a remaining own clause matches one of its markers, or one of its approved equivalents.
6. **Corrections (DD3, §5):** cancel transferred parts; keep narrowed ones.
7. **Combining parts (the Stage 2 rule table, unchanged except for this input):**
   - Supported needs a consistent explanation, every necessary part ticked, and **every ticked part shown**. The whole-requirement reading no longer substitutes for parts.
   - A part that's ticked but not shown caps the verdict at Possible and queues one targeted question.
   - An unticked part caps at Possible and names the missing part (O3).
   - No part ticked gives Not enough information (O3).
   - A choice with no text gives Possible (D1).
   - A contradiction gives no automatic credit and asks for clarification (D1).

## 4. DD2: the questionnaire and follow-ups

- **One explanation field** for the whole requirement: "Describe what you did yourself."
- **One unticked checkbox per approved part**, using the exact approved wording. Nothing is preselected (Stage 4 rules: keyboard, labels, 375 px, dark mode).
- **Attribution (§3) runs once** over the single explanation. One sentence that names several parts shows all of them, so nothing is written twice.
- **Follow-ups go only to ticked parts that aren't shown,** at most one question per part, never repeated (`mayAskFollowUp`). Wording is around the part: "You ticked *Finishing concrete flatwork*. What did you do yourself?" Replies are read for that part only and still reach Possible at most (Self-reported).
- **A part cancelled by a transfer** gets a question only if it was ticked: "You mentioned the finishers do the troweling. Did you also finish slabs yourself?"
- **Storage:** the choice and ticks per part (the Stage 1 `ClarificationPart`), plus, per shown part, the offsets of the attributed clause. Events store choices, never words (Stage 5).

## 5. How DD3 correction handling interacts with shared evidence

The simulation surfaced one essential interaction.

**The existing reader already treats "I do X. Well, …" as a retraction.** It moves the person's earlier claim into the "others" text. If cancellation used that text, it would wrongly cancel the very part the person narrowed to ("…I only give the signals" lost the signaling part in the first prototype). **Rule: cancel only on other people's work** (`othersParts(text, peopleOnly = true, withRetractions = false)`), never on the person's own retracted words.

| Correction | Example | Effect per part |
|---|---|---|
| Transfer | "the ironworkers rig the loads", "the mechanics in back do the work" | That part is cancelled ("the work" cancels every part the corrected sentence claimed). Other parts shown elsewhere stay shown |
| Narrowing | "I only give the signals", "I just run the register" | Parts named in the narrowing clause stay. A narrowed activity with no marker ("run the register" for cash handling) keeps Possible and gets a targeted question. **It never becomes a contradiction** |
| Transfer with nothing of the person's own left | "Our DevOps guy set up everything … I deploy my code through the pipeline he built" | A contradiction: no automatic credit, plus clarification (D1) |

A87 and A78 become permanent regression cases, with nearby positive and negative controls, when DD3 is implemented. That is a separate rules change with full regression.

An earlier, stricter prototype (V4a) turned an "I only/just …" clause that names no part into a contradiction. It dropped 9 genuine narrowed correction probes, and the opened A93 answer, to Not enough information. That broke the DD3 rule that narrowing preserves genuine experience, so it was rejected in favour of the version above (V4b).

## 6. Simulation

**Data:**
- **Opened:** the 28 opened answers that exist for the 33 approved splits (follow-up sets 1–3; one per split at most). None exists for P14, A20, A52, A76 or A77.
- **Design probes:** 198, six per split: both parts in standard wording, both parts in different wording, part A only, part B only, supervision, and a correction. I wrote them for this simulation. **They aren't an evaluation set, and they share my bias as the author of the rules.** See the open decisions.
- **Worst case:** the person ticks "did it myself" and every part.

**Variants:**
- **V0:** today's Stage 2 rule (the whole reading must be Supported, and each part must read Supported on its own).
- **V1:** markers only.
- **V2:** markers plus candidate equivalents.
- **V3:** V2 plus a simple correction prototype.
- **V4b:** the design above.

| Group (count) | Expected | V0 | V1 | V2 | V3 | **V4b** |
|---|---|---|---|---|---|---|
| Both parts, standard wording (33) | Supported | 21 S | 31 S | 31 S | 31 S | **31 S** (2 I) |
| Both parts, different wording (33) | Supported | 0 S | 10 S | 32 S | 32 S | **32 S** (1 P) |
| One part only (66) | Possible | 1 S | 5 S | 5 S | 5 S | **0 S** (62 P, 4 I) |
| Supervision (33) | not Supported | 1 S | 4 S | 4 S | 4 S | **0 S** (23 I, 10 P) |
| Correction (33) | not Supported; narrowed work kept | 0 S | 2 S | 2 S | 0 S | **0 S** (32 P, 1 I) |
| Opened answers (28) | per label | 0 S | 3 S | 6 S | 6 S | **6 S** |

### False Supported

- **V4b: none** in the 132 partial, supervision and correction probes, and none in the opened answers.
- **Today's rule (V0) already has two:**
  - "I recruit new staff, and HR handles all the onboarding" (P14);
  - "I review the forecasts and budgets my analysts prepare" (A93).

  Both are removed by the clause rules.
- **Simpler designs have more:** V1 and V2 have eleven each, and V3, with simple correction handling, has nine. All come from a part's word in someone else's clause or under a review verb, plus two uncorrected claims. The clause cuts in §3 are what remove them, so they're required, not optional.

### Gains and losses on opened data (V4b against today)

- **Six labeled-supported answers reach Supported,** against none today: P6, A22, A24, A25, A56 and A60.
- **No labeled answer is lowered, and no false Supported.**
- **The two labeled-supported answers that stay below Supported:**
  - A19 (fw-002) describes reconciling without naming it ("…dig through receiving slips … until I find"): Possible, plus a targeted question about *Reconciling inventory variances*. No broad equivalent is proposed.
  - A21 (fw-033) is in Polish, so it isn't read (D3).

### Qualified losses and blocks in the probes (V4b)

| Case | Result | Cause | Fix belongs to |
|---|---|---|---|
| P13 "I recruit and hire the staff…"; "I hire the staff for my department…" | Not enough information (contradiction) | The reader reads "hire … staff" as overseeing staff | A part-level "the part asks for it" exemption (§7 R2) |
| A52 "I verify every invoice … and approve them for payment"; "I approve invoices for payment after the AP clerk verifies them" | Not enough information (contradiction) | "verify/approve" read as overseeing, but approving *is* the part | Same exemption (R2) |
| A26 "I do the individual 1040s …; my manager takes the partnership and S-corp returns" (also the opened fw-024, labeled possible, already Not enough information today) | Not enough information | The reader returns **no statements** when the person's clause and another's are joined by a semicolon | Reader fix on the DD3 track (R3) |
| A60 "I plan the campaigns; our agency runs them…" and its correction probe | Not enough information | Same semicolon behavior | Reader fix (R3) |
| A19 reconciling described without the word | Possible plus a question | No marker or approved equivalent | By design: a question, not a broad equivalent |

### Risks that remain even in V4b (Possible, not Supported)

- **Supervision through the checkbox:** 10 of the 33 supervision probes reach Possible when the person ticks "did it myself". Examples: "I manage the HR coordinator who recruits…", "I review the API designs and code my team produces".
- **Seven opened answers labeled not supported also reach Possible** (P2, P8, P13, A53, A54, A57, A59). In each, the text gives the work to someone else, but some own statement remains ("I deploy my code", "I fill and count").

In both cases the existing consistency check reads the text as consistent with "did it myself". **Today's rule gives the same Possible results, so this isn't a regression,** but it falls short of "contradictions prevent automatic credit". The fix is reader-side (R3): recognize present-tense supervision of people who do the work, and a transfer that leaves only unrelated own work.

## 7. Remaining decisions before Stage 4 implementation

| # | Decision | Recommendation |
|---|---|---|
| R1 | **Review markers and equivalents** (appendix: 66 parts, 52 candidate equivalents). Equivalents that most need your judgement: blow-dry/blowout/updo for styling (A63); struts, control arms and ball joints for suspension, and pads, rotors and calipers for brakes (A20); P&L and balance sheet for monthly financial reporting (P8); single audit and allowable costs for grant compliance (P6); new-hire orientation for onboarding (P14); projections for forecasting and spending plan for budgeting (A93); breaking down trailers and stacking onto trucks (A67); touching off tools and setting offsets for lathe setup (A76); slinging and choking loads for rigging (P3) | Approve per split. Reject any you consider "related, not identical"; those parts then fall back to a targeted question |
| R2 | **The part asks for it:** when an approved part is itself an oversight-shaped act (P13 *Hiring staff*, A52 *Verifying invoices* and *Approving invoices for payment*), the oversight reading of that act is the work. This is the same pattern as O1 and O2 | Approve, limited to parts whose own wording names that act |
| R3 | **Reader fixes before any split is activated** (the shared reader, so a separate rules change with full regression, like DD3): (a) present-tense relative clauses without "that" give others' work; (b) semicolon-joined others' clauses no longer drop the person's statement; (c) supervising people who do the work ("manage the coordinator who recruits…") is read as oversight; (d) a transfer that leaves only unrelated own work is a contradiction | Approve as one rules change, together with DD3, with A87, A78 and these probes as permanent tests |
| R4 | **An independent probe set:** the 198 probes were written by the author of the rules, and 5 splits have no opened data. Before activation, have one agent write and another label a fresh set for the 33 splits, as in Stage 0. It would be opened only for the final check | Approve |
| R5 | **The A93 reading:** opened fv-025 ("I build our annual budget. I mean, I fill in the template … I just give him my labor numbers") stays Possible under V4b, labeled possible. Your A93 rule says template-filling isn't owning budgeting; V4b gives Possible (unverified) plus a question, not Supported | Keep it at Possible with a question (it stays consistent with your rule, since it never reaches Supported) |

**Proposed order:** R1, R2 and R4 can be decided now. R3 with DD3 is one rules change, regression-tested, before activation. Stage 4 (the form, DD2) can then be built against the approved list. Activation waits for R3/DD3 and the R4 independent check.

## 8. Owner decisions on R1–R5 (2026-11-12)

**The V4b results aren't approval to activate the design or begin Stage 4.**

| # | Decision |
|---|---|
| R1 | **Review required before approval.** The 66 draft markers and 52 candidate equivalents aren't adopted. A review table covers all 33 splits: the original requirement, the exact approved parts, the draft marker, candidate equivalents, why each equivalent is valid, ambiguity or over-credit risk, and a recommendation (approve, revise, reject, or needs owner interpretation). It's reviewed in batches, starting with the first 8 splits (docs/PHASE5_3_R1_MARKER_REVIEW.md). The owner-approved part wording is never changed: markers and equivalents are separate recognition proposals |
| R2 | **Conditionally approved:** hiring, verifying and approving can be responsibilities the person performs directly. Narrow exceptions recognize real personal participation in hiring decisions, invoice verification, or payment approval. General supervision, forwarding paperwork, recommending candidates, and requesting approval never count as performing them. The exceptions must not weaken O1/O2 or become broad exemptions for management verbs |
| R3 | **The reader-fix design and implementation plan are approved; code changes aren't.** The plan covers six things: semicolons dropping first-person clauses; transfer corrections; narrowing corrections; hiring, verifying and approving read as overseeing; contradictions overriding unsupported checkbox claims; and clause-level ownership. **D1 safeguard:** when the explanation says someone else performed an activity, "I did it myself" doesn't give Possible for that contradicted activity, and credit for distinct activities the person genuinely did is preserved. A87, A78, A93, A26, A52, A60 and P13 are targeted regression examples, with positive and negative controls (docs/PHASE5_3_R3_READER_FIX_PLAN.md) |
| R4 | **An independent evaluation design is approved:** one agent writes scenarios, and a separate agent labels them independently. It covers genuine full experience, partial experience, supervision and delegation, corrections and narrowed claims, third-party work, several activities in one explanation, synonyms and natural variation, contradictory checkboxes, injection attempts, and non-English explanations (D3). It stays separate from the implementer's design probes. No existing sealed split is inspected or scored (docs/PHASE5_3_R4_EVAL_PROTOCOL.md) |
| R5 | **Approved:** A93 stays at Possible at most, with a targeted question, unless independently sufficient evidence establishes the activity. Entering values into a budget template, or supplying labor numbers for someone else's forecast, never establishes full ownership of budgeting or forecasting |

## 9. Design updates from the R1 review (2026-11-12; specification only, not implemented)

### 9.1 Named-tool parts (A53 Excel, A60 Google Ads)

An approved split may set a **named tool** per part, as a new field in §2's data. A part with a named tool is **shown for Supported only when the person's own clause that shows the part also names the tool.**
- Other tools (Google Sheets, Microsoft Advertising), an unspecified tool ("in a spreadsheet"), the tool named only in someone else's clause, or the tool named elsewhere in the answer but not for this work ("I know Excel well. I build the model in Python") all mean **partial relevance**: Possible, with a targeted clarification ("Was this model built in Excel?").
- Other tools never establish the named tool's proficiency.

### 9.2 A77: aging analysis, conditional (no blanket "review")

*Accounts receivable aging analysis* is shown only by the person's **own analytical act** on aging content:
- analyzing, flagging, identifying, categorizing, prioritizing, sorting, breaking down, tracking or working through overdue balances, aging categories or buckets, outstanding receivables, payment trends or collection priorities;
- running, performing or preparing "the (AR) aging analysis";
- setting collection priorities;
- deciding which accounts to call.

**Never shown by** receiving, opening, forwarding or reading the aging report, by "review" alone, or by reviewing another person's analysis (that stays oversight). Whether *preparing or running the aging report* counts is an open question (§11 Q1).

### 9.3 Q4: elided objects and pronouns (conditional design)

When a part's verb appears in the person's own clause with no object, or with "them/it" ("I only unload", "I just present them", "I just count"), the object may be inherited **only** when all of these hold:
1. The antecedent is an **earlier clause of the person's own activity, with "I" as its subject**. The simulation showed this guard is essential. Without it, "Actually, marketing builds the decks, I just present them" inherited "decks" from marketing's clause, because the reader returns that clause as a statement.
2. The antecedent isn't **retracted or contradicted**. Retracted claims are already moved out of the person's statements by the reader.
3. The antecedent names the part's object, for this split's activity (not an unrelated activity: "unload the dishwasher").
4. The antecedent offers **no other plausible object** ("the decks and the pricing spreadsheets"). Otherwise it's ambiguous: no inheritance, a targeted clarification.

Corrections and narrowed scope take precedence. The same rule supplies missing *context* (A22: "I'm the executive assistant to our CEO… I only keep the calendars"). Inherited evidence never reaches Supported on its own: it shows the part like any other evidence, with every other rule (D1–D3, X2 held, a checkbox gives Possible at most) unchanged.

## 10. V5 scratch simulation (named tools, Q4, A77, P13/P14)

**Inputs:**
- every reviewed pattern (batches 1–4 as approved, plus the supplementary P13/P14 proposals);
- the §9 rules;
- **30 targeted probes** written for this check (not an evaluation set; each states its expected parts and verdict);
- the 226 earlier rows (28 opened answers and 198 design probes).

Opened data only; no sealed split. Evidence: `ai-service/evals/reports/m11/structured/v5-simulation.json`.

| Check | Result |
|---|---|
| Targeted probes behaving as expected | **27 of 30** |
| False Supported, targeted probes | **0** |
| False Supported, 132 earlier partial, supervision and correction probes | **0** |
| Earlier rows changed against V4b | 2, both A77, both attribution only: "I prepare the AR aging reports" and "I only run the aging report" no longer show aging analysis (§11 Q1). No verdict changed |

**Named tools (11 probes, all as expected):**
- genuine Excel and Google Ads work reaches Supported;
- other tools, an unspecified tool, the tool only in someone else's clause, and the tool named for unrelated work all give Possible with a clarification;
- "maintaining someone else's Excel model" shows maintaining only.

**Q4 (12 probes, 11 as expected):**
- **Inherited correctly:** "the trailers… I only unload" (blocked by a reader issue, below); "I build the client decks… I present them myself" (Supported); "executive assistant to our CEO… I only keep the calendars"; "on the inventory team for the stock room… I just count".
- **Refused correctly:** retracted claims ("I load and unload trucks. Actually… I only unload"); unrelated activity (the dishwasher); another person's work ("The outbound crew loads the trucks; I only unload", "Marketing builds the decks. I just present them"); several antecedents ("the decks and the pricing spreadsheets", "the stock room and the cash drawers"). Each refusal gives Possible with a clarification, never Supported.

**A77 (7 probes, 5 as expected):**
- **Not shown, correctly:** forwarding, receiving and reading, reviewing another's analysis, and bare "review".

**The three failures are existing reader behaviors or a missing equivalent, not design flaws:**
1. **"I'm assigned to the trailers at door 4, and I only unload":** today's reader reads "I'm assigned to…" as *overseeing*, so the statement isn't the person's own performed work. That's a new R3 item.
2. **"I pull the AR aging every week, flag everything over 60 days and decide which accounts to call first":** today's reader already truncates the person's readable text to "I pull the AR aging every week, flag". An existing over-cut in the shared reader; a new R3 item.
3. **"…identify the overdue balances and call those customers until they pay":** genuine collections that no approved pattern covers. A candidate equivalent was tested (contacting customers or accounts "until they pay", "to collect", "for payment", "about their balances/invoices"). It matches no unrelated opened answer, and excludes calls about deliveries or orders (§11 Q2).

## 11. Remaining decisions before implementation is proposed

| # | Decision | Recommendation |
|---|---|---|
| Q1 | **A77:** does *preparing or running the AR aging report* count as aging analysis? Your conditional approval lists analysis acts and excludes receiving, reading and forwarding, but doesn't decide preparing or running. Today two probes lose that attribution (verdicts unchanged) | Count it only together with an analysis act in the same clause. Preparing or running the report alone gives Possible with a clarification ("What did you do with the aging report?") |
| Q2 | **A77 collections equivalent:** contacting, calling or chasing customers or accounts "until they pay / to collect / for payment / about their balances or invoices" | Approve, as tested |
| Q3 | **The supplementary P13/P14 batch** (omitted from batches 1–4; see the R1 review), including Q-P1 (volunteers) and Q-P2 (the R2 hiring boundary) | Decide as presented |
| Q4 | **Two new R3 reader items:** (a) "I'm assigned to …" read as overseeing; (b) the existing readable over-cut ("flag everything over 60 days …" truncated). Add both to the R3 plan as F8 and F9, with these probes as tests | Approve, as additions to the R3 design only (no code) |
| Q5 | **Named-tool field and Q4 antecedent guard:** confirm both in the §2 data and §9.3 design | Approve |

**What remains before any implementation is proposed:**
- these decisions;
- then the R3/DD3 rules-v21 implementation plan, now covering F1–F9;
- the R4 independent evaluation, which alone can show whether the reviewed patterns generalize beyond my probes and the opened data.

## Appendix: draft markers and candidate equivalents (for owner review; none approved)

*Superseded for review purposes by docs/PHASE5_3_R1_MARKER_REVIEW.md, where each item gets a recommendation. Kept as the simulation's exact input.*

Patterns are case-insensitive. `\w*` means any word ending; `[^.]{0,30}` means within about 30 characters in the same sentence.

| # | Approved part | Draft marker patterns | Candidate equivalents (each needs your approval) |
|---|---|---|---|
| P1 | Bookkeeping | `\bbookkeeping\b` · `\bthe books\b` | `\bpost\w*\b[^.]{0,30}\bledger\b` |
|  | month-end reconciliation | `\breconcil\w*` | `\bmatch\w*\b[^.]{0,30}\bbank statements?\b` |
| P2 | Cash handling | `\bcash\b` | — |
|  | till reconciliation | `\b(reconcil\w*\|balanc\w*\|count\w*)\b[^.]{0,25}\b(tills?\|drawers?)\b` · `\b(tills?\|drawers?)\b[^.]{0,25}\b(reconcil\w*\|balanc\w*\|counts?)\b` | — |
| P3 | Crane signaling | `\bsignal\w*` | `\bdirect\w* the (crane )?operator\b` · `\btalk\w* the operator through\b` |
|  | Crane rigging | `\brig\b` · `\brigg\w*` | `\bsling\w*` · `\bchok\w* (the )?loads?\b` |
| P6 | grant reporting | `\breport\w*` | — |
|  | grant compliance | `\bcomplian\w*` | `\bsingle audits?\b` · `\ballowab\w*` |
| P7 | Patient scheduling | `\bschedul\w*` | `\bbook\w*\b[^.]{0,25}\bappointments?\b` |
|  | Insurance verification | `\b(verif\w*\|check\w*)\b[^.]{0,30}\b(insurance\|eligibility\|benefits\|coverage)\b` · `\b(insurance\|eligibility\|benefits)\b[^.]{0,20}\b(verif\w*\|checks?)\b` | — |
| P8 | Bookkeeping | `\bbookkeeping\b` · `\bthe books\b` | `\bpost\w*\b[^.]{0,30}\bledger\b` |
|  | Monthly financial reporting | `\bfinancial (reports?\|statements?)\b` · `\bmonthly reports?\b` | `\bP&L\b` · `\bprofit and loss\b` · `\bbalance sheets?\b` |
| P11 | Pipe threading | `\bthread\w*` | — |
|  | Pipe fitting | `\bfit(s\|ted\|ting\|ter\|ters)?\b` · `\bpipefit\w*` | `\bmake up (the )?(joints\|fittings)\b` |
| P12 | Pruning | `\bprun\w*` | `\b(trim\w*\|cut\w* back)\b[^.]{0,25}\b(limbs?\|branch\w*\|shrubs?\|hedges?)\b` |
|  | tree felling | `\b(fell\|felled\|felling)\b[^.]{0,25}\btrees?\b` · `\btree felling\b` | `\b(take\|took\|taking\|bring\|bringing\|brought)\b[^.]{0,10}\bdown\b[^.]{0,20}\btrees?\b` |
| P13 | Recruiting staff | `\brecruit\w*` | `\b(sourc\w*\|screen\w*)\b[^.]{0,25}\b(candidates?\|applicants?\|resumes?)\b` |
|  | Hiring staff | `\bhir(e\|es\|ed\|ing)\b` | `\b(make\|made\|making)\b[^.]{0,20}\boffer decisions?\b` · `\bextend\w* offers?\b` |
| P14 | Recruiting new staff | `\brecruit\w*` | `\b(sourc\w*\|screen\w*)\b[^.]{0,25}\b(candidates?\|applicants?\|resumes?)\b` |
|  | onboarding new staff | `\bonboard\w*` | `\bnew[- ]hire orientation\b` |
| A19 | Inventory cycle counts | `\bcount\w*` | — |
|  | Reconciling inventory variances | `\breconcil\w*` · `\bvariances?\b` | — |
| A20 | Brake repair | `\bbrakes?\b` | `\b(pads\|rotors\|calipers)\b` |
|  | Suspension repair | `\bsuspension\b` | `\b(struts?\|control arms?\|ball joints?\|tie rods?\|coil springs?)\b` |
| A21 | Drywall installation | `\b(install\w*\|hang\w*)\b[^.]{0,25}\b(drywall\|sheetrock\|gypsum\|board)\b` | — |
|  | Drywall joint finishing | `\b(finish\w*\|tap\w*\|mud\w*)\b[^.]{0,25}\b(joints?\|seams?)\b` | `\btape and mud\b` |
| A22 | Executive calendar management | `\bcalendars?\b` | — |
|  | Travel coordination | `\btravel\w*` | `\bbook\w*\b[^.]{0,40}\b(flights?\|hotels?\|trips?)\b` |
| A23 | Social media account management | `\b(manag\w*\|run\w*\|handl\w*)\b[^.]{0,30}\b(social media\|instagram\|facebook\|tiktok\|linkedin\|accounts?)\b` | — |
|  | Content creation | `\bcontent\b` · `\b(shoot\|shot\|film\w*\|edit\w*\|design\w*)\b[^.]{0,25}\b(photos?\|videos?\|graphics?\|reels?)\b` | — |
| A24 | Venipuncture | `\bvenipuncture\b` · `\b(draw\w*\|drew)\b[^.]{0,15}\bblood\b` · `\bblood draws?\b` | — |
|  | Starting IV lines | `\b(start\w*\|plac\w*\|insert\w*)\b[^.]{0,25}\b(IVs?\|IV lines?\|intravenous\|peripheral (lines?\|IVs?))\b` | — |
| A25 | Scheduling service appointments | `\bschedul\w*` | `\bbook\w*\b[^.]{0,25}\b(appointments?\|service calls?)\b` |
|  | Dispatching technicians | `\bdispatch\w*` | `\b(rout\w*\|assign\w*)\b[^.]{0,25}\b(techs?\|technicians)\b` |
| A26 | Individual tax return preparation | `\bindividual\b` · `\b1040s?\b` | — |
|  | Small-business tax return preparation | `\bsmall[- ]business\b` · `\bbusiness returns?\b` | `\b1120\w*` · `\b1065s?\b` · `\bS[- ]corp\w*` · `\bpartnership returns?\b` |
| A51 | Pouring concrete flatwork | `\bpour\w*` | `\bplac\w*\b[^.]{0,20}\b(concrete\|slabs?)\b` |
|  | Finishing concrete flatwork | `\bfinish\w*` | `\btrowel\w*` |
| A52 | Verifying invoices | `\bverif\w*` | `\bmatch\w*\b[^.]{0,30}\b(POs?\|purchase orders?)\b` |
|  | Approving invoices for payment | `\bapprov\w*` | `\bsign\w* off\b[^.]{0,25}\b(invoices?\|payments?\|bills?)\b` |
| A53 | Building Excel financial models | `\b(buil\w*\|creat\w*\|develop\w*)\b[^.]{0,45}\bmodels?\b` | — |
|  | Maintaining Excel financial models | `\b(maintain\w*\|updat\w*)\b[^.]{0,45}\b(models?\|assumptions)\b` | — |
| A54 | Configuring AWS cloud infrastructure | `\b(configur\w*\|provision\w*)\b` · `\bset\w* up\b` | — |
|  | Maintaining AWS cloud infrastructure | `\b(maintain\w*\|patch\w*\|upgrad\w*)\b` | — |
| A55 | Designing RESTful APIs | `\bdesign\w*` | `\b(writ\w*\|defin\w*)\b[^.]{0,25}\b(API contracts?\|OpenAPI specs?)\b` |
|  | Developing RESTful APIs | `\b(develop\w*\|build\w*\|built\|implement\w*\|cod(e\|es\|ed\|ing))\b` | `\bwrit\w*\b[^.]{0,20}\b(handlers\|endpoints)\b` |
| A56 | Developing sales presentations for clients | `\b(develop\w*\|build\w*\|built\|creat\w*\|put\w* together)\b[^.]{0,30}\b(decks?\|presentations?\|slides?)\b` | — |
|  | Delivering sales presentations to clients | `\bdeliver\w*` · `\bpresent(s\|ed\|ing)?\b` · `\bpitch\w*` | — |
| A57 | Installing security camera systems | `\b(install\w*\|mount\w*)\b` | — |
|  | Maintaining security camera systems | `\b(maintain\w*\|servic\w*\|repair\w*)\b` | — |
| A58 | Installing residential plumbing | `\binstall\w*` · `\brough\w* in\b` | — |
|  | Repairing residential plumbing | `\b(repair\w*\|fix\w*)\b` | — |
| A59 | Ordering pharmacy inventory | `\border(ed\|ing)\b` · `\bplac\w* (the \|our )?(daily )?orders?\b` · `\bI order\b` | — |
|  | Managing pharmacy inventory | `\b(manag\w*\|rotat\w*\|track\w*)\b[^.]{0,30}\b(inventory\|stock)\b` | `\boverstock returns?\b` · `\bpull\w* expired\b` |
| A60 | Planning paid search campaigns in Google Ads | `\bplan\w*` · `\bstrateg\w*` | `\bkeyword research\b` |
|  | Executing paid search campaigns in Google Ads | `\b(execut\w*\|run\w*\|launch\w*\|optimiz\w*)\b[^.]{0,30}\b(campaigns?\|ads)\b` | `\badjust\w* (the )?bids\b` |
| A63 | Cutting hair | `\bcut\w*` | `\b(fades\|trims)\b` |
|  | Styling hair | `\bstyl\w*` | `\bblow-?dr\w*` · `\bblowouts?\b` · `\bupdos?\b` |
| A67 | Loading freight onto trucks | `\bload(ed\|ing)?\b` | `\b(stag\w*\|stack\w*)\b[^.]{0,25}\bonto (the )?(delivery )?(trucks?\|trailers?)\b` |
|  | Unloading freight from trucks | `\bunload\w*` | `\bbreak\w* down (the )?(inbound )?trailers\b` |
| A76 | CNC lathe setup | `\bset(ting)? ?up\b` · `\bsetups?\b` | `\btouch\w* off\b` · `\bset\w* (the )?offsets\b` |
|  | CNC lathe operation | `\b(operat\w*\|run\w*\|ran)\b` | — |
| A77 | Accounts receivable aging analysis | `\baging\b` | — |
|  | Accounts receivable collections | `\bcollect\w*` | `\b(call\w*\|chas\w*)\b[^.]{0,30}\b(past[- ]due\|overdue)\b` |
| A93 | Forecasting | `\bforecast\w*` | `\bprojections?\b` |
|  | Budgeting | `\bbudget\w*` | `\bspending plans?\b` |
