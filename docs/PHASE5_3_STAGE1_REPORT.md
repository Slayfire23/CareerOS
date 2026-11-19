# Phase 5.3 Stage 1: Job-Title and Date Credit — Report

November 6, 2026. **rules-v19.**

- **Commits:** local only, `52a26e8` (sealed split) through `e61978a`. Nothing pushed, deployed, or migrated.
- **Flags:** off by default.
- **Not touched:** the new sealed split, `m11_followup4`, has not been opened. Only its sealed rules-v18 counts were recorded, before any change.

## What changed, in three tested commits

| Step | Rule | Commit |
|---|---|---|
| 1a | For an operational task (one that opens on doing it, or says "hands-on"), a **leader's title** (supervisor, manager, foreman, superintendent, coordinator, director, lead, head, chief) gives no credit, and a **helper's** (helper, apprentice, aide, trainee, runner, porter, assistant) gives Possible at most. Leadership, assisting, field and time requirements keep the title's credit. | `d8a6386` |
| 1b | **A workplace in a title isn't the occupation.** "Cashier, Bellwood Pharmacy" is still a lead for "pharmacy experience", and nothing for "pharmacy technician experience". | `13eba81` |
| 1c | **A confirmed answer can take away title-only credit**, to Not enough information, never lower. That happens when the answer gives the asked work to someone else and none of the person's own statements covers it. | `e61978a` |

Safeguards for 1c:
- Supervising alone doesn't lower credit.
- Work split within one sentence stays at Possible as mixed ownership ("I do the 1040s and my manager takes the partnership returns").
- A denial keeps its existing rule.
- A later, specific reply can still raise the verdict.
- The rules-only verdict, the reason, and the answer's own sentence are kept as the audit trail.

Every lowered verdict says why in its explanation and caveats.

## Results against the 2,121-requirement baseline

| | Count |
|---|---|
| **Unsafe title or date credits removed** | **8 of 22**: 7 in the engine, 1 through an answer |
| **Correct helper and leader credits kept** | **36 of 36** |
| **All other engine verdicts** | **2,114 unchanged** |
| **Regressions** (a change away from a label) | **0** |

The 7 engine changes, each now matching its label:

| Case | Title | Requirement | Before → after |
|---|---|---|---|
| fu-058 | Plumbing Foreman | Hands-on plumbing rough-in | Possible → not enough |
| fw-037 | Safety Coordinator | Conduct employee safety training sessions | Possible → not enough |
| fw-063 | Sanitation Supervisor | Perform routine sanitation of production equipment | Possible → not enough |
| fw-078 | Food Service Manager | Prepare food according to dietary restrictions | Possible → not enough |
| j-we-supervised-tile | Site Foreman | Hands-on tile setting | Possible → not enough |
| fw-008 | Electrician's Helper | Install residential electrical wiring and fixtures | **Supported** → Possible |
| j-amb-pharmacy-cashier | Cashier, Bellwood Pharmacy | Pharmacy technician experience | Possible → not enough |

**Through an answer:** fw-082 (Pharmacy Technician, "Our lead tech, Gloria, does the ordering") goes from Possible to not enough. It's the only title credit an answer lowers across the three opened follow-up splits. fw-024, a mixed-ownership case, was lowered by the first version, so I added the mixed-sentence safeguard before committing.

**Found during the work:** title credit can also arrive under another basis. Requirements read as skills cite the title itself, for example "HVAC Service Manager" for installing HVAC systems. The rule covers that too: a citation that quotes only job titles is title credit. In the baseline that path had 11 credits, none from a leader's title, and nothing changed.

## Remaining failures (14 of 22)

| Cause | Count | Cases |
|---|---|---|
| A word in a role description used in another sense | 9 | A dentist's "bridges" → bridge design; a pest technician's "bug" → bug tracking; a detailer's "gun" → spray refinishing; an energy auditor → financial audits; a landscaper's "crane"; a software engineer's "guest"; a food-service worker's "imaging"; a cashier's "motores"; a "statements" collision |
| A workplace in a non-English title | 1 | "Recepcionista en hospital pediátrico" → pediatric nursing. The occupation list is English only |
| An assisting role not recognized as one | 2 | Scrub Technician → performing laparoscopic surgery; Office Runner → preparing corporate tax returns |
| An injected phrase in a role description | 1 | A Retail Associate's description naming a "GMP pharmaceutical plant" |
| A labeling difference | 1 | fw-083, a Dental Receptionist with 30 months, for 2+ years as a dental receptionist. The dates cover it; the label judged the answer alone |

Word-sense collisions in descriptions aren't about titles. They're the main candidates for the parser investigation (Stage 3), or a later sense table.

## Checks

| Check | Result |
|---|---|
| Unit | 2,244 passed |
| Integration | 176 passed |
| Lint | Clean |
| Engine baseline after each step | 6, then 1, then 0 changes |
| New regression tests | 18 in `tests/ai-phase5-3.test.ts`: every corrected case, the classifications to keep, and variants for each title level |

The full suite, including the browser tests with flags off and on, runs at the freeze, before the sealed split is opened.

## Next

**Stage 2 (follow-up validation)** is ready to start, as planned:
- the reply reader uses the answer reader's ownership standards;
- specific personal evidence is required after supervision, delegation, observation or a request;
- the known gaps (fw-001, fw-004, fw-105) are fixed;
- every unsafe reply identified so far gets a test.

Stage 3 needs your approval after the package comparison.
