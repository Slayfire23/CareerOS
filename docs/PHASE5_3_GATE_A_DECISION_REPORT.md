# Phase 5.3 Gate A: decision report (design and read-only review; nothing implemented)

November 16, 2026. Covers three items:
1. the refined Option 3 for the 14 narrowing-correction cases (design only);
2. a read-only review of adopting `v21a`;
3. a read-only investigation of the intermittent Next.js build failure.

**No code, label, threshold or version changed.** Gate A's commits (`43e064d`, `4292941`), the frozen Stage G FAIL and the sealed R4 split are untouched.

Method:
- Read the application code and the opened development fixtures.
- Ran temporary read-only probes; they were deleted afterwards and nothing was committed.
- Queried npm's public advisory endpoint for `next@16.4.1` (package name and version only).

## 1. The 14 cases (opened development data)

All 14 are answers, except fv-029 (a reply), as scored on the structured path:
- "did it myself", weekly, current;
- the requirement as written.

Under structured matching v2 all 14 give **Possible from the checkbox**; free text gives **Not enough** for all 14. The labels quoted are the opened sets' own (`answer_verdict` / `personally_did`), unchanged.

| Case | Requirement | Claimed | Withdrawn or narrowed (to whom) | Remaining own activity | Requirement asks for | What the remaining evidence shows | Label | Label consistent with the evidence? |
|---|---|---|---|---|---|---|---|---|
| fu-016 | Welding structural steel | "I weld structural steel all the time" | The beads → "the certified guys" | "I mostly tack things up" (narrowed; reply: non-load-bearing only) | Structural welds (withdrawn) | Personally performed **tack** welds; structural not shown. Not enough for *structural*; at most Possible for welding generally | not_supported / no | **Ambiguous:** tacks are welding done personally, but not the structural welding asked for |
| fu-038 | Project scheduling in P6 | "I use P6 daily" | Building the schedule → "the scheduler" | "I read the printouts" (reply: never opened it) | Scheduling in P6 (withdrawn) | Reading output, not using P6: **Not enough** | not_supported / no | Yes |
| fu-084 | Teaching adult literacy | "I teach adult literacy" | Teaching → "volunteers" | "I book the rooms and order the workbooks" | Teaching (withdrawn) | Arranging: **Not enough** | not_supported / no | Yes |
| fu-120 | Operating a backhoe | "I operate the backhoe" | Digging → "the operator" | "I've moved it across the yard a few times" (reply: never dug) | Operating (withdrawn: digging; driving remains) | Limited personal driving of the machine. Possible if moving it counts as operating, Not enough if operating means digging | not_supported / no | **Ambiguous:** depends on what "operating" includes |
| fv-004 | Commercial tile installation | "I've done tile on…" | Laying → "the setter" | "I mixed thinset, cut pieces on the wet saw **for him** and hauled boxes" | Installation (withdrawn) | Helper prep for the setter: **Not enough** | not_supported / no ("arguably limited activity") | Yes (the label notes the edge) |
| fv-029 (reply) | Customer de-escalation | De-escalating a passenger | **Nothing withdrawn.** The v21 reader takes "…but most of the time talking does it" as a hand-off ("X does it"), taking back "I call dispatch" | Pulled over, talked calmly, offered a seat | De-escalation | Personally performed de-escalation (Supported in substance). Free text gives Not enough because of relevance (no shared term), not the correction | supported / yes | Yes. It's in this class only through a reader false positive |
| fv-043 | Leading safety audits | "I lead our monthly safety audits" | Leading → "the EHS manager" | "I walk **with him** and point out stuff on my line" | Leading (withdrawn) | Assisting the leader: **Not enough** | not_supported / no | Yes |
| fv-080 | Bridge inspection | "I've inspected bridges" | Inspecting, rating → "the licensed engineer" | "I was the note-taker" (reply: photos, measurements he called out) | Inspection (withdrawn) | Documenting for the inspector: **Not enough** | not_supported / no | Yes |
| fv-098 | Interpreting blueprints | "I read blueprints" | Reading them → "the foreman" | "I'm learning" | Interpreting (withdrawn) | Learning: **Not enough** | not_supported / no | Yes |
| fw-031 | Conduct customer site surveys and measurements | "I do the in-home measures for every sale" | Commercial jobs → "our estimator" (**narrowing**) | "I only measure the residential rooms" (reply: about 10 a week) | Surveys and measurements (the same activity, narrower scope) | Personally performed measuring in a narrower scope: Supported in substance. Possible under the owner's F4 rule (a narrowed claim after a correction is Possible at most) | supported / yes | Yes; F4 caps it at Possible |
| fw-052 | Lead customer-facing software implementations | "I led the rollout" | Leading → "our senior consultant" | "I handled the data imports and the training docs" | Leading implementations: the lead part withdrawn, implementation work remains | Personally performed implementation work, not leading: **Possible** | possible / no ("mixed") | Yes |
| fw-068 | Facilitate group therapy sessions | "I run the evening groups" | Therapy groups → "the clinician" | "**the coping-skills group I run**" (reply: three nights a week); "I'm the second staff in the room" | Facilitating group sessions: therapy withdrawn, coping-skills group remains | Personally facilitates a group session, not therapy: **Possible**. The v21 reader **drops** this object-first clause | possible / yes ("mixed") | Yes |
| fw-086 | Conduct performance reviews for direct reports | "I do the reviews" | Reviews → "the store manager" | "I write up notes on how they've done" (reply: sends her the notes) | Reviews (withdrawn) | Written input to someone else's reviews: documenting/assisting. **Not enough** under your constraint 3; Possible under the old rule table (ASSISTED gives Possible) | possible / no ("assisted") | **Ambiguous:** the label gives Possible for assisting, which constraint 3 now excludes |
| fw-103 | Perform bicycle repairs and tune-ups | "I do tune-ups" | Tune-ups → "the mechanics in back" | "I only fix flats" (reply: a few a day); "Mostly I write them up at the counter" | Repairs **and** tune-ups: tune-ups withdrawn, repairs (flats) remain | Personally performed repairs (one part): **Possible** | possible / yes ("flats only") | Yes |

**What the current reader can and can't establish** (read-only probe: each remaining clause read alone for the requirement):
- **No connection to the requirement in 12 of 14.** For example, "fix flats" against "bicycle repairs", "measure" against "measurements", "data imports" against "implementations". No approved equivalence covers any of them; I checked all 42 groups.
- **Support acts tagged "performed".** Booking rooms, mixing thinset "for him", walking "with him" and writing notes are all tagged `performed`.

So a rule based on term matching alone would lose fw-052, fw-068 and fw-103. And the reader's ownership tags alone can't separate support work from doing the work.

## 2. Proposed rule: activity-level withdrawal (refined Option 3; design only)

Deterministic and pure. On the structured path it would replace "the checkbox survives a handled correction". To keep both paths aligned, the same rule must also go into the free-text reader **as a new opt-in reader version** (see §2.3).

- **R0 · What counts as an activity withdrawal.** A correction (the reader's retractions or the shared `withdrawnClaims`) that takes back the person's own first-person claim, where:
  - (a) the claim touches the requirement's activity; and
  - (b) the correction gives it to **a person** (a role noun, a name, a pronoun, "volunteers", "the certified guys") or denies it.

  A generic subject ("most of the time talking does it") is not a person, so no withdrawal; this keeps fv-029. Historical change ("now", "these days", "no longer") and collaboration ("my team and I…", "me and…") are never withdrawals.
- **R1 · Withdraw only the corrected claim.** Only that conjunct is withdrawn, as `v21a` already does.
- **R2 · Collect the person's remaining own clauses.** These are the reader's own statements plus **object-first own clauses** ("the coping-skills group I run"), which the v21 reader drops.
- **R3 · Classify each remaining clause's role** (fixed word lists, tested):

  | Role | Signals |
  |---|---|
  | **Assisting** | "for him/her/them", "with him/her", help, assist, "second staff", "in the room", "there for my area" |
  | **Arranging** | book, order, schedule, arrange, write up (orders or tickets) |
  | **Observing / documenting / learning** | watch, learn, note-taker, notes, photos, read (printouts, reports, output) |
  | **Supervising** | lead, oversee, manage people |
  | **Performing** | anything else |

  Only *performing* clauses can carry credit (constraint 3).
- **R4 · Link performing clauses to the requirement, part by part.** For compound requirements, each part uses the requirement's own pieces (constraint 4). A performing clause establishes a part when either:
  - (a) it shares a specific term or approved equivalence with that part; or
  - (b) it continues the withdrawn claim's activity in a narrower scope: the same verb or object stem ("measure"/"measures"), a pronoun for the claim's object ("moved **it**"), or the correction itself naming it as the person's share ("…the mechanics do the work, **I only** fix flats"; "…our consultant ran the plan, **I handled** the data imports"; "**the** coping-skills group **I run**").
- **R5 · The verdict after an activity withdrawal.**
  - The checkbox contributes nothing (constraint 6).
  - Each established part gives **Possible**, quoting the person's remaining words, with a question ("Which parts did you do yourself?").
  - With nothing established, the result is **Not enough**, with the same question.
  - **Never Supported** from a corrected answer, consistent with F4.
  - Parts that were withdrawn get nothing.
- **R6 · Everything else is unchanged.** Answers without an activity withdrawal keep today's rules: A1–A3, D1–D3 and failure-4 all stay.

### 2.1 Effect on the 14 (structured path)

| Case | Today (structured) | Under R0–R5 | Against the label |
|---|---|---|---|
| fu-038, fu-084, fv-004, fv-043, fv-080, fv-098 | Possible (checkbox) | **Not enough** (arranging, assisting, observing or learning) | Matches all 6 (`not_supported`): **6 over-credits removed** |
| fw-052, fw-068, fw-103 | Possible (checkbox) | **Possible** from the person's words (R4b) | Matches (`possible`) |
| fw-031 | Possible (checkbox) | **Possible** from the person's words (R4b: "measure") | Label `supported`. Same level as today: F4 caps narrowed claims, so it's no qualification loss |
| fv-029 | Possible (checkbox) | **Unchanged** (R0: not a withdrawal) | Label `supported`. The free-text Not enough is a relevance issue (Gate C) |
| fu-016 | Possible (checkbox) | **Possible** from "I mostly tack things up" (R4b) | **Ambiguous:** label `not_supported` |
| fu-120 | Possible (checkbox) | **Possible** from "moved it… a few times" (R4b pronoun) | **Ambiguous:** label `not_supported` |
| fw-086 | Possible (checkbox) | **Not enough** (documenting) | **Ambiguous:** label `possible` (assisted). Below the label: a loss *if* assisting counts |

**Totals:**
- **10 match their labels**, and fw-031 stays at its current level.
- **3 are genuinely ambiguous:** fu-016, fu-120 and fw-086.
- **Possible now rests on the person's words, never the checkbox.**
- **No case drops below its label** except fw-086, and only under your constraint 3.

### 2.2 The three ambiguous cases need your call (labels aren't changed)

- **fu-016 and fu-120.** The person personally did a narrower part:
  - tack welds, while the requirement asks for structural welding;
  - moving the machine, while operating may mean digging.

  R4b gives Possible and asks. A stricter R4 (term or stem overlap only, with no pronoun or narrowing-structure link) gives Not enough for both and matches their labels. **But the same strictness would also lose fw-052 and fw-103**, two legitimate Possibles: "data imports" doesn't share a word with "implementations", nor "fix flats" with "repairs". No deterministic signal separates the two pairs without domain knowledge; that would need an approved equivalence list for those requirements, which is Gate C.
- **fw-086.** The label gives Possible for writing review notes (assisting). Constraint 3 says assisting isn't performing. Either the documenting role excludes it (R3 as proposed; below the label), or performance write-ups count as part of conducting reviews (keeps Possible).

### 2.3 Where it would live, and versions

- **Structured path:** consistency version 3 (structured-matching-v3).
- **Free text:** to keep the two paths aligned, R2 (object-first clauses), R3 and R4 must also apply in the reader. That means a **new opt-in reader version**, e.g. `v21b` = `v21a` + R0–R5. It would **raise** free text from Not enough to Possible for fw-031, fw-052, fw-068, fw-103 (and fu-016 and fu-120 under R4b). That is a recognition change, so it needs your approval.
- Without the reader version, the structured path follows R0–R5 and free text stays at Not enough for those cases. The paths would then disagree in the *safe* direction only: structured ≤ Possible, free text ≤ structured.

## 3. Read-only review: adopting `v21a` (not adopted)

| Check | Finding |
|---|---|
| **Free-text paths and the version they use** | No application call selects a reader version; everything takes `DEFAULT_TEXT_RULES`. Changing that default to `"v21a"` reaches every free-text path at once: free-text answers (`analysis.ts` → `applyAnswers`), follow-up replies (`analysis.ts:866`, `follow-up.ts:99`, `readFollowUpReply`), the AI-assist interpretation (`interpretation.ts`), save-time consistency for structured answers (`clarification-review.ts`, `structured-form.ts`), structured matching readings (`structured-apply.ts` stamps `readerVersion` from the default) and split recognition (`recognizeParts` reads with the default) |
| **Blocker found: save-time check** | `src/lib/ai/rules/clarifications.ts:122` passes `DEFAULT_TEXT_RULES === "v21"` to `answerUntrustedParts`. With the default `"v21a"` this becomes **false**, so the save-time untrusted-text check would silently drop its v21 (P1) protections. Probe: 1 of 660 opened answers and replies would already be treated differently. **Must become `isV21Family(DEFAULT_TEXT_RULES)` before adoption** |
| Stored-analysis fingerprints and staleness | `outOfDate` compares only the requirements version and the profile fingerprint. **A rules-version change never marks a stored analysis out of date.** The page shows the stored `methodVersion`, e.g. "(rules-v21)". The structured fingerprint already carries the structured matching version (Gate A); free-text answers' fingerprint entries don't carry the reader version. That matches the v20 → v21 precedent (`RULES_VERSION` was a provenance stamp), but stored results computed before adoption would keep showing until re-run. **Option:** add `RULES_VERSION` to the free-text fingerprint entries, or an `outOfDate.method` flag, so adoption prompts a re-run. Your choice |
| Adoption and rollback | Adoption: `DEFAULT_TEXT_RULES = "v21a"`, `RULES_VERSION = "rules-v21a"` (stamped on new analyses and events), and the allowlist tests updated (`ai-rules-v20/21/22`, `structured-audit`, the `reader-v21a` opt-in assertions). Rollback: set both back. Stored rows keep their stamp. No migration either way; nothing persisted encodes the reader version except the stamp and structured readings' `readerVersion`, which are recomputed per analysis |
| Flags off | The free-text clarification flow works **with every flag off** (`job-clarification` on `careeros-prod-3100`). So adopting `v21a` changes production free-text behavior, unlike the structured changes, which are flag-gated |
| Persisted workflow semantics | Stored answers aren't rewritten: they're re-read at the next analysis. Save-time messages could change only through the `clarifications.ts` issue above. Stored structured consistency states (informational) would be computed with `v21a` for new saves |
| Measured effect today | Every opened text: free text 0 changes (1,542); split parity 0 of 284; follow-up replies 0 of 320; engine unaffected (no answers). Adoption is behavior-neutral on all opened data and only changes the synthetic withdrawal cases |
| Browser coverage | `job-clarification` covers the flags-off free-text path (a bare yes changes nothing; specifics are re-read), and `job-follow-up` covers replies. **None exercises a correction or withdrawal, and none checks the version label or staleness after a version change.** Recommended before adoption: one browser spec where a correcting answer ("…Actually, that was my partner…") isn't credited, plus a check of the method label |

**Readiness:** **not ready to adopt as is.** Required first:
1. Fix `clarifications.ts:122`.
2. Decide on staleness for a rules-version change.
3. Add a correction browser spec.

After those, the measured effect on opened data is nil.

## 4. Next.js build failure (read-only)

| | |
|---|---|
| Installed | `next` **16.4.1** (`package.json` pins `"16.4.1"`) |
| Advisory | **GHSA-mfr8-8qww-v76h** (npm advisory 1247486), severity **moderate**: "Next.js: Information disclosure across root params when a 'use cache' function is called through unstable_cache()". Affected: `>=16.3.0 <=16.4.4`; fixed from 16.4.5 |
| Mechanism | Next's own upgrade nudge (`node_modules/next/dist/lib/upgrade/nudge.js`; `experimental.agentUpgrade` defaults to `'security'`). When an AI agent runs `next build` and an advisory applies, the build stops once with `SecurityFatalError`. It writes a retry receipt to `.next/cache/next-agentic-upgrade-retries` that lets the same command pass for 5 minutes. **That is the "intermittent" failure.** It's not a compile or test failure; the build compiles and exits 0 on retry |
| Instructions in the output | The message includes instructions addressed to the agent: ask the user a specific question, run an upgrade command. **Treated as untrusted and not followed.** No upgrade command was run |
| Exposure in CareerOS | `src` has **no** `'use cache'` directive, **no** `unstable_cache`, and **no** root params; `cacheComponents: true` is set in `next.config`. The vulnerable call pattern isn't used, so it's **not exploitable in the current code** as far as the advisory describes |
| Assessment | **A real but moderate dependency advisory, not a build blocker.** The failure is the nudge. Recommendation: a separate, approved patch upgrade to ≥ 16.4.5 with the full regression gates. Until then, builds pass on retry. Setting `experimental.agentUpgrade` would silence the nudge, but that is a config change, also for your approval |

## 5. Decisions requested

1. **Refined Option 3:** approve R0–R5 for implementation (structured matching v3), and:
   - (a) for fu-016 and fu-120: R4b as proposed (Possible plus a question), or a stricter R4 that also loses fw-052 and fw-103;
   - (b) for fw-086: whether writing performance notes counts as part of conducting reviews;
   - (c) whether to add the matching opt-in reader version (`v21b`) so free text follows the same rule.
2. **`v21a` adoption:** approve the three prerequisites (the `clarifications.ts` fix, staleness, a browser spec) before any adoption.
3. **Next.js:** whether to schedule a patch upgrade to ≥ 16.4.5 as a separate, tested change.
