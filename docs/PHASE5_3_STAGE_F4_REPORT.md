# Phase 5.3 Stage F4: structured matching, connected behind `STRUCTURED_MATCHING_ENABLED`

November 14, 2026. **Owner-approved scope:** F4 only, with the conditions set in the approval. Constraints, all in force:
- the flag is off by default and enabled for no one;
- no migration;
- no hosted Supabase;
- no change to rules-v21, rules-v22, `splits-v1.1` or the default recognition version;
- no UI file changed;
- no F5 work;
- no sealed split was opened.

**Decisions applied:**
- **F-5:** the existing title-only rule, applied unchanged.
- **Lead choices on splits:** stay Not enough information.
- **Transferred work:** whole transfer contradicts the tick; shared participation doesn't.
- **F-4b:** the approved fallback quote; `splits-v1.1` untouched.
- **Citation safety:** option A. Choice-based findings are neither stored nor shown.

## 1. Files changed

| File | Change |
|---|---|
| `src/lib/ai/rules/structured-apply.ts` | **New**, pure. Composes the F2 module with the rules' findings (`applyStructuredAnswers`), denials (`structuredDenials`), freshness inputs (`structuredFingerprintAnswers`), the flag-off mask (`maskStructuredFindings`) and choice withholding (`withholdChoiceFindings`) |
| `src/lib/ai/config.ts` | `structuredMatching` from `STRUCTURED_MATCHING_ENABLED` |
| `src/lib/ai/analysis.ts` | Wiring and masking (§3, §5, §6). Exports `currentFindings` / `structuredMaskFor` for every reader of stored findings |
| `src/lib/ai/rules/answer-review.ts` | `titleContradicted` exported (F-5), otherwise unchanged |
| `src/lib/ai/rules/structured-matching.ts` | **One correction to F2:** a Possible cites the person's words only when they relate to what's asked (§4) |
| `src/lib/ai/clarification-review.ts`, `clarification-store.ts`, `follow-up.ts`, `interpretation-shadow.ts` | Read stored findings through `currentFindings` (F-9) |
| Tests | New: `tests/structured-apply.test.ts` (159), `tests/integration/structured-matching.integration.ts` (16). Updated guards (§7.3) and the F1/F3 lifecycle tests' positive controls (§7.3) |
| `.claude/launch.json` (root, local) | `careeros-matching-3100`: a production server with all three flags for that process only. `.env` is unchanged |

## 2. The flag

`STRUCTURED_MATCHING_ENABLED=true` takes effect only with `STRUCTURED_OWNERSHIP_FORM_ENABLED` and `CLARIFICATION_REVIEW_ENABLED`, and never on Vercel. It is off by default, and it is read in `config.ts` only (guarded). The reader stays the default (v21); rules-v22 readings are refused (F2 contract).

| Flags | Structured answers in matching |
|---|---|
| none / review only / form + review | No (Stage E behaviour) |
| matching without the form, or on Vercel | No |
| matching + form + review | Yes |

## 3. Matching integration and precedence

The rules path, in order:
1. the rules engine;
2. free-text answers (`applyAnswers`; they win);
3. structured answers (`applyStructuredAnswers`, through `matchStructuredAnswer` and the approved rule table);
4. follow-up replies.

Every result then passes the same independent validator. AI providers never receive a structured answer: answer evidence is stripped, and no `structured_choices` are sent.

| Rule | How |
|---|---|
| Eligibility | ACTIVE formVersion 2 rows only, one per question (anything else fails closed), re-validated by F2 |
| Free-text precedence | A question covered by an active free-text answer, entry or denial ignores the structured answer |
| Never lower | A rules Supported is never lowered (tested for every choice, including "haven't done this") |
| F-5 | The Stage 1c title-only rule, `titleContradicted`, applies to an English structured description **exactly** as to free text. The test uses the engine's own case (fw-082) and gets the identical finding. Supervising alone doesn't trigger it. Evidence of the work itself is never lowered |
| "Haven't done this" | An ordinary deny record, today's denial: Not supported unless the rules show Supported |
| Readings | Default reader and `splits-v1.1`, version-checked and tied to the exact description |
| Splits | Exact wording only; every ticked part must be shown for Supported; grouped questions and lead choices stay Not enough information; whole transfer contradicts the tick |
| Citations | `candidate_answer` citing `experience:<answer id>` with the person's verbatim words. Structured descriptions are evidence only with the flag on (F-10) |
| Audit | `recognitionVersion = "splits-v1.1"` on an analysis when a structured answer was read with recognition. `methodVersion` stays `rules-v21` |

No new scoring: verdicts come only from the rule table, and counts from the findings.

## 4. Citation safety (the mandatory blocker): option A

- **Never stored.** A choice-only result (`candidate_choice`) leaves the finding as the rules gave it (counted as `withheld`), so no `choice:` citation can reach a stored analysis (tested at unit, integration and database level).
- **Never shown.** As a second line, every read path withholds any stored finding citing `choice:` ("…rests on a structured choice alone, which isn't shown yet"), whatever the flags. This covers the page view, its counts, the run history, the review queue and the other readers. It runs after revocation masking, so a lapsed choice still reads as revoked.
- **F2 correction.** With matching on, a consistent but unrelated description ("Our HVAC techs do all the repairs; I schedule their calls") reached Possible as `candidate_answer`, quoting "I schedule their calls". That is the consistency gap in another form. Words are now cited only where they relate to what's asked:
  - a whole requirement: the requirement reading's own quote;
  - a split: the fallback quote, only when recognition shows a ticked part in the person's words.

  Otherwise the result is a choice claim, which F4 withholds. All 650 F2 tests and 31 F3 tests still pass.
- **Verified in the browser.** On a production build with all three flags, a saved structured answer and a re-run show "Supported — Self-reported", the person's verbatim words as an Experience citation, "Self-reported: CareerOS hasn't independently verified it", and the rules-only verdict. Nothing crashes and nothing claims verification.

## 5. Rollback and stale findings (F-9)

With structured matching off, `structuredMaskFor` masks:
- anything citing a structured answer (any status);
- a denial only a structured "haven't done this" gave (a free-text denial stands).

Masked results read "This relied on a structured answer, which isn't used for matching right now. Run the analysis again."

It applies to **every reader of stored findings**:
- the page view and its counts;
- **the run history's counts**;
- the review queue and which questions are asked (`asked`);
- the older clarification flow;
- follow-up proposals;
- the shadow reader.

**Tested against stored findings, not just fresh ones:**
- a Supported and a denial stored under matching are masked in all four flag-off states;
- counts and history counts are recomputed;
- a question that isn't asked while matching is on is asked again once it's off;
- turning matching back on shows the stored result again;
- reanalysis with the flag off restores the flag-off result.

Revocation, correction and deletion stay effective (§7.2). A mutation check confirms the rollback test fails without the mask.

## 6. Freshness (F-10)

| | Flag off | Flag on |
|---|---|---|
| Structured descriptions in the evidence | No (`formVersion: 1` only) | Yes |
| Fingerprint | Unchanged by structured answers. **Saving one no longer marks the analysis out of date** (the Stage E side effect, removed) | Each active structured answer by its own id (every save or correction is a new row), plus structured denials |

Tested:
- flag off, saving keeps the analysis fresh in every flag-off state;
- flag on, saving makes it out of date, and reanalysis makes it fresh;
- a correction makes it out of date.

A mutation check confirms the freshness tests fail without the filter.

**Note:** an analysis computed under Stage E, while a structured description was in the evidence, can show "out of date" once after this change, because that description now leaves the flag-off fingerprint. That data is local only; there's no production data with structured answers.

## 7. Tests

### 7.1 New

| Suite | Tests |
|---|---|
| `structured-apply.test.ts` | Flag combinations (11). Whole requirements: Supported with words, choice-only withheld, irrelevant and contradicting descriptions, partial work, never lowered, free-text precedence, denial, v22 not adopted. F-5 (3). **All 33 splits × 4**: Supported with recognition version, unticked part → Possible, grouped → nothing, lead choice → nothing. Whole transfer vs shared work. Freshness inputs, masking, withholding. Every result goes through the validator |
| `structured-matching.integration.ts` | Flag off ×4 states (verdicts identical, nothing stored, still fresh). Flag on: Supported with recognition version and freshness; one part → Possible; choice-only → nothing stored; irrelevant → nothing; lead choice; denial and never-lowered Supported; free-text precedence. Rollback against stored findings across all off states, with history and asking; pre-F4 analyses identical under every flag. Correction, revocation, deletion with matching on |

### 7.2 Lifecycle

| Event (matching on) | Result |
|---|---|
| Correction | The old version's stored result reads as revoked until reanalysis; reanalysis reads the new version (new evidence id) |
| Revocation | Masked at once; reanalysis gives the rules' own result |
| Deletion | Every stored result of every version scrubbed; counts consistent |

### 7.3 Updated tests (none weakened)

- **Guards:**
  - recognition, the consistency module, the F2 module and the rule table may now be reached by **exactly one** new file, `structured-apply.ts`;
  - only `analysis.ts` imports it;
  - the flag is read only in `config.ts`;
  - `recognitionVersion` is stored by `analysis.ts` and the save path only.
- **F1/F3 lifecycle tests:** their positive controls assumed an active structured answer's stored citation is shown with every flag off. Under F-9 it is masked unless matching is on, so the controls now use the matching config, and the flag-off states expect masking. Active choice citations expect "isn't shown yet"; lapsed ones expect "revoked".

### 7.4 Results

| Gate | Result |
|---|---|
| Unit | **3,891** pass (159 new) |
| Integration | **223** pass (16 new) |
| TypeScript, `prisma validate`, production build | Clean |
| Schema and migrations | Unchanged |
| Lint | 1 existing warning, unchanged |
| Sealed guard / parts validate | 11 of 11 / pass |
| Parity | 343 pass |
| Browser, production build, flags off | Match, clarification and dark-mode specs pass; review and structured specs skip as designed |
| Browser, form only | Structured-form (Stage E) and match specs pass: Stage E unchanged |
| Browser, all three flags | Structured-form and match specs pass, plus the end-to-end check in §4 |

## 8. Existing matching with the flag off

| Check | Result |
|---|---|
| Engine basis (2,121 rows), follow-up sets (340 rows) | Engine **byte-identical** to F3; follow-up: **0 of 340** rows differ on any field (only the timing field `latency`); all five runs exit 0 |
| Flag-off integration | Verdicts and stored results identical before and after structured saves, in all four flag-off states. Stored pre-F4 analyses show the same under every flag state |
| Unchanged files since F3 | Reader, recognition, rule table, consistency module, engine, validator, choice evidence, every UI file |

## 9. Remaining risks and blockers

- **Blockers to enabling the flag for anyone (F5):**
  - the saved answer card still says "This kind of answer doesn't change the match yet." With matching on, that's out of date;
  - choice-only results are withheld, so the D1 "choice alone reaches Possible" can't be shown until the page can show `choice:` citations (F5), and it must not be enabled before that;
  - production needs the Stage 1 and F1 migrations, and a Stage G result.
- **Real-text accuracy** of "shows the work" is the reader's and recognition's: Stage G is the independent check. Dispatched work ("My boss sends me out…") still gives nothing until rules-v22 is adopted.
- **Run-history counts are now recomputed** when a stored run contains a structured or choice result. With the flag off and no structured answers, nothing changes.
- **One-time staleness** of Stage E-era local analyses (§6 note).

## 10. Ready for approval?

Yes, as F4:
- the flag is off by default;
- flag-off behaviour is unchanged;
- structured matching works end to end with the flag on;
- choice-based findings are never stored or shown;
- stored structured findings stop counting the moment the flag is off.

F5 hasn't started.
