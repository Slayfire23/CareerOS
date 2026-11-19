# Phase 5.3 Stage F3: `candidate_choice` citations and validation

November 14, 2026. **Owner-approved scope:** F3 only (design `docs/PHASE5_3_STAGE_F_DESIGN.md` §3.1, decision F-4, conditional). Constraints, all in force:
- structured matching stays disconnected: nothing calls `matchStructuredAnswer` or builds choice evidence;
- no verdict, score, flag, schema, reader, recognition or `splits-v1.1` change;
- one owner-approved UI exception (§2.1);
- no sealed split was opened.

## 1. Files changed

| File | Change |
|---|---|
| `src/lib/ai/choice-evidence.ts` | **New**, pure. The choice evidence item, its fixed wording, the integrity check, the citation, and the lapse and deletion id helpers |
| `src/lib/ai/match-validation.ts` | `candidate_choice` added to `RuleBasis`. The validator accepts choice citations only under the rules in §4 |
| `src/lib/ai/evidence.ts` | `MatchRequest.structured_choices?` (optional; nothing sets it). `EvidenceOrigin` gains `"candidate_choice"`. `citationOrigin` keeps its narrower return type |
| `src/lib/ai/analysis.ts` | One line in `maskRevoked`: a `choice:<id>` citation lapses with its answer, like `experience:<id>` |
| `src/lib/ai/answer-deletion.ts` | One line in `scrubAnalyses`: deletion scrubs `choice:<id>` as well as `experience:<id>` |
| `src/app/dashboard/jobs/[id]/match/page.tsx` | **The approved one-line exception** (§2.1) |
| `tests/choice-evidence.test.ts` | 31 new tests |
| `tests/integration/structured-choice-lifecycle.integration.ts` | 6 new integration tests |
| `tests/ai-structured-answer.test.ts` | The rule-table guard lists `choice-evidence.ts` as a types-only user, and checks that it imports types only |

### 2.1 The UI exception (owner-approved, one line)

```ts
candidate_choice: "Applicant's structured answer. Self-reported: CareerOS hasn't independently verified it",
```

This was added to `RULE_SOURCE` only because TypeScript requires every `RuleBasis` to have a label. The first wording ("Self-reported, not verified") failed the existing guard that "verified" may appear only as "hasn't independently verified", so it uses that phrase.

**Verified identical:**
- `git diff` shows 1 insertion, 0 deletions;
- the 14 existing labels are byte-identical;
- the rest of the file is identical;
- the match, clarification and dark-mode browser specs pass against a production build with the flags off, before and after the wording fix. The structured-form spec skips by design without its flag.

No citation display, layout or behaviour changed. Displaying `choice:` citations is F5 work.

## 2. Contracts

### 2.2 The choice evidence item

```ts
type ChoiceEvidence = { id: `choice:<answer uuid>`; kind: "choice"; answer_id; involvement; frequency; recency; statement };
```

| Property | Detail |
|---|---|
| Not evidence | It lives in `MatchRequest.structured_choices`, never in `evidence`. The engine, AI providers (`evidenceForRules`/`evidenceForAi`) and the fingerprint never see it (tested) |
| Distinguishable | Its own kind and id, and its own origin, `candidate_choice`, so it can't pass for resume, profile, role or answer text (`experience:<id>`). Its id is the same answer's (F1's `experience:<id>` is kept), so there's no new record and nothing to orphan |
| Fixed wording, never the person's | `statement` is CareerOS's text built from the form's own labels, for example: "Structured answer, self-reported: CareerOS hasn't independently verified it. Choice: I did this work myself. How often: Weekly. Most recently: It's part of my job now." |
| Integrity | `choiceEvidenceIsIntact` rebuilds the item from its answer id and choice; any edited id, wording, answer or kind fails |
| None for a denial | `buildChoiceEvidence` gives none for "haven't done this", an invalid choice, or an id that isn't an answer UUID |

### 2.3 The validator

| Rule | Rejection message |
|---|---|
| Every choice item in the request must be intact and unique, and must not collide with an evidence id | "invalid structured choice" (the whole response) |
| A choice citation must point at a choice that was sent | "citation refers to evidence that was not sent" |
| Its quote must be exactly the choice's `statement`: never the person's words, a fragment, or anything added | "a choice citation must quote the choice as CareerOS words it" |
| A choice may be cited only by a `candidate_choice` result. So no Supported, `candidate_answer`, rules evidence or language-model result can cite one | "a structured choice cited outside a choice result" |
| `candidate_choice` is **Possible only** | "a structured choice can show Possible at most" |
| `candidate_choice` cites exactly one citation, its choice, and nothing beside it | "a choice result must cite its choice, and only that" |
| `candidate_choice` comes from the rules (never a local-AI method). A rule basis is already refused for language-model providers | "a choice result must come from the rules" |

`evidenceSources` reports `candidate_choice` for a choice citation, so it's never "profile" or "candidate_answer".

## 3. Supported and Possible

- **Supported is unchanged.** It still needs verbatim evidence. `candidate_answer` still needs the answer's own words, verbatim (tested). A choice can't appear in a Supported finding under any basis (tested for `candidate_choice`, `candidate_answer`, `listed_skill`, `described_in_work`, `employment_dates`, and none).
- **Possible from a choice alone** is valid only as `candidate_choice` citing its own choice.
- **The F2 → F3 bridge (tested):**
  - F2's choice-only results (PERFORMED, PART, ASSISTED, TAUGHT, OBSERVED_TRAINED) validate as Possible with their choice citation;
  - F2's Supported validates as `candidate_answer` with the person's verbatim words.
- **Rules responses are unchanged.** For a request with or without choices they are byte-identical, and validate identically.

## 4. Evidence lifecycle

Corrections and revocations re-run the analysis. So each test writes the stale choice citation into the newest stored analysis **after** the change, and masking alone must catch it. Every test has a positive control.

| Event | Result (integration, every flag state: form on, review only, none) |
|---|---|
| Created | A `candidate_choice` citation of an active answer stands. F1's `experience:<id>` is kept; the choice id is the same answer's |
| Corrected | The earlier version's choice citation is masked ("This relied on an answer you revoked. Run the analysis again.") |
| Replaced (superseded by a new structured answer) | Masked. The current answer's choice still counts |
| Revoked | Masked |
| Permanently deleted | Every stored choice citation of every version is scrubbed, across all analyses. No `candidate_choice` finding remains; counts are recomputed; nothing is orphaned |
| Another answer lapses | Doesn't mask this answer's choice |
| Free-text answers | Citations, correction and deletion behave as before |

**Mutation checks:**
- reverting the `maskRevoked` line fails exactly the three masking tests;
- reverting the deletion line fails the deletion test.

So each change is exercised directly.

## 5. Regression

| Gate | Result |
|---|---|
| Matching unchanged | No change since F2 to the reader, recognition, the rule table, consistency, the F2 module, answer review, the engine, config or components. Rules responses with and without choices are byte-identical |
| Engine basis (2,121 rows), follow-up sets (340 rows) | Engine **byte-identical** to F2; follow-up: **0 of 340** rows differ on any field (only the timing field `latency`); all five runs exit 0 |
| Unit | **3,732** pass (31 new) |
| Integration | **207** pass (6 new) |
| TypeScript, `prisma validate`, production build | Clean |
| Schema and migrations | Unchanged |
| Lint | 1 existing warning, unchanged |
| Sealed guard / parts validate | 11 of 11 / pass |
| Parity | 343 pass |
| Browser specs (flags off, production build) | Match, clarification and dark-mode specs pass; the structured-form spec skips by design |

## 6. Remaining risks

- **The page can't render a choice citation yet.** It looks up `EVIDENCE_SOURCE` by the id prefix, which has no "choice". `ORIGIN_NOTE` would also call it "From your profile". **F4 must not store `candidate_choice` findings before F5 updates the page**, or the two must land together.
- **An F-6 explanation must not state a duration.** The validator's existing duration check rejects any figure in an explanation that the requirement or the dates don't support, so a claimed-months explanation has to avoid the number.
- **Masking flag-off structured findings (F-9) is F4 work.** F3 adds only answer-lapse masking for choice citations.
- **`structured_choices` must stay rules-only when F4 builds requests.** The validator already refuses choice citations from language-model providers, and no AI request should carry the field.

## 7. Ready for F4?

Yes, as F3:
- every acceptance criterion holds;
- matching is unchanged;
- structured matching stays disconnected.

F4 hasn't started; it needs your approval, and should take §6 into account.
