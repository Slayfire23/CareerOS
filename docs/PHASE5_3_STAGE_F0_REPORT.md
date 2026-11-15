# Phase 5.3 Stage F0: rules-v22, the "directed at the person" reader correction (opt-in)

November 14, 2026. **Owner-approved scope:** F0 only (design `docs/PHASE5_3_STAGE_F_DESIGN.md` §2.3, decision F-1). Constraints, all in force:
- rules-v21 stays the matching default and reads every text exactly as before;
- structured matching, citations, migrations and feature-flag wiring are untouched;
- `RULES_VERSION` (`rules-v21`) and the recognition version (`splits-v1.1`) are unchanged;
- no sealed split was opened. Only the hash guard and the `parts.eval.ts` counts-only check ran.

## 1. The bug and the correction

"My boss sends me out to install water heaters and fix leaks every day." The grammatical subject is someone else, so rules-v21 found no statement of the person's own, put the whole sentence in others' work, called a "did it myself" tick a mismatch, and read every split part as transferred. Passive "I'm sent out to…" gives no statement either. "I am assigned to…" already worked (F8).

**rules-v22** (`textRules: "v22"`) is rules-v21 plus one rule. A clause directed at the person is read as the person's own act, as if they had written "I install water heaters…". Every existing rule then applies to the act (negation, intention, helping, watching, overseeing, others' work, exposure, narrowing). The quote is the answer's own words, verbatim and at their own place, so the validator's citation check is untouched.

The rule is deliberately narrow:

| Reads as the person's own | Never |
|---|---|
| send, dispatch, assign, schedule, put + **me** (+ out) + **to** + an act | tell, ask, let, make (in opened data these are templates, injections, refusals and requests) |
| has / had / have + **me** + a bare act | a negation, modal, intention or condition on the directing verb (never, not, n't, would, could, will, wants to, going to, plans to, if, unless, when) |
| an optional "usually / often / always / also / then…" before the verb | "to" + a place, event or thing ("to a class", "to the site", "sends me what she finds", "sent me a link") |
| | "me and two techs" (mixed subject; kept as v21 reads it) |

## 2. Files changed

| File | Change |
|---|---|
| `src/lib/ai/evidence-boundary.ts` | `TextRules` gains `"v22"`; `isV21Family`; `directedAtPerson`; in `answerStatements`, a v22-only branch that reads the act as the person's own statement; `othersParts` gains a 5th parameter `v22` (default false) that leaves directed clauses out |
| `src/lib/ai/rules/answer-review.ts` | The three `=== "v21"` checks become `isV21Family`; `v22` is passed to `othersParts`; `othersDoWholeRequirement` gains an optional `v22` (default false) |
| `src/lib/ai/rules/follow-up-reply.ts` | Same plumbing: `isV21Family`, `v22` into `othersParts`/`disputed`, and directed clauses aren't counted as someone else's in the reply checks (v22 only) |
| `src/lib/ai/rules/structured-consistency.ts` | Same plumbing (`isV21Family`, `v22` into `othersParts` and `othersDoWholeRequirement`). The consistency logic itself is unchanged |
| `src/lib/ai/rules/split-recognition.ts` | Same plumbing (`isV21Family`, `v22` into `othersParts`). The approved patterns, D.2 and the version are unchanged |
| `tests/ai-rules-v22.test.ts` | 67 new tests (§4) |

With `rules` set to anything but `"v22"`, every changed line computes exactly what it computed before. The design listed `clauses.ts`; it wasn't needed, so it wasn't touched.

## 3. Results

### 3.1 The probes (written before the code)

Requirement A58, "Install and repair residential plumbing", with a "did it myself" tick for consistency.

| Probe | v21 (baseline, unchanged) | v22 |
|---|---|---|
| P1 "My boss sends me out to install water heaters and fix leaks every day." | no statement · Not enough info · mismatch · parts [–, –] (both transferred) | own, performed · **Supported** · consistent · parts [✓, ✓] |
| P2 "The company sends me to install water heaters and fix leaks in homes." | same as P1 | **Supported** · consistent · [✓, ✓] |
| P3 "Dispatch sends me out to install water heaters every day." | no statement · mismatch | **Supported** · consistent · [✓, –] |
| P4 "My supervisor has me install water heaters and fix leaks." | no statement · mismatch | **Supported** · consistent · [✓, ✓] |
| P5 "They usually send me out to fix leaks and unclog drains." | no statement · mismatch | Not enough info · consistent · [–, ✓] |
| P6 "My foreman assigns me to install water heaters on new builds." | no statement · mismatch | **Supported** · consistent · [✓, –] |
| P7 "The office schedules me to repair leaking pipes most mornings." | no statement · mismatch | Not enough info · consistent · [–, ✓] |
| P8 "My boss had me install water heaters and fix leaks for three years." | no statement · mismatch | **Supported** · consistent · [✓, ✓] |

Every v22 reading equals the v21 reading of the person's own words ("I install water heaters and fix leaks every day."), part by part. Nothing is transferred. P5 and P7 name only the repair part, so they stay at Not enough information, as their first-person forms do.

**Negatives:** all 17 read exactly as v21 (statements, verdict, consistency, recognition, others' work):
- tell, ask, let (refusal and permission), make;
- never, doesn't, wants to, is going to, would … if;
- "sends the plumbers", "to a class", "to the site", "told me to put … on my resume", "sends me what she finds", "sent me a link";
- "me and two techs".

**Own act, but not the work:** each reads like its first-person form under v21.

| Probe | Reading |
|---|---|
| "sends me out to help the plumbers install…" | assisted, Not enough info |
| "sends me out to watch the plumbers install…" | observed, Not enough info |
| "sends me to pick up parts for the plumbers who install…" | performed (picking up parts), Not enough info, no part shown |

### 3.2 The real-answer corpus and frozen fixtures (v21 vs v22)

| Set | Rows | Changed |
|---|---|---|
| Opened answers (review, remediation, interpret, shadow, follow-up answers, ownership benchmark) | 1,266 | **0** |
| Stage 3 probes | 392 | **0** |
| DD1 design rows | 226 | **0** |
| Recognition parity fixture (incl. 47 V5 probes and 11 D.2/Stage B controls): readings | 284 | **0** |
| The same 284 rows: recognition (parts, transferred, transferAll) | 284 | **0** |
| Follow-up replies (outcome, reason, question kind) | 320 | **0** |

Each row compared the verdict, the structured worst case (a "did it myself" tick), the consistency reason, every statement, and others' work.

**Why nothing changed:** the detector fires on **none** of the 1,976 distinct opened texts. The 19 texts with a "verb + me" phrase are the same 19 found in the design review. None is dispatched work:
- 7 are tell/ask templates or injections ("A career coach told me to put this here…", "my manager told me to tell you…");
- 4 are let refusals or permissions ("doesn't let me touch anything load bearing", "won't let me without the ticket");
- 3 are something received ("sends me what she finds", "sends me the output", "sent me a link");
- 5 are other tell/ask remarks ("People tell me I'm a natural leader", "ask me things", "if they tell me to").

So no difference needed explaining. The correction is exercised only by the constructed probes. Real dispatched-work answers are a gap in the opened data, not evidence the rule is safe on them (§5).

### 3.3 Suites

| Gate | Result |
|---|---|
| Unit | **3,045** pass (67 new) |
| Integration (local Supabase) | **191** pass |
| TypeScript, `prisma validate` | Clean |
| Migrations | Unchanged |
| Lint | 1 existing warning (`tests/eval/run-eval.eval.ts`), unchanged |
| Sealed guard / parts validate | 11 of 11 / pass |
| Recognition parity and isolation (`split-recognition.test.ts`) | 343 pass |
| Structured-form and consistency guards | Pass |
| Engine basis (2,121 rows) and follow-up sets (340 rows) | Engine **byte-identical** to the Stage E run; **0 of 340** follow-up rows changed (all five runs exit 0) |

## 4. New tests (`tests/ai-rules-v22.test.ts`)

- **Opt-in:**
  - the default stays v21, with `RULES_VERSION` and `RECOGNITION_VERSION` unchanged;
  - only the reader and its four direct users name `"v22"`;
  - nothing in `src` selects it (`textRules: "v22"`).
- **v21 baseline:** P1–P8 still give no statement, a mismatch, and no part shown.
- **v22 readings:**
  - P1–P8 read exactly as the person's own words;
  - every quote is verbatim at its own offset.
- **The 17 negatives** read identically to v21, and the detector refuses each.
- **The act keeps every first-person rule:** helping, watching, other work for others, a later sentence giving the work away, and a negated act.
- **Follow-up:** a reply naming dispatched work reads like its first-person form; v21 reads it as before.

## 5. Remaining risks

- **Opt-in only.** v22 changes nothing until it's adopted, and adoption is a separate decision (a Stage C-style review with a `RULES_VERSION` bump). Stage F's structured matching must not rely on v22 until then. Until it does, the dispatched-work mismatch stays fail-closed: Not enough information, and the person is asked.
- **No real dispatched-work answers.** The opened data holds none, so the false-positive rate on real text is unmeasured. The adoption review should add a constructed held-out set, or wait for real answers.
- **Being sent isn't always doing it.** "Dispatch sends me out to install water heaters, and the installer does it while I hold the light": a later clause giving the work away still counts (tested), but a weaker hint might not.
- **Not covered (false negatives, as v21):**
  - passive "I'm sent out to…";
  - "me and two techs" (the design suggested reading it as a "we" clause; F0 keeps the v21 reading, the more conservative choice, per probe N14);
  - "sends me to the site to install…" (a place first);
  - directing verbs beyond the approved list ("gets me to", "trusts me to").
- **An existing consistency property**, not new in v22: any performed own statement makes a "did it myself" tick "consistent", even when it's other work ("I pick up parts for the plumbers who install…"). The verdict stays Not enough information and no part is shown. Stage F's decision table should not treat "consistent" alone as showing the requirement.

## 6. Ready?

F0 is ready as an **opt-in** reader:
- every gate passes;
- v21 and all default behaviour are unchanged;
- the probes behave as specified.

Adopting v22 as the default isn't part of F0.
