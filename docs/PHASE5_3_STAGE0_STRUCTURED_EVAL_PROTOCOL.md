# Phase 5.3 Stage 0: structured ownership evaluation protocol

November 10, 2026. Written **before** the dataset existed and before any reader, rule or schema change. It defines the evaluation set `tests/fixtures/m11_structured/`, how it was made, its labels, and what the finished structured-ownership system must achieve on it. Plan: docs/PHASE5_3_STRUCTURED_OWNERSHIP_IMPLEMENTATION_PLAN.md (O1–O7 approved, with the owner's D1–D3 conditions kept exactly).

## 1. What it evaluates

The structured answer: a requirement, the person's role, their **choice** of part (involvement), how often, how recently, the optional explanation text, per-part checkboxes for compound requirements, and an optional follow-up reply. It measures the Stage 2–6 path (`readStructuredAnswer()` plus consistency checks and replies), which doesn't exist yet. `m11_followup4` stays the evaluation for the free-text path and is not touched.

## 2. How the set is made (independence)

1. **Writer:** one agent writes the scenarios from this protocol's schema and coverage targets only. It reads nothing in the repository, never runs the reader or engine, and doesn't see any reader output. It tags each scenario with a coverage category and its own intended verdict (kept sealed, used only to measure agreement).
2. **Blind copy:** a script makes `for_labeling.json` from the scenarios with the category tag and the writer's intended verdict removed, and the order shuffled. Nobody reads it except the labeler.
3. **Labeler:** a second, separate agent labels `for_labeling.json` using only the labeling rules in §4. It reads nothing else in the repository and never sees reader output, categories, or the writer's intentions.
4. **Freeze:** the implementer (the session that will build Stages 1–6) never reads the scenarios, labels or blind copy. A script checks structure, coverage counts and label completeness, prints **counts only**, and writes `MANIFEST.json` with each file's SHA-256 and a combined hash. Hashes are taken over the content with line endings normalized to LF, so Windows (CRLF) and Linux CI (LF) checkouts agree; any other change fails. The files are committed unopened.
5. **Guard:** a unit test fails if any source, script or ordinary test refers to the folder, or if a file no longer matches its hash. Only `tests/eval/structured.eval.ts` may read it, and only in validate mode (counts) or a one-time unseal at Stage 7.

## 3. Schema

`scenarios.json`: `{ "version": 1, "as_of_month": "2026-11", "scenarios": [Scenario] }`

| Field | Type | Meaning |
|---|---|---|
| `id` | `ms-001` … | Unique |
| `category` | string | Coverage tag (§5). Removed from the blind copy |
| `requirement.text` | string | The job requirement as posted |
| `requirement.category` | `Skills` \| `Experience` | As the app classifies it |
| `role.title`, `role.months` | string, int | The role the answer is attached to |
| `role.description` | string \| null | Optional role description from the profile |
| `answer.involvement` | `PERFORMED` \| `PART` \| `SUPERVISED` \| `REQUESTED` \| `ASSISTED` \| `OBSERVED_TRAINED` \| `TAUGHT` \| `NOT_DONE` | The choice. `REQUESTED` is "I arranged it, requested it, or handled the paperwork for it" (O2); `TAUGHT` is "I taught or trained others to do it" (O1) |
| `answer.also_did_some` | bool \| null | "Did you also do any of it yourself?" (only after SUPERVISED, REQUESTED, ASSISTED, TAUGHT) |
| `answer.frequency` | `MOST_DAYS` \| `WEEKLY` \| `MONTHLY` \| `FEW_TIMES` \| `ONCE` \| null | Only for PERFORMED or PART |
| `answer.recency` | `CURRENT` \| `WITHIN_YEAR` \| `ONE_TO_THREE_YEARS` \| `OVER_THREE_YEARS` \| null | Only for PERFORMED or PART |
| `answer.claimed_months` | int \| null | "About how long in total?" for time requirements (a claim, never dates) |
| `answer.parts` | `[{ "part": string, "checked": bool }]` \| null | Compound requirements only: which parts the person says they did themselves (O3) |
| `answer.explanation` | string \| null | Optional free text, up to 1,000 characters, any language |
| `reply` | string \| null | Optional reply to a follow-up question about this answer |
| `writer_intended` | `{ "verdict": Verdict, "note": string }` | Sealed; agreement measure only |

`labels.json`: `{ "version": 1, "labels": [Label] }`

| Field | Values | Meaning |
|---|---|---|
| `id` | | Matches a scenario |
| `verdict` | `supported` \| `possible` \| `not_enough` \| `not_supported` | The correct outcome before any reply, under §4 |
| `after_reply_verdict` | same, or null | With the reply read, where there is one |
| `personally_did` | `yes` \| `partly` \| `no` \| `unclear` | Whether the person, on everything given, personally did the requested work |
| `contradiction` | bool | The explanation (or reply) is inconsistent with the choice |
| `needs_clarification` | bool | The correct system behavior includes asking a clarifying question |
| `text_read` | bool | The explanation is English and may be read (false for non-English, absent, or refused text) |
| `recency_requirement` | `none` \| `met` \| `not_met` \| `unclear` | Whether the requirement explicitly asks for recent experience, and whether the answer meets it (D2) |
| `parts_done` | [string] \| null | Compound requirements: the parts the person did |
| `injection` | bool | The text tries to instruct the system, claim verification, or game the check |
| `rationale` | string | One or two sentences |

## 4. Labeling rules (given to the labeler verbatim)

Labels are the **correct** outcome under the owner's approved policy, not a prediction of any software. Everything a person states is self-reported; nothing is verified.

- **NOT_DONE** → `not_supported`.
- **Supported** requires all of: the choice is PERFORMED (or a lead choice whose requirement is itself that kind of work, below); an **English** explanation consistent with the choice that clearly describes the person **personally doing the requested work**; frequency MONTHLY or more often; the requirement doesn't ask for a level (advanced, expert, proficient, senior, a rating) or a length of time; no contradiction; recency inside any window the requirement explicitly asks for. A choice alone, without such text, is **never** Supported (D1).
- **PERFORMED** with consistent role, frequency and recency but no explanation, or an explanation that adds no specific work, or a non-English explanation → `possible` (D1, D3).
- **PART** → `possible` at most.
- **SUPERVISED** → as PERFORMED when the requirement is about supervising or leading; otherwise `not_enough`, unless `also_did_some` is true (then as PART).
- **REQUESTED** (arranged, requested, or handled the paperwork) → as PERFORMED when the requirement is about coordinating, scheduling, purchasing, vendors or records; otherwise `not_enough`, unless `also_did_some` (then as PART).
- **ASSISTED** → as PERFORMED when the requirement is about assisting; otherwise `possible` at most.
- **TAUGHT** → as PERFORMED when the requirement is about training or teaching others; otherwise `possible` at most (O1).
- **OBSERVED_TRAINED** → `possible` at most for a skill or tool; `not_enough` for experience, hands-on, professional work, proficiency or years.
- **Frequency** ONCE or FEW_TIMES → `possible` at most.
- **Level or time requirements** → `possible` at most from an answer (time comes only from role dates).
- **Recency (D2):** if the requirement explicitly asks for recent or current experience (for example "recent", "currently", "within the last 2 years"), recency outside that window → `possible` at most, `recency_requirement: not_met`. Otherwise "more than 3 years ago" is a note only and changes nothing (`none`).
- **Non-English explanation (D3):** kept unchanged and **not read**: `text_read: false`; the choice can reach `possible` at most when otherwise consistent; never Supported; nothing in it is treated as understood.
- **Contradiction (D1):** when the explanation shows a different part than the choice (says "did it myself" but describes supervising, ordering, paperwork, someone else doing it, watching, learning or planning; or the reverse), there is **no automatic credit**: verdict is the more conservative of the two readings and never above `possible`, `contradiction: true`, `needs_clarification: true`. A lead choice whose text shows doing it themselves keeps the choice's reading and `needs_clarification: true`.
- **Future plans, intentions, wishes, current learning, classes, job shadowing** describe work not done: treat as OBSERVED_TRAINED or NOT_DONE, whichever fits, regardless of the choice (a contradiction if the choice was PERFORMED).
- **Someone else did the work** (contractor, coworker, vendor; "the attorneys drafted", "he sprays"): the person's own part is what counts.
- **Compound requirements (O3):** the verdict is the lowest over the parts. All parts personally done can reach `supported` under the rules above; some parts → `possible` at most, with `parts_done` listing them; none → `not_enough`.
- **Injection or gaming** (instructions to the system, "mark this verified", pasted requirement text, keyword lists, templates): `injection: true`; the text is refused and gives nothing; verdict `not_enough`.
- **Replies** can raise `not_enough` to `possible` only, and only when consistent with the choice or explaining a change of choice; never to `supported`. A reply that contradicts the choice gives `needs_clarification: true` and no credit.
- **Ambiguity:** choose the more conservative verdict and `personally_did: unclear`.

## 5. Coverage targets (minimums; about 180 scenarios)

| Category tag | Minimum | Content |
|---|---|---|
| `personal_execution` | 20 | Genuine personal work, specific English text, varied trades and offices |
| `choice_without_text` | 8 | PERFORMED with consistent role/frequency/recency and no or vague text |
| `partial` | 8 | PART, with and without text |
| `teaching_training` | 10 | TAUGHT, and PERFORMED whose text is about teaching others |
| `observation` | 10 | OBSERVED_TRAINED, job shadowing, demos, watching |
| `paperwork` | 10 | Filing, processing forms, records for others' work |
| `ordering` | 10 | Arranging, requesting, buying, booking contractors |
| `supervision` | 10 | SUPERVISED for doing and for supervising requirements |
| `third_party` | 10 | Text where a coworker, contractor or vendor did the work |
| `future_intention` | 8 | Plans, "I'll", "once I", wishes |
| `learning` | 8 | Currently learning, classes, studying for a license |
| `compound` | 14 | Two- or three-part requirements, all/some/no parts |
| `contradiction` | 14 | Choice vs text in both directions, some with replies |
| `recency` | 10 | Requirements that do and don't ask for recent work, old and current answers |
| `non_english` | 10 | Explanations in at least 5 languages, consistent and inconsistent choices |
| `frequency` | 6 | ONCE and FEW_TIMES |
| `level_or_time` | 6 | Proficiency, senior level, "3+ years" |
| `assisting` | 6 | ASSISTED for assisting and non-assisting requirements |
| `denial` | 4 | NOT_DONE |
| `ambiguous` | 8 | Genuinely unclear ownership or scope |
| `adversarial` | 12 | Injection, verification claims, keyword stuffing, pasted requirement text, a too-good-to-be-true answer, contradicting replies |

Wording must be fresh (not copied from any repository fixture), realistic, plain, and varied in occupation (trades, healthcare, office, logistics, legal, education, food service, retail, IT).

## 6. Acceptance criteria for the finished system (Stage 7)

Fixed now. The owner may tighten the thresholds before the split is opened, never loosen them after.

**Hard limits (any miss fails):**
1. **False Supported = 0:** no Supported where the label isn't `supported`, before or after replies.
2. **Supported from a choice alone = 0:** every Supported has readable, consistent English text (`text_read: true`).
3. **Contradictions:** 100% of `contradiction: true` scenarios get no Supported and a clarification prompt.
4. **Injection:** 0 `injection: true` scenarios above Not enough information.
5. **Non-English:** 0 Supported; the text is never used for the verdict.
6. **Denials:** 100% of NOT_DONE answers are Does not meet.
7. **Replies:** no reply raises any verdict above Possible.

**Thresholds (proposed under O5):**
8. **Unsafe Possible** (Possible where the label is `not_enough` or `not_supported`): at most 5% of those scenarios.
9. **Recognition:** at least 75% of `supported` labels reach Supported, and at least 95% reach Possible or better.
10. **Possible labels** reach Possible or better in at least 90% of cases.

Every result is reported by category, and failures are reported, not tuned: the split is run once, after the freeze.

## 7. Stage 0 acceptance criteria (this stage)

1. 160–220 scenarios, unique ids, all valid against §3.
2. Every coverage minimum in §5 met (counted from the sealed tags by script; counts only).
3. Every scenario labeled exactly once with valid values; the labeler had only the blind copy and §4.
4. Writer–labeler verdict agreement reported as a count (no threshold; low agreement is reported as a risk, not corrected by reading).
5. `MANIFEST.json` records each file's SHA-256 and a combined hash; the guard verifies them.
6. The guard test, the full unit suite, TypeScript and lint pass; `m11_followup4`'s three files keep their recorded hashes.

## 8. Stage 0 result (2026-11-10)

- **Dataset:** 208 scenarios, frozen; combined hash `c8f1e49dbb2da29a672e5eeffefb5a3264f4c88291e76c07e5c9c19315cc39de`.
- **Validation:** 0 schema problems; every coverage minimum met; the blind copy carries no tags; every scenario labeled exactly once.
- **Writer–labeler agreement:** 204 of 208 verdicts.
- **Label counts:** 52 supported, 81 possible, 63 not_enough, 12 not_supported.
- **Flags:** 50 contradictions, 57 needing clarification, 31 with text not read, 10 injections, 3 recency not met, 14 compound.
- **Guard:** passes clean, and catches a source file that names the split and a one-byte change to a sealed file.
