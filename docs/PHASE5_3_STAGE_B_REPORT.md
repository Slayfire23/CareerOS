# Phase 5.3 Stage B: rules-v21 as an opt-in reader

November 13, 2026.

**Status: Stage B complete under the owner-approved boundary (2026-11-13), committed locally.** V5 failure 3 is recorded as an explicit **Stage D dependency** (§7):

| Category | Status |
|---|---|
| **Completed Stage B reader functionality** | rules-v21 opt-in: F1–F9, DD3, F6, the follow-up kept-part rule, and the verdict-inert `bounded` field. 28 permanent tests |
| **Deferred Stage D recognition functionality** | The consumer of `bounded` for the A77 collections equivalent, with the approved overdue-context setting (§7.3). **Not implemented and not verified** |
| **Historical expectation discrepancy** | Failure 4 ("I recommend candidates to the owner, who decides who we hire"): the original expectation P stays on record; the owner's decision keeps Hiring at Not enough information |
| **Completed regression results** | §3–§4 and §9, all on the final code |
| **Remaining risks** | §6, and §7.5 |

The complete end-to-end V5 recognition path is **not** passing in production or in the current application: no recognition module exists yet.

- rules-v21 is selectable only with `textRules: "v21"`.
- `DEFAULT_TEXT_RULES` stays `"v20"`; nothing in the app asks for v21. A test enforces this.
- The engine, the default reader and the default follow-up behaviour are unchanged. They were checked row for row (§4).
- No split or recognition pattern is active. No sealed split was opened; only the hash guard and the `parts.eval.ts` validate mode (counts only) ran.

## 1. What rules-v21 changes (all behind the opt-in)

| Fix | What it does | Where |
|---|---|---|
| **F1** clause handling | The A26 root cause wasn't semicolons; sentences already split there. `PROFILE_META` read "the individual 1040s" and "the employee handbook" as notes about the candidate and barred them. Under v21, "the individual/employee/user/person" followed by a noun is an adjective. "The individual is…", "this person has…", "the candidate…" stay barred | `requirement-structure.ts` |
| **F2** third-party attribution | Others' work named after the person's object is taken out of what is read: "camera systems *another crew installed*", "the forecasts *my analysts prepare*", "the spec *Kevin designs*", "send plumbers out *to install*". It applies only after a noun phrase, never right after the person's own verb ("pay our vendor invoices"). A name must not be a known technology, follow a capital word or a determiner, or be followed by something other than an object or the clause's end. That keeps "a dozen *Java services*", "our *Haas lathes*", "the *Google Ads* campaigns" and "extend the *offers myself*" | `evidence-boundary.ts` |
| **F3** corrections | A correction marker opening a sentence ("Mostly I write them up…") takes back the earlier claim. Mid-sentence "mostly" doesn't ("…, mostly weekly pipeline views") | `evidence-boundary.ts` |
| **DD3** precedence | A hand-off takes back only what was handed off (A60: "I plan the campaigns; our agency runs them" keeps planning). When the person's verb is specific and different from the handed-off one, the person's clause stays. A full hand-off still gives nothing (the payroll control) | `retractions()` |
| **F4** narrowed scope | "…, I only fix flats" / "…, and I only measure the residential rooms" is read as its own statement, flagged `narrowed`. It is the person's own limited work: never the whole requirement, but it is doing for the checkbox (§3.2) | `evidence-boundary.ts`, `structured-consistency.ts` |
| **F5** narrow act exceptions | Overseeing counts where oversight is asked, or as the person's own direct act where hiring, recruiting, approving or verifying is asked ("I verify every invoice… and approve them"). The act's subject must be the person: it never crosses a relative clause ("I oversee the AP clerks *who* verify and approve"). Each act has its own undoing words: recommending undoes hiring only; sending for approval undoes approving only | `answer-review.ts` (`ownedForV21`, `ownDirectAct`) |
| **F6** contradicted checkbox | Under a "did it myself" tick, the explanation is contradicted when it shows none of the person's own work on this requirement and **either** others do the whole of it, **or** the person's own words deny it. Then the tick gives nothing, not even Possible (D1). Under an approved split, a contradicted part counts as not done, and the other parts keep their credit (failure 4) | `structured-consistency.ts`, `structured-answer.ts` |
| **F7** present-tense supervision | "I manage/coach/oversee… *who* do X" and "I review/check/approve… what others make" are overseeing | `evidence-boundary.ts` |
| **F8** assigned | "I'm assigned to the trailers" is the person working there, not assigning others. "I assign the pickers" is still overseeing | `evidence-boundary.ts` |
| **F9** no over-truncation | The person's own "flag *everything over 60 days*" and "decide *which accounts to call first*" are kept. A side clause about someone else ("the coach said who to bring back") is still removed | `profile-fields.ts` (`ownClauses`) |
| End condition kept, inert (V5 failure 3) | Each v21 statement whose own act ends on "until/till they/he/she …" gets `bounded`: the readable text with that end condition kept ("…call those customers until they pay"). `readable` is unchanged, and SIDE_CLAUSE is untouched. No verdict reads `bounded`; a test enforces that only the reader names it. A named third party's act ("until the adjusters approve them") is never kept | `profile-fields.ts` (`ownClauses(…, keepBounds)`), `evidence-boundary.ts` |
| Follow-up reader | `readFollowUpReply(…, { textRules })`, default unchanged. A case that v21's correction made strict is held to the v20 standard only when the reply is about the part the answer itself kept ("I do the flats and tubes myself"). That requires both: the correction is the **only** thing that made it strict, and the reply names the kept part. It's never Supported. | `follow-up-reply.ts` |

**Two additions go beyond the R3 plan's wording and need your explicit approval** (both only hold credit back):
- F6 also covers **the person's own denial** ("No, I haven't built mobile apps", "Never dealt with a union contract").
- The follow-up **kept-part rule** above.

The denial check also fires on stated intent ("I plan to learn it"). Its reason code then says `denies_doing_it`; the outcome is the D1 one, no tick credit.

## 2. Root-cause corrections to the R3 plan

| Item | R3 plan said | Actual cause |
|---|---|---|
| A26 | Semicolon/clause splitting | `PROFILE_META` barring "the individual 1040s" as text about the candidate (F1 above) |
| A60 | Missing attribution | DD3 over-retraction: the hand-off took back the person's own planning clause |
| V5 failure 3 (A77 "until they pay") | Over-truncation (F9) | Not a truncation bug. Clause splitting and ownership are correct. "until they pay" stays in the statement `text` and is removed from `readable` by SIDE_CLAUSE, as designed. The recognition prototype matched the approved equivalent against `readable` (the wrong field for that phrase) and never resolved "those customers" to the person's own "overdue balances" (§7) |

## 3. Comparison (opened data only; v20 vs v21)

The default path was checked against the pre-change baseline on every row. v20 equals the pre-change default for all 1,266 answers, 392 probes and 320 replies.

| Set | Rows | Changed (v20→v21) | New false Supported | Labeled-qualified losses | Good replies refused |
|---|---|---|---|---|---|
| Historical answers, `readAnswer` (incl. the 220-answer benchmark) | 1,266 | **2** (both gains) | 0 | 0 | — |
| Same answers, structured worst case (a "did it myself" tick) | 1,266 | **19** (4 gains, 15 corrections) | 0 | 0 | — |
| Stage 3 probes | 392 | 0 | 0 | 0 positives lowered | — |
| DD1 design rows (198 probes + 28 opened) | 226 | **16** | 0 (no correction / only / supervise row reaches S) | 0 genuine (both_*) rows lowered | — |
| V5 targeted probes | 47 | 4 (2 fixed, 2 not) | 0 | — | — |
| Follow-up replies | 320 | **0** | — | — | **0** |

The ICD-10 gain is kept: fv-077 / pc-077 stay Possible.

### 3.1 Every `readAnswer` change

| Requirement | Answer (short) | v20 → v21 | Kind | Label |
|---|---|---|---|---|
| Prepare tax returns for individuals and small businesses | fw-024: "I do the individual 1040s start to finish and my manager takes the partnership and S-corp returns…" | I → **P** | Intended (F1, A26) | `possible`: supports |
| (same) | pc-124, same answer | I → **P** | Intended | `ownership:partial`: supports |

### 3.2 Every structured change (a "did it myself" tick, then the explanation)

| Source | Requirement | v20 → v21 | Why (v21) | Label | Supports? |
|---|---|---|---|---|---|
| m11_remediation/dev | Using Google Classroom | P → I | Intent only ("I plan to learn it"); D1 | not qualified | Yes |
| m11_remediation/dev | Menu costing | P → I | Someone else did it (the owner) | not qualified | Yes |
| m11_remediation/check | Using Workday | P → I | Intent only | not qualified | Yes |
| m11_remediation/check | Benefits administration | P → I | Borrowed wording from a mentor's template | not qualified | Yes |
| m11_remediation/check | Aquatic therapy | P → I | Own denial ("I've not done aquatic therapy") | not qualified | Yes |
| m11_interpret/dev | TIG welding | P → I | Own denial ("No TIG") | does_not_qualify | Yes |
| m11_interpret/check | Deposition transcript summaries | P → I | Someone else did it (Priya) | does_not_qualify | Yes |
| fu-003 | Medication reconciliation at discharge | P → I | Someone else did it | not_supported | Yes |
| fu-071 | Machine learning model training | P → I | Someone else did it (the ML engineer) | not_supported | Yes |
| fv-044 / pc-044 | Mobile app development | P → I | Own denial | not_supported / ownership:no | Yes |
| fw-021 / pc-121 | Payroll processing for 100+ employees | P → I | Someone else did it (the controller) | not_supported / ownership:no | Yes |
| fw-059 / pc-159 | Write grant proposals | P → I | Someone else did it (the development director) | not_supported / ownership:no | Yes |
| fw-024 / pc-124 | Prepare tax returns… | I → P | Own individual returns read (F1) | possible / partial | Yes |
| fw-031 / pc-131 | Customer site surveys and measurements | I → P | Narrowed own part ("I only measure the residential rooms") | supported / partial | Yes (P, not S: the narrowed part can't show the whole) |

### 3.3 Every design-row change (author-written probes, unlabeled; judged by row kind)

| Split | Kind | Answer | `readAnswer` v20→v21 | Tick v20→v21 | Assessment |
|---|---|---|---|---|---|
| P13 | both_std | I recruit and hire the staff for our three clinics. | S → S | I → **S** | Intended (F5: own hiring act) |
| P13 | only_b | I hire the staff…; HR does all the recruiting and screening. | I → I | I → P | Intended: partial |
| P14 | supervise | I manage the HR coordinator who recruits and onboards… | I → I | P → I | Intended (F7) |
| A26 | only_a / opened | individual 1040s… | I → P | I → P | Intended (F1) |
| A52 | both_std | I verify every invoice… and approve them… | I → **S** | I → **S** | Intended (F5) |
| A52 | only_a | I verify…, and the controller approves them | I → P | P → P | Intended: partial |
| A52 | only_b | I approve invoices… after the AP clerk verifies them | I → I | I → P | Intended: partial |
| A53, A55, A93 | supervise | I review the [models / API designs / forecasts] my team… | P/P/**S** → I | P/P/**S** → I | Intended (F7); A93 removes a false S |
| A56 | supervise | I coach the reps who develop and deliver… | I → I | P → I | Intended (F7) |
| A57 | only_b | I maintain and repair camera systems another crew installed | **S** → I | **S** → P | Intended (F2): removes a false S. The tick's P is the maintaining part |
| A58 | supervise | I run the plumbing company and send plumbers out to install… | **S** → I | **S** → P | Intended (F2): removes a false S. **Residual:** the tick still gives P (§6) |
| A60 | only_a | I plan the campaigns; our agency runs them | I → P | I → P | Intended (DD3) |
| A60 | correction | …Actually, the agency runs them, I only set the monthly goals | I → I | I → P | Intended: narrowed own part |

### 3.4 V5 targeted probes (the parts-layer simulation, run on each reader)

v20: 43/47; **v21: 45/47 with the prototype as it was, 46/47 with the simulated Stage D consumer of `bounded` (§7.3)**. The v20 run reproduces the earlier V5 run exactly (273/273 rows).

| Probe | Expected | v20 | v21 | |
|---|---|---|---|---|
| V5 failure 1 (F8): "I'm assigned to the trailers at door 4, and I only unload." | P [no, yes] | I [no, no] | **P [no, yes]** | **Fixed** |
| V5 failure 2 (F9): "I pull the AR aging…, flag everything over 60 days and decide which accounts to call first." | P [yes, no] | P [no, no] | **P [yes, no]** | **Fixed** |
| V5 failure 3: "…call those customers until they pay." | S [yes, yes] | P [yes, no] | P [yes, no] with the prototype as it was; **S [yes, yes]** with the simulated Stage D consumer (§7) | **Reader part fixed; recognition part is a Stage D dependency** |
| Failure 4 (history kept): "I recommend candidates to the owner, who decides who we hire." | P (original expectation) | I | I | Owner decision: Hiring stays Not enough; the original expectation stays on record as failed |

Negative controls in the same run:
- "The outbound crew loads the trucks; I only unload" stays P.
- "I review the aging analysis our staff accountant prepares" goes to I.
- "I forward the aging report…" stays P.
- "We hired a staffing contractor" stays I.

Design rows in the simulation: no correction, only-one-part or supervise row reaches Supported, and no row with both parts genuine is lowered.

Simulation note for Stage D: a narrowed statement carries `exposureOnly` (so it can never show the whole requirement) and `narrowed`. A parts layer must count `narrowed` statements for their own part; the simulation does.

## 4. Engine, follow-up regression sets, suites

| Check | Result |
|---|---|
| Engine basis (2,121 rows, default path) | **Byte-identical** to the rules-v20 adoption baseline |
| Follow-up regression sets (m11_followup dev and blind, m11_followup2 blind, m11_followup3 blind; default path) | See §4.1 |
| Unit suite | **2,603 pass** (2,575 before + 28 new in `tests/ai-rules-v21.test.ts`) |
| Integration suite (local test DB, port 5433) | **183 pass** |
| TypeScript, ESLint, `prisma validate` | Clean |
| Sealed guard (`tests/sealed-splits.test.ts`), `parts.eval.ts` validate mode | Pass (counts only) |
| Opt-in guard | `\bv21\b` appears only in the reader library files; `DEFAULT_TEXT_RULES === "v20"` |

### 4.1 Follow-up regression sets

0 of 340 rows changed across the four sets (§9).

## 5. Regressions found during Stage B and fixed (none weakens a gate)

| Found by | Problem | Fix |
|---|---|---|
| F5 first cut | "I recruit and hire the staff" fell S → I | Recruiting added as its own act |
| Comparison 1 | F2 read agent-like nouns ("vendor invoices", "grant proposals") and brand names ("Rinnai tankless", "Postman collections") as others doing work | Only after a noun phrase; name rules (§1) |
| Comparison 1 | "mostly" mid-sentence read as a correction (the Tableau answer) | Sentence-opening only |
| Comparison 1 | F7 read "walk" and pre-verb words as review (lab safety, wine service) | A closed list of review verbs, after the head verb |
| Comparison 1 | F9 kept "said who to bring back" (fu-113, a bad reply that would have been accepted) | Only after deciding verbs |
| Comparison 1 | F6 fired on "Our plant is SQF" and on Kevin's partial work (fw-054) | Only when others cover the **whole** requirement |
| Comparison 2 | Docker (labeled supported) S → P; CNC/Haas design row P → I | Name must not follow a determiner or count, and must be followed by an object or the clause's end |
| Comparison 2 | fw-103, a good reply, newly refused | Kept-part rule (§1) |
| Comparison 3 | "Interpreting union contracts" with a tick: I → P. The F1 fix newly reads "I've read the employee handbook", beside "Never dealt with a union contract" | F6 own-denial check |
| V5 run | "extend the offers myself" lost (read "offers" as an agent); "the Google Ads campaigns" lost (read "Ads" as a name) | Agent's verb can't be a pronoun or adverb; name can't follow a capital word |
| Design review | "I oversee the AP clerks who verify and approve invoices" + tick: I → P (F5 crossed the relative clause) | An act's subject must be the person |
| Design review | Narrowed corrections with a tick (P6, A20) P → I: lost the person's own limited part | Narrowed counts as doing for consistency |
| Tests | "recommend" anywhere undid every act, including the person's own screening (against failure 4) | Undoing words per act |

## 6. Residuals (reported, not fixed in Stage B)

- **A58 supervise + tick → Possible.** "I run the plumbing company and send plumbers out to install and repair systems": v20 gave a false **Supported**; v21 gives **Possible**. Ideally Not enough. The others' work ("install and repair systems") doesn't name every requirement term ("residential plumbing"), so F6's whole-requirement test doesn't fire.
- **A87 tune-ups.** The split-level P comes from a tokenization quirk: "tune-ups" → "ups" matches "write them up". It isn't Supported; it's a recognition-layer matter.
- **A78.** The narrowed statement now exists. The whole verdict depends on vocabulary ("measure" vs "measurements"); the tick reading is P.
- **Denial reason code.** Stated intent is labelled `denies_doing_it`; the outcome is correct.

## 7. Acceptance, and V5 failure 3 (owner decision of 2026-11-13: mandatory)

| Criterion | Result |
|---|---|
| Zero new false Supported | **Met** |
| Zero unjustified labeled-qualified losses | **Met** (0 losses) |
| Zero good follow-up replies newly refused | **Met** |
| No weakened safety gates | **Met**; SIDE_CLAUSE and `readable` are unchanged |
| Engine unchanged; v21 opt-in; default unchanged | **Met** |
| Permanent tests for F1–F9, DD3, F6, and the failure-3 field | **Met** (28 tests) |
| V5 failures 1 and 2 | **Met**, with controls |
| **V5 failure 3** | **Supported by the Stage B evidence field (`bounded`).** It passes only when modeled with the future Stage D consumer in the scratch simulation. The actual Stage D recognition behaviour is unimplemented and unverified. Recorded as a Stage D dependency (owner decision, 2026-11-13) |

### 7.1 Where the evidence is lost

The answer is "I run the AR aging analysis, identify the overdue balances and call those customers until they pay."

| Step | Finding |
|---|---|
| Clause splitting | Correct: one own statement |
| Ownership | Correct: `performed`, subject self |
| SIDE_CLAUSE | Working as designed. "until they pay" has another subject, so it is removed from `readable` and kept in `text` |
| Statement text vs readable | **The loss.** The recognition prototype matched the approved A77 equivalent (`call…customers…until they pay`) against `readable`, where the phrase no longer exists |
| A77 equivalent | Correct and unchanged. Matching it against `text` would be unsafe in general, because `text` can hold others' work |
| Antecedent | "those customers" was never tied to the person's own "the overdue balances"; the past-due equivalent needs "overdue" after "call" |

### 7.2 The Stage B part (done)

The reader keeps the person's own context instead of the recognition layer reading the raw text. Under v21 only:
- each own statement whose act ends on "until/till they/he/she …" carries `bounded`: `readable` with that end condition kept;
- `readable` and SIDE_CLAUSE are unchanged, and no verdict reads `bounded` (tested);
- `bounded` never appears on another person's statement or on a retracted claim, and never keeps a named third party's act ("until the adjusters approve them").

Owner requirements for `bounded` (approved 2026-11-13):
- available only under the v21 opt-in;
- verdict-inert in the existing application;
- never an alternative raw-text matching path;
- never preserves another person's independent work as the person's own;
- respects corrections, retractions and ambiguous ownership;
- has permanent positive and negative tests.

All are met and tested in `tests/ai-rules-v21.test.ts`.

### 7.3 The Stage D dependency (owner-approved specification; not built)

The future inactive recognition module must:
1. Use the approved A77 collections equivalent (`…customers…until they pay`, **unchanged**) against `bounded` evidence where appropriate.
2. **Never** match this equivalent against unrestricted raw text (`text`).
3. When the explanation says "those customers", "these customers", "them" or similar, require a clear antecedent in the person's own words that establishes overdue, unpaid or outstanding receivables.
4. Reject ambiguous antecedents, unrelated customer calls, third-party work and corrected-away claims.
5. Check statement ownership and correction metadata independently of the `bounded` text.

**Approved for the future recognition specification:** the A77 overdue-context setting (`bound_antecedent`: overdue, past-due, outstanding, unpaid, delinquent, owed, late). It applies to this specific collections equivalent only and never widens it to generic customer calls. It is not implemented now.

### 7.4 Results with the simulated contract

- **V5 (scratch simulation only):** 46 of 47 expectations satisfied. The remaining failure is the preserved historical failure-4 expectation, under its separate owner decision. Failure 3 reads S [yes, yes] only with the modeled Stage D consumer.
- **Controls:** all 11 behave as required.

| Answer | Collections shown |
|---|---|
| I run the AR aging analysis, identify the overdue balances and call those customers until they pay. | **yes** (antecedent: the overdue balances) |
| I call past-due customers until they pay. | **yes** (the existing past-due equivalent) |
| I pull the list of unpaid invoices every Friday and call those customers until they pay. | **yes** (antecedent: unpaid invoices) |
| Our AR clerk identifies the overdue balances and calls those customers until they pay. | no: another person |
| I identify the overdue balances and our collector calls those customers until they pay. | no: another person (aging still shown) |
| I call those customers until they confirm their delivery dates. | no: unrelated |
| I schedule the deliveries and call those customers until they confirm a time. | no: unrelated |
| I call those customers until they pay. | no: no own antecedent |
| I sort the new accounts and the overdue balances, and call those customers until they pay. | no: ambiguous ("the new accounts") |
| I identify the overdue balances and call those customers until they pay. Actually, our collections agency makes the calls, I only send the statements. | no: the correction transfers the calls |
| I welcome new customers and call them until they pay. | no: the antecedent isn't overdue |

**Opened comparisons with the new field:** unchanged from §3. That means 0 new false Supported, 0 labeled losses and 0 replies changed, as expected for a field no verdict reads.

### 7.5 Remaining risks

- **Stage D is unverified.** The consumer exists only as a scratch model, written by the author of the rules. The independent check is the sealed R4 split at Stage G.
- **`bounded` is deliberately narrow.** It covers only "until/till they/he/she …" closing the person's own clause. Other end-condition wordings ("so they pay up") give no `bounded` text, so they're simply not recognized. That direction is safe.
- **Two additions beyond the R3 wording** are included in this commit under the Stage B approval and listed for review at Stage C: F6's own-denial check and the follow-up kept-part rule (§1). Both can only hold credit back or restore the v20 standard.
- **Label quality.** Writer–labeler agreement on R4 is 46% with 55 unsure labels. See the Stage G policy proposal (`docs/PHASE5_3_STAGE_G_EVAL_QUALITY_POLICY.md`).
- **Residuals in §6:** A58 (Possible from a tick for dispatching), the A87 tokenization quirk, A78 vocabulary, and the denial reason code on stated intent.

## 8. Files

- `src/lib/ai/evidence-boundary.ts`: TextRules `"v21"`; F2, F3, DD3, F4, F7, F8; `retractions`, `othersParts` and `untrustedSpans` take the v21 flag.
- `src/lib/ai/requirement-structure.ts`: F1 (`META_AS_ADJECTIVE`).
- `src/lib/ai/rules/profile-fields.ts`: F9 (`ownClauses(sentence, v21)`).
- `src/lib/ai/rules/answer-review.ts`: F5 (`ownedForV21`, `ownDirectAct`, per-act undoing words); F6 helpers (`othersDoWholeRequirement`, `deniesRequirement`).
- `src/lib/ai/rules/structured-consistency.ts`: `textRules`; F6; F4 narrowed counts as doing; F5 own act.
- `src/lib/ai/rules/structured-answer.ts`: `contradictedBy` (`other_person` / `own_denial`); compound `contradicted` parts.
- `src/lib/ai/rules/follow-up-reply.ts`: `textRules` option (default unchanged); the kept-part rule.
- `tests/ai-rules-v20.test.ts`: isolation allowlist plus the v21 opt-in guard.
- `tests/ai-rules-v21.test.ts`: new, 28 tests.
- `src/lib/ai/rules/profile-fields.ts`, `src/lib/ai/evidence-boundary.ts`: the `bounded` field (§7.2).
- `docs/PHASE5_3_STAGE_G_EVAL_QUALITY_POLICY.md`: Stage G evaluation-quality policy proposal (no labels changed).
- `ai-service/evals/reports/m11/structured/stageb-v20-v21-changes.json`: every v20→v21 change on opened data, the V5 rows and the failure-3 controls.
- `docs/PHASE5_3_IMPLEMENTATION_SEQUENCE.md`, `TESTING.md`: progress entries.

## 9. Follow-up regression sets: final run

Final code (including the `bounded` field), default path, compared row for row with the rules-v20 adoption baseline. All five runs finished with exit code 0:

| Set | Rows | Changed |
|---|---|---|
| m11_followup dev | 40 | 0 |
| m11_followup blind | 80 | 0 |
| m11_followup2 blind | 100 | 0 |
| m11_followup3 blind | 120 | 0 |
| Engine basis (rerun on final code) | 2,121 | byte-identical |

The final follow-up evaluation **completed successfully**: all **340** rows are unchanged, and the engine is unchanged.

## 10. P1 follow-up: the F1 exception no longer lets remarks about the candidate through (2026-11-13)

Owner-approved as a Stage B follow-up after the Stage C review found a gate-4 failure. rules-v21 is still opt-in, `DEFAULT_TEXT_RULES` is still `"v20"`, and `RULES_VERSION` is unchanged.

### 10.1 Root cause

The profile-meta rule flags "(this|the) (person|candidate|applicant|individual|employee|user)". F1's `META_AS_ADJECTIVE` blanked "the individual / person / employee / user" whenever the next word wasn't a verb, so that "the individual 1040s" could be read.

When the next word was itself a word for the candidate ("the individual **applicant**", "this person **applicant**", "the user **profile**"), or pointed at whoever is judged ("the employee **in question**"), blanking removed the only part the rule matches. The remark passed unflagged.

Verdicts never rose: the remark had no own statement. But the untrusted-text check, which the reader uses to bar spans and the save check uses to refuse text, was weaker.

### 10.2 Exact change (`src/lib/ai/requirement-structure.ts`, v21 only)

1. **"the person" is removed from the exception.** It's the canonical evaluator phrase, and no opened answer needed it.
2. **The exception never applies before `CANDIDATE_NOUN`**, matched with a Unicode-aware boundary so "résumé" counts. That covers:
   - words for the candidate or their record: applicant, candidate, candidacy, profile, résumé/resume, CV, curriculum, application, record, file, dossier, submission, portfolio, bio, jobseeker / job seeker, seeker, nominee, interviewee, prospect, talent, hire, recruit, contender, person, people, individual, employee, user, worker, staffer, member, professional, expert, specialist;
   - words that point at whoever is judged: here, herein, above, below, mentioned, named, described, listed, referenced, concerned, "in question", being, under, who/whom/whose/that/which, applying, submitting, reading, reviewing, evaluating, assessing, behind, writing.
3. **A segment that uses judging words** (`JUDGING`: qualified, requirements, rated/rating, ranked, score, grade, fit, suitable, eligible, Supported, meets/exceeds, deserves, recommend, best/ideal/perfect/top, "should be", "must be", evaluate/assess, …) **never gets the exception.** It's read exactly as under v20.
4. The check reads `withoutMetaAdjective(segment)` instead of the bare replace.

No other protection changed:
- the directed-text, evaluation-language, label and claim checks;
- SIDE_CLAUSE;
- ownership, correction and contradiction handling.

### 10.3 New tests (6 groups in `tests/ai-rules-v21.test.ts`; 34 in that file)

- The four remarks from the Stage C finding: flagged under v20 and v21.
- 17 related forms: candidate nouns, records, pointers at whoever is judged, and judging words.
- Legitimate individual tax-return and Form 1040 work is read; A26 stays Possible.
- Ordinary "applicant" / "candidate" wording without steering ("I screen every applicant…", "I interview each candidate…") isn't a remark. "the applicant tracking system" stays as v20 has it.
- Third-party work and corrections aren't Supported.
- Legitimate tax wording beside an evaluator instruction: the instruction is still flagged (directed), and the remark adds nothing to the verdict.

### 10.4 Results

| Check | Result |
|---|---|
| Untrusted-text sweep: 32 evaluator-style texts | 32 of 32 flagged under v20 and v21; **0 bypasses**. The first review found 4 bypasses among the 8 texts it tested (Stage C §3) |
| Untrusted-text sweep: 10 legitimate texts | 9 read under v21. The tenth ("the applicant tracking system") is flagged under v20 too |
| Remark + own work combinations (16) | Remark flagged in 16 of 16; no verdict above the own work alone |
| Opened comparison (1,266 answers, ticks, 392 probes, 226 design rows, 320 replies) | **Identical to Stage B**: 0 new false Supported, 0 labeled losses, 0 replies changed; the A26 gain kept; ICD-10 gain kept |
| Save-check kinds, v20 vs v21 (1,978 opened texts) | 3 differ, all legitimate (A26 ×2; the union denial, still refused as negated) |
| Follow-up questions (1,266 answers) | The same 2 changes as in Stage C |
| V5 / failure-3 controls | 46 of 47 in simulation (the failure-4 history); 11 of 11 |
| Unit / integration | **2,609** / **183** pass |
| TypeScript, `prisma validate`, sealed guard, parts validate | Clean; pass (counts only) |
| Lint | 1 existing warning (`tests/eval/run-eval.eval.ts`), unchanged |
| Engine basis and follow-up sets, current default path | §10.5 |

### 10.5 Engine and follow-up sets after P1

P1 code, default path (v20), compared row for row with the rules-v20 adoption baselines. All five runs exited 0.

| Suite | Rows | Changed |
|---|---|---|
| Engine basis | 2,121 | **byte-identical** |
| m11_followup dev / blind | 40 / 80 | 0 / 0 |
| m11_followup2 blind | 100 | 0 |
| m11_followup3 blind | 120 | 0 |

The engine and the default follow-up behaviour are unchanged. Results under the simulated adoption patch are in the Stage C review §3.1.

### 10.6 Remaining limitations

- The candidate-noun list is broad but not provably complete; the judging-word guard is the second layer.
- Work uses of "the applicant / the candidate" ("the applicant tracking system") are still flagged as remarks, exactly as under v20.
- Everything listed in §6 and §7.5 still applies.

