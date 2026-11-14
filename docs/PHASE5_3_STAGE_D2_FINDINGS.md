# Phase 5.3 Stage D.2: delegated work (the A58 residual): findings

November 14, 2026. **Read-only review; nothing implemented.** The baseline is `ef30865`:
- the D.1 module is inactive;
- the approved patterns and rules-v21 are unchanged;
- no sealed split was opened.

Every measurement here was made in scratch tests, which have been deleted.

## Recommendation

**GO for a re-scoped D.2, before Stage E:** delegated-work handling inside the recognition module, with no reader change. The review found that the more serious problem isn't A58's Possible. It's that **the committed D.1 module can produce a false Supported** from causative delegation ("I … have my clerk call the overdue customers until they pay"). D.1 is inactive, so nobody is affected, but that must be fixed before Stage F wiring at the latest. It is also cheaper and safer to fix before Stage E designs the per-part questions.

**NO-GO, needing separate owner decisions:**
- the exact A58 design probe ("…to install and repair **systems**"): fixing it needs A58's approved patterns broadened or an object borrowed from "the plumbing company";
- the reader-level losses in §6.

## 1. A58 traced through every layer

The explanation is "I run the plumbing company and send plumbers out to install and repair systems." for Install and repair residential plumbing, with a "did it myself" tick.

| Layer | Result | Why |
|---|---|---|
| Clause split (`splitBySubject`) | One clause, subject **self** | "send plumbers out to install…" is the infinitive complement of the person's own verb; there is no other subject |
| Ownership | `performed` | "run the company" isn't a supervision form; only "run … **who** …" is |
| `readable` (v21) | "I run the plumbing company and" | The v21 send-to rule **removes** the delegated complement. It doesn't record it anywhere |
| `othersParts` | **empty** | It holds only other-subject clauses and retractions. Delegated complements are neither |
| F6 whole-requirement contradiction | No | Nothing in `othersParts`; and "install and repair systems" doesn't name "residential plumbing" anyway |
| `assessConsistency` | consistent | An own `performed` statement |
| D.1 `recognizeParts` | Both parts **not shown, not transferred** | The module's clauses come from `readable`, and its "others" come from `othersParts` |
| Rule table (tick on every part) | **Possible** (`no_specific_text`) | Consistent, with no part shown |

**Why delegated work isn't third-party evidence:** the reader models other people's work only as **clauses with another subject**. "I send plumbers out to install X" is grammatically the person's clause. The v21 rule (F2 `SEND_TO`) was designed only to stop the person being credited, by removal from `readable`, not to attribute the work to anyone.

**Why the exact A58 sentence stays unresolved even with delegation detected:** the delegated words are "install and repair **systems**". A58's approved markers need a plumbing object (pipes, fixtures, water heaters, leaks…). "plumbing" appears only in the person's own clause ("the plumbing company"). Recognising it would mean matching verbs without objects or inheriting the object. That broadens the approved A58 patterns: Q4 object inheritance is approved only for A19, A56 and A67.

## 2. The more serious finding: causative delegation gives credit in D.1

Simulation worst case, a tick on every part, using the committed D.1 module:

| Explanation | Parts shown | Verdict |
|---|---|---|
| A77: "I run the AR aging analysis and **have my clerk call** the overdue customers until they pay." | aging ✓, collections ✓ | **Supported (false)** |
| A77: "I run the AR aging analysis and **have my clerk call** the past-due customers." | ✓ ✓ | **Supported (false)** |
| P13: "**I have my assistant screen** the applicants and I make the hiring decisions myself." | recruiting ✓, hiring ✓ | **Supported (false)**: the assistant recruits |
| P13: "I have my assistant screen the applicants and hire the cashiers." | ✗ ✗ | Possible (ownership `oversaw`) |
| A58: "I have my plumbers install the water heaters and fix the leaks." | ✗ ✗ | Not enough |
| A58: "I get my crew to install the water heaters and fix the leaks." | ✗ ✗ | Not enough |

Causative "have/get **someone** do" without "to" is in neither the reader's send-to rule nor `othersParts`. When ownership stays `performed`, the delegated work stays in `readable`, and the approved markers credit the person. The whole-requirement reader is more cautious here (A77: Possible; P13: Not enough), but the per-part combination reaches Supported.

**None of the 284 parity rows or the opened data contains this phrasing.** Parity proved fidelity to the reviewed simulation, and the simulation never met this case.

## 3. Conceptual cases (prototype detector, scratch only)

The prototype detects delegation only when **the object is a person or group doing work**, and it never cancels a part the person's own words show.

| Case | Prototype result | Assessment |
|---|---|---|
| "I send plumbers out to install water heaters and fix leaks." | both parts **transferred** | Correct |
| A58 design probe ("…install and repair systems") | not detected for any part | Approved objects missing (§1) |
| "I install water heaters myself and send my apprentice out to fix leaks." | install shown; repair transferred | Correct, per part (failure-4 principle) |
| "I install and repair plumbing myself, and on busy days I send my helper out to install water heaters too." | install shown **and** delegated, flagged "own and delegated", **not cancelled** | Correct: no false positive for a supervisor who also performs |
| "…send the old ones out to be recycled" | not detected | Correct (things, not people) |
| "I got certified to install water heaters…" | not detected | Correct |
| "I asked my supervisor to let me install…" | not detected (comes back to "me") | Correct |
| Plain supervision ("I supervise the plumbers who install…") | not shown (`oversaw`, F7) | Correct, already |
| Correction ("Well, actually I send my crew out to install them…") | not shown (existing correction handling) | Correct, already |
| Personal performance | shown | Correct, already |

## 4. False-positive risks (opened data: 1,976 unique texts)

| Phrasing in the person's own statements | Matches | True delegation | Lesson |
|---|---|---|---|
| send / ask / tell / have / get … **to** … (reader's v21 pattern) | 7 | 3 (A58; fu-083 "Got my nephew to gut and redo both bathrooms"; fu-070 reply "told the manager to get the unit looked at") | The other 4 ("send the paperwork to engineering", "send anything not up to standard back", "got everything back to them", "had the measurements to show it") show that **the object must be a person or group**. With that filter: 3 detected, 0 false |
| have / get / let / make + person + verb (causative) | 8 | **0** | "let them in", "get them in a room", "get them quiet", "let them vent", "get them a refund form", "get them finished", "got her signers added" (the person's own work; a v20 adoption fix). Rule: no let/make; no bare pronouns; never the people served |

**Supervisor who also performs:** the main risk is cancelling the person's genuine part. The proposal never cancels a part that the person's own clause shows; it only flags it.

## 5. Interaction with `transferred`

D.1's per-part `transferred` means "someone else's words name this part's work" (the simulation's own condition, from `othersParts`). Delegated work fits that meaning exactly. The proposal:
- a part named in delegated work, and **not** shown by the person's own clauses → `transferred: true`, `shown: false`;
- a part named in delegated work **and** shown by the person's own clauses → `shown` unchanged, `transferred` unchanged, reason "own and delegated (ask)". The questionnaire can ask "which did you do yourself?";
- `transferAll` keeps the simulation's formula, so parity holds.

How `transferred` maps to the rule table's `contradicted` remains a Stage F wiring decision.

## 6. Reader limitations found (safe direction; not D.2)

| Case | Effect | Note |
|---|---|---|
| "I send the finishers out to trowel the slabs **and I pour the concrete myself**" | `readable` = "I": the greedy v21 send-to removal also strips the person's own clause | Own work lost (no false credit). Reader fix, separate approval |
| "I run the crew: I send two plumbers out…, and I repair the leaks myself" | The whole statement is `oversaw`; the person's own repair is lost | Same |
| "My boss sends **me** out to install water heaters and fix leaks" | No own statement; the boss's clause counts as others' work, so D.1 marks both parts `transferred` | Wrong attribution. Harmless today; it matters if Stage F maps `transferred` to `contradicted`. Reader or module fix, separate approval |
| "I … have my clerk call…" read as the person's own work (§2) | The whole-requirement reader gives Possible | Within Possible; the per-part path is the dangerous one, and D.2 closes it |

## 7. Proposed patch (D.2, recognition module only)

1. **`delegatedWork(statementText)`** in `split-recognition.ts`, applied to the person's own statements (the `text`):
   - **send/dispatch/assign/ask/tell/get + person + (out) to + VERB**, and **have/get + person + bare VERB**.
   - The person must be a work role or agent noun with a determiner, possessive or number ("my clerk", "the crew", "two plumbers", "our techs"), or a relation ("my nephew").
   - Never me/us/myself, never a bare pronoun, never the people served (customers, clients, patients, students, kids, guests).
   - The delegated words must not come back to the person ("let me…", "help me…").
2. **Before marker matching**, the delegated words are removed from the module's own clauses, so they can never show a part. This closes §2.
3. **Per part:** if an approved marker or equivalent matches delegated work, then `transferred` (part not shown) or "own and delegated" (part shown; no cancel).
4. **Unchanged:**
   - the approved patterns, `transferAll`, the reader, `readable`, `othersParts`, the engine, rules-v21 and wiring;
   - the module stays inactive;
   - the version becomes **`splits-v1.1`**, so readings record the change.

## 8. Gates before D.2 is accepted

| Gate | Requirement |
|---|---|
| Parity | All 284 rows unchanged (the prototype affected 0) |
| The three false-Supported cases (§2) | Not Supported; the delegated part is not shown, and is `transferred` where its markers match |
| Delegation controls | The 10 conceptual cases in §3 behave as stated; "own and delegated" never cancels |
| False-positive controls | The 4 non-person send-to cases and the 8 causative cases from opened data (§4): no change. "got her signers added" is unaffected |
| Approved data | Unchanged (existing tests) |
| No Supported where it shouldn't be | No correction, supervision or single-part fixture row reaches Supported; injection and non-English guards hold |
| App | Answers, probes, replies, engine and 340 follow-up rows unchanged; the module stays unimported |
| Suites | Unit and integration pass; TypeScript, lint, schema, sealed guard and parts validate clean |

## 9. Is D.2 needed before Stage E?

- **Strictly, no.** Stage E (the questionnaire) doesn't produce verdicts, and the module stays unwired until Stage F.
- **Recommended, yes.** D.1 has a demonstrated false-Supported path. Stage E designs per-part questions around `shown` and `transferred`, and D.2 is small, inactive and parity-gated.
- **Hard requirement before Stage F:** D.2, or an equivalent fix, plus a decision on the §6 "sent me" attribution if `transferred` is to drive `contradicted`.
- **The exact A58 design probe** ("systems") can remain a documented limitation until the owner decides whether A58 may use object inheritance. Today it gives Possible, never Supported.
