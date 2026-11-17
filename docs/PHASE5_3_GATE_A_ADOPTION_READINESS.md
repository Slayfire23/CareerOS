# Phase 5.3 Gate A: adoption readiness (implemented) and the revised narrowing-correction policy (design only)

November 16, 2026. Approved by the owner: a narrow adoption-readiness change (A–D). **`v21a` is not adopted.** The production default stays rules-v21, `RULES_VERSION` stays rules-v21, and structured matching stays flag-gated. R0–R5 stays in design: no `v21b`, no label changes. Next.js stays a separate proposed task. Stage G's FAIL, its report and R4 are untouched.

## 1. What changed (code)

| Item | Change | Files |
|---|---|---|
| **A. Save-time check** | `answerProblem` passed `DEFAULT_TEXT_RULES === "v21"` to the untrusted-text reader, so any other v21-family default (such as `v21a`) would have dropped the v21 protections. It now passes `isV21Family(textRules)`. `textRules` is an optional parameter defaulting to `DEFAULT_TEXT_RULES`; every caller is unchanged | `src/lib/ai/rules/clarifications.ts` |
| **B. Rules-version staleness** | New pure module: `rulesVersionOf`, `rulesOutOfDate`, `staleReasons`. The analysis view gains `outOfDate.rules`: the stored `methodVersion`'s web rules version (`rules-vN`, or `assisted/rules-vN+…`) differs from the current `RULES_VERSION`. AI-service methods (`model/prompt`, `assist/…`, `hybrid/…`, `fake-v1`) carry no web rules version and aren't compared | `src/lib/ai/method-version.ts` (new), `src/lib/ai/analysis.ts` |
| UI | The match page's existing notice also lists "the matching rules have been updated". The existing requirement and profile sentences are unchanged, word for word | `src/app/dashboard/jobs/[id]/match/page.tsx` |

**Consequences investigated before changing anything:**
- **No schema migration and nothing rewritten.** Staleness is computed at read time from the stored `methodVersion`, which is unchanged, and reverts with the code.
- **UI:** one added reason in the existing notice; no new component.
- **Legacy analyses: one visible change once this ships, even without adopting `v21a`.** Analyses stored under an *earlier web rules version* will show "This analysis is out of date: the matching rules have been updated…". That covers `rules-v20` and older, and the earliest stored stamp `rules-v4`/`rules-v5` from before the web engine. That's accurate (they predate the current rules), but new. The number of such rows in production is unknown, because hosted data wasn't accessed (as required). It's non-destructive: the user re-runs, and nothing is removed.
- **Upgrade:** on adopting `v21a` (`RULES_VERSION` → rules-v21a), every rules-v21 analysis shows out of date until re-run.
- **Rollback:** returning to rules-v21 makes the rules-v21a analyses out of date and the rules-v21 ones current again. Stamps are never rewritten.
- **Questions keep working from the latest stored analysis,** exactly as with a profile-stale analysis today.

## 2. Tests

| Test | What it proves |
|---|---|
| `tests/adoption-readiness.test.ts` (13) | **A:** v21 save-time validation is unchanged (the default equals explicit v21). Opt-in `v21a` keeps the v21 protections: "…manage the **user accounts**…" and "…rewrote the **employee handbook**…" are accepted under v21 and `v21a` but refused under v20, which is the regression an exact-name check would bring back. Instructions, remarks, bare yes and lists are refused identically under v21 and `v21a`. Explicit corrections save identically. **B:** version parsing; upgrade, rollback and current; non-web methods aren't compared; the wording; no schema change |
| `tests/integration/ai-analysis.integration.ts` (+1, flags off) | Staleness on a real stored analysis (local test database):<ul><li>a fresh run is current;</li><li>stored `rules-v20` and `assisted/rules-v20+…` are out of date (upgrade);</li><li>`rules-v21a` is out of date (rollback);</li><li>`assisted/rules-v21+…` is current;</li><li>cloud and hybrid stamps aren't compared;</li><li>the stamp is never rewritten;</li><li>**reanalysis** writes a new, current row while the old one keeps its stamp</li></ul> |
| `ai-analysis` / `ai-cloud` integration | The existing staleness expectations gain `rules: false` |
| `tests/reader-v21a.test.ts` (unchanged, 34) | Explicit correction and retraction on **both** paths end to end (free text under `v21a`; structured v2) |

Regression results: §4.

## 3. Revised narrowing-correction policy (design only; incorporates the owner's three decisions)

Applies only after an **activity withdrawal** (R0 below). Everything else keeps today's rules (A1–A3, D1–D3, failure-4, O1–O3). Prospective: the existing labels aren't changed or used to tune.

**R0 · Activity withdrawal.** A correction takes back the person's own first-person claim *about the requirement's activity* and gives it to a person (a role, a name, a pronoun) or denies it. Not withdrawals:
- a generic subject ("talking does it");
- a change over time ("now", "these days", "no longer");
- collaboration ("my team and I", "me and…").

**R1 · Scope.** Only the corrected claim, or conjunct, is withdrawn.

**R2 · What's left.** The person's own remaining clauses, including object-first ones ("the coping-skills group I run").

**R3 · Role of each remaining clause.**

| Role | Signals (fixed lists) | Credit for the asked activity |
|---|---|---|
| **Doing** | Anything not below | Can establish a part (R4) |
| **Assisting** | "for him/her/them", "with him/her", help, assist, "second staff", "in the room", "there for my area" | **None** (constraint 3) |
| **Arranging** | book, order, schedule, arrange, write up orders or tickets | None, unless the requirement asks for arranging (O2) |
| **Documenting** | notes, note-taker, write up notes, photos, records, reports | None for conducting the activity. **Kept as the person's own documentation work for a requirement that asks for documentation** (decision 3) |
| **Observing / learning** | watch, learn, read printouts, reports or output, "I'm learning" | None |
| **Supervising** | lead, oversee, manage people | Only where the requirement asks for it |

**R4 · Linking a doing clause to the requirement, part by part.** Each piece of a compound requirement is linked separately.
- **Partial personal performance (decisions 1 and 2).** A doing clause establishes a part only when:
  - (a) it **names the asked activity**: the requirement's activity term or an approved equivalence ("weld", "measure", "fix"→repair if approved), or the asked equipment ("the backhoe", or "it" referring back to the withdrawn claim's equipment); **and**
  - (b) nothing the person says **excludes a qualifier the requirement states** ("structural", "load-bearing", "certified", a level).

  An unnamed narrowing ("I mostly tack things up") doesn't establish welding.
- **Limited equipment activity** (moving, driving or running the named machine) establishes a part of an "operating <equipment>" requirement. It is **never** taken as full operating competence.
- **Continuation of the withdrawn claim.** A narrower-scope version of the same activity (same verb or object stem: "measure"/"measures"), or the person's stated share inside the correction ("…the mechanics do the work, **I only** fix flats"), still has to satisfy (a). "Fix flats" establishes "repairs" only through the post-correction equivalence PE2 below.

**Post-correction equivalences** (owner-approved 2026-11-16). They apply **only inside this rule, after an activity withdrawal**: they are not global matching equivalences, and they don't touch `answer_equivalences.json`, free-text matching or the default reader. Each one establishes **a part** of the asked activity: **Possible with a clarification, never Supported through the equivalence alone**, however often or recently the work is described. Each counts only for a **doing** clause of the person's own (R3); assisting, arranging, documenting, observing, learning and someone else's work never qualify.

| | PE1: data import → partial implementation | PE2: "fix" → "repair" |
|---|---|---|
| **When the requirement qualifies** | It concerns implementing a system or software, or migrating data into a system ("implement", "implementation", "rollout", "migrate", "migration" in the requirement) | It asks for repairing equipment, a system or a component ("repair", "repairs", "repairing") |
| **The person's own clause** | Personally imports, loads or migrates data or records into the system ("I imported the customer records", "I handled the data imports", "I loaded the account data") | Personally fixes the **relevant** thing: the equipment the requirement names; a part of it named in the requirement; the withdrawn claim's own object, by name or pronoun; or a component on an owner-approved component list for that equipment (prospective data, reviewed before any implementation) |
| **What it establishes** | The implementation (or migration) part: **partial** implementation experience | The repair part, for that equipment |
| **What it never establishes** | Full system implementation; application architecture or development; deployment ownership; leading the implementation; any other implementation activity the person didn't do | Scheduling or arranging repairs; observing repairs; training or learning about repairs; someone else fixing it; fixing an unrelated item ("the paperwork", "the dock door") |
| **Verdict** | Possible + "Which parts of the implementation did you do yourself?" | Possible + "Which repairs do you do yourself, and on what?" |
| **Compound requirement** | Only the implementation part. A lead or configure part the correction withdrew stays missing and is named | Only the repair part. Tune-ups or other parts the correction withdrew stay missing and are named |

**R5 · Verdict after an activity withdrawal.**
- The checkbox contributes nothing (constraint 6).
- Each established part gives **Possible**, quoting the person's words, **always with a clarification** ("Which parts did you do yourself, and how often?").
- Nothing established gives **Not enough**, with the same question.
- **Never Supported from a corrected answer.**
- Withdrawn parts get nothing.
- A compound requirement with some parts established is Possible at most and names what's missing.

**How it distinguishes the six situations:**

| Situation | Outcome |
|---|---|
| **Partial personal performance** | Possible plus a clarification only when the remaining own act names the asked activity or equipment and no stated qualifier is excluded. Partial is never full |
| **Assisting versus doing** | Assisting clauses ("for him", "with him", "second staff") never carry the asked activity's credit. Doing clauses do, subject to R4 |
| **Documentation versus conducting a review** | Writing notes for someone else's review is documenting: Not enough for "conduct reviews". The note-writing stays the person's documentation work wherever a requirement asks for documentation |
| **Historical work** | "…for six years; these days my coworker drives it" isn't a withdrawal. The earlier own work keeps its credit, and recency follows D2 |
| **Genuine collaboration** | "My team and I… I drive the forklift myself" and "me and X" aren't withdrawals; credit as today |
| **Compound requirements** | Part by part. Withdrawn parts get nothing, established parts are Possible, the whole is Possible at most, and missing parts are named |

**Effect on the 14 opened cases under the revised policy.** For comparison only; labels unchanged; structured path.

| Case | Today | Revised policy | Label | Note |
|---|---|---|---|---|
| fu-016 Welding structural steel | Possible (checkbox) | **Not enough** + question | not_supported | "Tack things up" doesn't name welding, and the reply excludes load-bearing work. "I tack weld the steel" (naming it, nothing excluded) would give Possible + question |
| fu-038, fu-084, fv-004, fv-043, fv-080, fv-098 | Possible (checkbox) | **Not enough** | not_supported (all 6) | Observing, arranging, assisting, documenting, learning |
| fu-120 Operating a backhoe | Possible (checkbox) | **Possible + question** (moving the named machine; limited) | not_supported | Decision 2 allows limited equipment activity with a question. **This differs from the label**, which treats operating as digging. Prospective policy; label unchanged |
| fw-031 Site surveys and measurements | Possible (checkbox) | **Possible** (names "measure") | supported | F4 cap; not a qualification loss |
| fw-052 Lead software implementations | Possible (checkbox) | **Possible + question** (PE1: implementation part only; the lead part stays withdrawn) | possible | §3.1. Matches the label |
| fw-068 Facilitate group therapy sessions | Possible (checkbox) | **Possible** (names "group"; facilitating a group session; not therapy) | possible | Needs the object-first clause (R2) |
| fw-086 Conduct performance reviews | Possible (checkbox) | **Not enough** (documenting) | possible | Decision 3. Documentation is preserved for documentation requirements |
| fw-103 Bicycle repairs and tune-ups | Possible (checkbox) | **Possible + question** (PE2: the repairs part; tune-ups missing), provided a flat tire counts as a bicycle component | possible | §3.1. Matches the label |
| fv-029 Customer de-escalation (reply) | Possible (checkbox) | **Unchanged** (no withdrawal) | supported | Free-text relevance gap → Gate C |

### 3.1 fw-052 and fw-103 under the revised design (opened evidence only; labels unchanged)

**fw-052, "Lead customer-facing software implementations"** (role: Implementation Specialist):
- **Answer:** "I led the rollout for our three biggest clients last year. To be honest, our senior consultant ran the calls and the plan, I handled the data imports and the training docs."
- **R0:** an activity withdrawal. "I led the rollout" is the asked activity (leading an implementation), and the correction gives it to a person ("our senior consultant ran the calls and the plan").
- **R1:** withdrawn: leading (the calls and the plan).
- **R2/R3:** remaining own clauses:
  - "I handled the data imports": doing. "Handled" is none of the R3 signals.
  - "the training docs": documenting. No credit for implementation; kept as documentation work for a documentation requirement.
- **R4 + PE1:** the requirement concerns implementing software, and the person personally handled the data imports. That establishes the implementation part. The lead part isn't established, because it was withdrawn.
- **R5:** **Possible + clarification**, never Supported. Leading is named as missing.
- **Agreement:** the label's `possible` (mixed) and the reply ("she was the lead; I was on the project team") are consistent.
- **Residual ambiguity:** "handled" could mean coordinating rather than doing. The clarification question exists for that.

**fw-103, "Perform bicycle repairs and tune-ups"** (role: Bike Shop Sales Associate):
- **Answer:** "I do tune-ups at the shop. Mostly I write them up at the counter and the mechanics in back do the work, I only fix flats."
- **R0:** an activity withdrawal. Tune-ups go to the mechanics ("the mechanics in back do the work").
- **R1:** withdrawn: tune-ups.
- **R2/R3:** remaining own clauses:
  - "Mostly I write them up at the counter": arranging (writing up orders). No credit.
  - "I only fix flats": doing.
- **R4 + PE2:** the requirement asks for bicycle repairs, and "fix" counts as repair. A flat is relevant only as a bicycle component: tire or tube. The requirement doesn't name it, and the withdrawn claim's object is tune-ups. So the case needs the **owner-approved component list** to include flat tires and tubes under bicycle; the reply, "I do the flats and tubes myself, a few a day. Brakes and gears go to the back.", supports that reading. With that entry, the repairs part is established. Tune-ups aren't (withdrawn).
- **R5:** **Possible + clarification**, never Supported. Tune-ups are named as missing.
- **Agreement:** the label's `possible` ("flats only") is consistent. Without the component entry, PE2 doesn't apply and the result would be Not enough.

### 3.2 Prospective synthetic examples (written for this design; not used to tune anything)

Each example is a correcting answer, so R0 applies. "Possible" always comes with a clarification and is never Supported.

**PE1: data import → partial implementation**

| # | Requirement | Explanation | Outcome | Why |
|---|---|---|---|---|
| 1 | Implement our CRM for new clients | I led the CRM rollout. Actually, our consultant ran the project; I imported the customer records and cleaned up the duplicates myself. | **Possible** | Personally imported data into the system being implemented |
| 2 | Data migration to Salesforce | I ran the migration. Well, our admin owned the migration plan; I personally mapped and loaded the account data. | **Possible** | Personally migrated data; the plan's ownership isn't claimed |
| 3 | Implement and configure the payroll system | I set up the payroll system. Actually, IT configured it; I imported the employee records. | **Possible** (the implement part); configure named as missing | Compound: only the implementation part |
| 4 | Lead software implementations | I led the implementation. To be honest, my manager led it; I imported the client data every week. | **Possible**, never Supported; leading missing | PE1 never establishes leading, and frequency doesn't lift it |
| 5 | Implement our CRM for new clients | I led the CRM rollout. Actually, the vendor ran it; I scheduled the data import with them. | **Not enough** | Arranging, not importing |
| 6 | Implement our CRM for new clients | …Actually, the vendor did it; I watched them import the data. | **Not enough** | Observing; someone else imported |
| 7 | Implement our CRM for new clients | …Actually, our analyst imported the data; I reviewed the reports. | **Not enough** | Someone else's import; reviewing reports is observing |
| 8 | Software application development | I built the app. Actually, the developers built it; I imported the test data. | **Not enough** | The requirement isn't about implementing or migrating into a system; PE1 never establishes development |
| 9 | Own production deployments | I owned the deployments. Actually, DevOps owned them; I imported data after each release. | **Not enough** | PE1 never establishes deployment ownership |

**PE2: "fix" → "repair"**

| # | Requirement | Explanation | Outcome | Why |
|---|---|---|---|---|
| 10 | Forklift repair | I repair forklifts. Actually, the mechanic does the engines; I fix the hydraulic leaks on the forklifts myself. | **Possible** (engine work named as not done) | Personally fixes the named equipment |
| 11 | HVAC system repair | I repair the HVAC units. Actually, our contractor handles the compressors; I fix the thermostats and replace the belts myself. | **Possible**, if thermostats and belts are on the approved HVAC component list | A component of the named system |
| 12 | Bicycle repairs and tune-ups | I do tune-ups. Actually, the mechanics do those; I only fix flat tires. | **Possible** (the repairs part); tune-ups missing | A bicycle component (with the list entry) |
| 13 | Forklift repair | I repair forklifts. Actually, I schedule the forklift repairs with the vendor. | **Not enough** | Scheduling repairs |
| 14 | Forklift repair | I repair forklifts. Well, the mechanic fixes them; I watch and hand him tools. | **Not enough** | Someone else fixes; observing and assisting |
| 15 | Forklift repair | I repair forklifts. Actually, I'm learning how to fix them in a class. | **Not enough** | Learning |
| 16 | Forklift repair | I repair forklifts. Actually, the mechanic fixes them; I fix the paperwork. | **Not enough** | An unrelated item |
| 17 | Forklift repair | I repair forklifts. Actually, the mechanic does that; I fix the dock doors. | **Not enough** | An unrelated item (not the forklift or a part of it) |
| 18 | Bicycle repairs | I fix bikes. Actually, my brother fixes them. | **Not enough** | Fully withdrawn to someone else |

**Remaining open points:**
1. **The PE2 component list** (for example, bicycle: flat tire, tube, chain, brake pads; HVAC: thermostat, belt, filter) is prospective data for owner review before implementation. fw-103 depends on it.
2. **fu-120:** **its existing label (`not_supported`) differs from decision 2's prospective policy** (Possible + question for limited personal operation of the named machine). The label isn't changed. The difference is recorded here and in §3's table.
3. **The general "I assisted" checkbox question stays separate and unresolved.** The rule table still gives Possible for an "I assisted" *choice* (unrelated to a correction). R3's "assisting gives nothing" applies only after an activity withdrawal.

## 4. Regression gates

| Gate | Result |
|---|---|
| Unit | **4,064 of 4,064** (4,051 + 13) |
| Integration (solo) | **227 of 227** (+1 staleness test) |
| Engine basis / follow-up (340 rows) | **2,121 of 2,121 rows identical / 0 of 340 differ** (totals identical) |
| Split parity | 284 of 284 (in unit) |
| TypeScript / lint / prisma / build | Clean / 0 errors (1 existing warning) / valid / compiled, exit 0. The first build run stopped with the known Next.js agent upgrade nudge; the retry passed. Its instructions weren't followed |
| Sealed guard | 12 of 12 |
| Browser | `job-clarification` 1/1 and `job-match` 1/1, both flags off (`job-match` checks the out-of-date notice); `job-structured-matching` 1/1. Limits at 8 and 6 of 30, no bypass |
| Matching verdicts and defaults (D) | **Unchanged.** The default is rules-v21, `RULES_VERSION` rules-v21, and the save-time result equals before (the default call path is identical). The engine and follow-up are identical, and every existing unit and integration expectation passes; the only edits add `rules: false` |

## 5. Still proposed (not in this change)

- **Adopting `v21a`.** The prerequisites from the decision report are now done: the save-time fix and staleness. **The correcting-answer browser test is still required before an adoption decision.**
- **The narrowing-correction rule (R0–R5 with PE1 and PE2) and `v21b`:** design only, not implemented.
- **Next.js:** a separate patch upgrade to ≥ 16.4.5 for GHSA-mfr8-8qww-v76h (moderate; the affected API isn't used in `src`). No dependency changed here.
