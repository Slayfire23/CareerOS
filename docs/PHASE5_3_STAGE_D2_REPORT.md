# Phase 5.3 Stage D.2: delegated work in the split-recognition module

November 14, 2026. **Owner-approved scope** (`docs/PHASE5_3_STAGE_D2_FINDINGS.md`).

Constraints, all in force:
- only the inactive module and its tests changed;
- the reader, engine, questionnaire, database and wiring are untouched;
- the approved split patterns are unchanged;
- the module stays inactive;
- no sealed split was opened.

## 1. What changed (`src/lib/ai/rules/split-recognition.ts`, version `splits-v1.1`)

| Piece | What it does |
|---|---|
| `delegatedWork(text)` (exported for tests; not used by the app) | Finds the acts the person hands to someone else, in the person's own statements only. Two forms: **send / dispatch / assign / ask / tell / get + someone (+ out) + to + act** ("send plumbers out to install…"), and **have + my/our/the/… someone + act** ("have my clerk call…") |
| Who counts as "someone" | A worker: a role or agent noun ("clerk", "assistant", "crew", "plumbers", "finishers", "techs") or a relation ("my nephew") |
| Who never counts | The people served (customers, clients, patients, students, guests…); things, including "-ers" nouns that are objects (orders, papers, letters…); bare pronouns; me/us/myself |
| Other exclusions | The delegated act must not come back to the person ("let me install", "help me"). Instructions the person **receives** ("my supervisor tells me to…", "I was asked to…", "my boss had me…") have no such object and never match |
| Where the act ends | At the end of the clause, or where the person's own next clause starts ("…, and I …"). That's how "I have my assistant screen the applicants and I make the hiring decisions myself" keeps the person's own hiring |
| Removal | Delegated constructions are taken out of the person's clauses **before any approved marker is matched**, and out of the `bounded` / `readable` text that the A77 end-condition rule reads |
| `transferred` | A part whose **approved** markers or equivalents match delegated work, and which the person's own words don't show, is flagged `transferred` (informational) |
| Own and delegated | A part the person's own words show is **never cancelled** by delegation. It keeps `shown` and gets the reason "own and delegated (ask which part was the person's)" |
| Unchanged | The 33 approved patterns, `transferAll`'s rule, the reader, `readable`, `othersParts`, the engine and rules-v21 |

`transferred` stays informational: the module gives no verdict, and nothing maps `transferred` to the rule table's `contradicted`. That is a Stage F wiring decision.

## 2. Validation

| Gate | Result |
|---|---|
| Parity with the reviewed V5 simulation | **284 of 284 unchanged** (parts, `transferAll`, structured verdict, consistency) |
| The three false-Supported cases | **Corrected.** A77 "…have my clerk call the overdue customers until they pay": aging shown, collections not shown and `transferred` → Possible. A77 "…have my clerk call the past-due customers": the same. P13 "I have my assistant screen the applicants and I make the hiring decisions myself": recruiting not shown and `transferred`, hiring shown → Possible |
| The 10 conceptual cases (findings §3) | **All pass**, as stated there. The A58 design probe ("…install and repair **systems**") stays not shown and not transferred: the documented limitation |
| Mixed personal and delegated work | Pass: "I install water heaters myself and send my apprentice out to fix leaks"; "I install and repair plumbing myself, and … send my helper out to install water heaters too" (not cancelled; reason given); P13 "I screen the applicants myself and have my assistant schedule the interviews, and I hire the cashiers" (both shown); A51 "I pour the concrete myself and have the finishers trowel the slabs"; A77 told in two clauses |
| The 12 false-positive controls from opened data | **No delegated work found** in any. That covers the 4 "send/get/have … to" non-delegations and the 8 causative non-delegations ("let them in" ×2, "get them in a room", "get them quiet", "let them vent", "get them a refund form", "get them finished", "got her signers added"); two of the controls share one answer. Also: the people served ("I ask customers to sign…", "I have my students read…") and received instructions |
| The real delegations in opened data | Found (informational): fu-083 "Got my nephew to gut and redo both bathrooms…"; fu-070 reply "told the manager to get the unit looked at"; A58 |
| No Supported where it shouldn't be | No correction, supervision or single-part fixture row reaches Supported; the injection and non-English guards hold (existing tests) |
| Unit suite | **2,953 pass** (2,920 + 33 new) |
| Integration suite (local test DB) | **183 pass** |
| TypeScript, `prisma validate`, sealed guard (11 of 11), parts validate | Clean; pass |
| Lint | 1 existing warning (`tests/eval/run-eval.eval.ts`), unchanged |
| Isolation | Nothing in the app imports the module (existing test) |
| Engine and follow-up sets | §2.1 |

### 2.1 Engine and follow-up sets

Compared with the D.1 (`ef30865`) run. All five runs exited 0.

| Suite | Rows | Changed |
|---|---|---|
| Engine basis | 2,121 | **byte-identical** |
| m11_followup dev / blind | 40 / 80 | 0 / 0 |
| m11_followup2 blind | 100 | 0 |
| m11_followup3 blind | 120 | 0 |

**No application behaviour changed.** Only the module and its tests are in the diff, and nothing in the app imports them.

## 3. Deviations from the approved plan

1. **One planned "mixed" expectation was wrong and is now a documented limitation.** It doesn't come from D.2.
   - **Case:** "I call the past-due customers myself **and have my clerk run** the aging analysis every week."
   - **What happens:** the v21 reader reads that whole statement as **overseeing**, because the causative sits in the same statement. The module takes only the person's own `performed` statements, so the person's collections work isn't shown. D.1 behaved the same way.
   - **Why not fixed here:** fixing it would mean overriding the reader's ownership inside the module, which is outside the approved scope. It's the safe direction: no credit is given falsely.
   - **What is tested:** this limitation, and the same work told in two clauses ("…, and my clerk runs the aging analysis"), where the person's own part is kept.
2. **The planned exclusion of "make" and "let"** was implemented by leaving them out of both forms. Neither ever counts as delegation.

## 4. Remaining limitations

- **The A58 design probe** ("send plumbers out to install and repair **systems**") is unchanged. "systems" isn't an approved A58 object, and broadening A58 needs an owner decision. It gives Possible with every part ticked, never Supported.
- **Reader-level losses (safe direction; separate approval):**
  - a causative in the same statement makes it all "overseeing" (§3);
  - the greedy v21 send-to removal also strips the person's own clause ("…, and I pour the concrete myself");
  - "I run the crew: …, and I repair the leaks myself" is read as overseeing;
  - "My boss sends **me** out to install…" is read as the boss's work.
- **The worker list is broad but not complete.** A delegation to someone the list doesn't name isn't detected; the part then behaves as in D.1. The false-positive side is guarded by the served, thing and pronoun exclusions, and tested on opened data.
- **`transferred` isn't yet a contradiction.** Mapping it to `contradicted` is a Stage F decision. The "sends me" case must be resolved before that mapping.
- **The module stays inactive**, and parity proves fidelity, not accuracy. The sealed `m11_parts` evaluation at Stage G is the independent test.

## 5. Stage E

The demonstrated false-Supported path is closed. The module's outputs (`shown`, `transferred`, "own and delegated" reasons) are stable inputs for designing the per-part questions.

**GO for Stage E (questionnaire design and build, inactive), with two conditions carried forward:**
- the Stage F wiring must decide how `transferred` is used, and resolve the "sends me" attribution, before `transferred` can affect a verdict;
- the reader-level limitations in §4 stay listed for separate decisions.
