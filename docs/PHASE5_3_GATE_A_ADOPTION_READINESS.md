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
- **Continuation of the withdrawn claim.** A narrower-scope version of the same activity (same verb or object stem: "measure"/"measures"), or the person's stated share inside the correction ("…the mechanics do the work, **I only** fix flats"), still has to satisfy (a). "Fix flats" establishes "repairs" only through an approved repair equivalence.

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
| fw-052 Lead software implementations | Possible (checkbox) | **Not enough** unless "data imports" is approved as implementation work, otherwise Possible | possible | Under R4(a) as revised, "data imports" doesn't name the asked activity. **A loss against the label without an approved equivalence.** Owner choice: approve "data migration/imports" as implementation work, or accept |
| fw-068 Facilitate group therapy sessions | Possible (checkbox) | **Possible** (names "group"; facilitating a group session; not therapy) | possible | Needs the object-first clause (R2) |
| fw-086 Conduct performance reviews | Possible (checkbox) | **Not enough** (documenting) | possible | Decision 3. Documentation is preserved for documentation requirements |
| fw-103 Bicycle repairs and tune-ups | Possible (checkbox) | **Possible** only if "fix" is an approved repair equivalence, else Not enough | possible | **A loss against the label without the equivalence.** Owner choice |
| fv-029 Customer de-escalation (reply) | Possible (checkbox) | **Unchanged** (no withdrawal) | supported | Free-text relevance gap → Gate C |

**Remaining open points:**
1. **fw-052 and fw-103:** decision 1's "names the activity" test needs two approved equivalences ("fix" → repair; data import/migration → implementation work). Without them, both lose Possible against their labels.
2. **fu-120:** the label differs from decision 2's prospective policy.
3. **General ASSISTED rule:** the rule table still gives Possible for an "I assisted" *choice* (unrelated to a correction). R3's "assisting gives nothing" applies only after an activity withdrawal. Whether to align the general rule is a separate decision.

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

- **Adopting `v21a`.** The prerequisites from the decision report are now done: the save-time fix and staleness. A browser spec for a correcting answer is still missing.
- **Next.js:** a separate patch upgrade to ≥ 16.4.5 for GHSA-mfr8-8qww-v76h (moderate; the affected API isn't used in `src`). No dependency changed here.
