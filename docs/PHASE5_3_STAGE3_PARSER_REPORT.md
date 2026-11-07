# Phase 5.3 Stage 3: Offline Parser Evaluation — Report

November 7, 2026. **Investigation only.**

- **Not changed:** no parser was installed in CareerOS, and no matching code changed.
- **Not opened:** the sealed split, `m11_followup4`.
- **Not touched:** the baselines and your locked labels.
- **Location:** the evaluation ran in an isolated scratch folder outside the project.

## Recommendation: don't integrate any of these parsers

Neither parser improved ownership attribution over rules-v19:
- **compromise** got the person's own work wrong far more often.
- **wink-nlp** did too, and also got negation and multiple actors wrong more often.
- **compromise inside rules-v19's own clauses**, the fairest test, was still worse at deciding who did the work. It left ownership errors unchanged (43 false and 126 missed, against 45 and 127).

The errors that matter aren't about grammar. They're about meaning:
- a word used in another sense ("bridges");
- a hand-off that's implied, not stated;
- a paraphrase with none of the requirement's words;
- a correction.

A part-of-speech tagger can't see those. I'd stop adding regex rules for them too, and change how the evidence is collected (§5).

## 1. The packages, checked before downloading

| Package | Version | Size | License | Maintenance | Decision |
|---|---|---|---|---|---|
| wink-nlp | 2.4.0 | 656 KB unpacked (764 KB on disk) | MIT | Established project, last release June 2025 | Tested |
| wink-eng-lite-web-model | 1.8.1 | 3.8 MB | MIT | Last release November 2024 | Tested |
| compromise (+ efrt 2.9.0, suffix-thumb 6.0.0, same author) | 14.19.0 | 2.8 MB unpacked (4.2 MB with dependencies) | MIT | Active, last release October 2026 | Tested |
| udpipe-wasm | 0.1.0 | 601 KB, model not included | MPL-2.0 | **One version, one maintainer, first published June 2026** | **Not downloaded** |

**Why UDPipe was stopped:** its English models (UD 2.5) are licensed **CC BY-NC-SA**, non-commercial only. A deployed CareerOS couldn't use them. The WebAssembly wrapper is also a new single-maintainer package with no track record.

**How the others were installed:** exact versions, with install scripts disabled; none of the packages has any. `npm audit` found 0 vulnerabilities.

## 2. How it was measured

**The corpus:** 400 opened texts, in `tests/fixtures/ownership_benchmark/corpus.json`:
- 220 answers, from the 100- and 120-case splits;
- 100 follow-up replies;
- 80 role descriptions from the spent held-out sets, including all 9 word-sense collisions and the Office Runner and Scrub Technician cases.

**The labels:** two agents, each labeling half. Neither saw the repo or any prediction. For each text they gave:
- who did the requirement's work;
- the person's involvement;
- passive voice, negation, correction, multiple actors;
- word sense, for role descriptions;
- whether personal ownership is shown.

The labels are in `labels.json` beside the corpus. One labeler listed the scratch folder once after a failed write. That showed only file names, not predictions.

**The systems:** each produced the same clause records (subject, main verb, negation, passive). One shared scorer turned every system's records into the label fields the same way, so only the sentence analysis differed. rules-v19's real product verdicts (the answer reader, the reply reader, and the engine for role descriptions) were scored as well. The scripts and full output are in `ai-service/evals/reports/m11/parser/`.

## 3. Results

| | rules-v19 | wink-nlp | compromise | rules-v19 clauses + compromise |
|---|---|---|---|---|
| **Who did the work (accuracy)** | **0.51** | 0.30 | 0.27 | 0.45 |
| The person's involvement (accuracy) | 0.54 | 0.47 | 0.53 | 0.55 |
| Passive voice (F1) | 0.24 | 0.20 | 0.17 | 0.24 |
| Negation (F1) | 0.82 | 0.62 | 0.83 | 0.80 |
| Multiple actors (F1) | **0.54** | 0.40 | 0.41 | 0.51 |
| Corrections (F1)* | 0.29 | 0.29 | 0.29 | 0.29 |
| **False ownership attribution** | 45 | 20 | 8 | 43 |
| **Missed legitimate ownership** (of 214) | **127** | 159 | 188 | 126 |

\* Neither parser detects corrections, so every system used the same marker logic.

**The parsers' lower false-attribution numbers aren't precision.** They come from reading the person's own work as someone else's:
- **wink-nlp:** 79 cases. Its lite model tags "plans", "updates" and "changes" as nouns, and "wound" as a verb. It then takes the last noun before the verb as the subject.
- **compromise:** 91 cases of the person's own work read as mixed. It finds a second "subject" in phrases like "the dressing changes" and "the whole thing updates".

Both lose far more real ownership than they avoid false credit.

**The hard cases** (who did the work, right out of n):

| Case type | rules-v19 | wink-nlp | compromise |
|---|---|---|---|
| Supervised | 2/12 | 4/12 | 4/12 |
| Delegated or supervised | 1/10 | 2/10 | 3/10 |
| Requested from a provider | 3/10 | 4/10 | 0/10 |
| Corrects itself | 2/17 | 5/17 | 5/17 |
| Ambiguous subject | 2/7 | 2/7 | 0/7 |
| Role descriptions | 35/80 | 30/80 | 23/80 |

Small gains in one slice come with losses in others. No system handles corrections or implied supervision. These are exactly the cases where the person's part depends on what the verbs *mean* (manage, assign, call the contractor), not on sentence structure.

**Word sense in role descriptions:** 13 of the 80 descriptions use the requirement's words in another sense. rules-v19 credits 7 of them:
- Dentist "bridges";
- Pest Control Technician "bug";
- Car Detailer "gun";
- Energy Auditor "audits";
- Food Service Worker "imaging";
- a Software Engineer's "guest";
- a drafting case.

**Neither parser can help with this.** Part-of-speech tags say "bridges" is a noun in both senses.

**rules-v19 as the product reads it:**

| | False ownership | Missed legitimate |
|---|---|---|
| Answers | 8 | 71 |
| Replies | 1 | 39 |
| Role descriptions | 20 | 14 |
| **Total** | **29** | **124** |

Role descriptions are the largest source of false credit.

## 4. Cost and compatibility

| | rules-v19 | wink-nlp | compromise |
|---|---|---|---|
| Time for all 400 texts | 408 ms (~1 ms each) | 38 ms (0.1 ms each) | 1,600 ms (4 ms each) |
| Load time | none | 90 ms | 300 ms |
| Extra memory | none | ~65 MB | ~60 MB |
| Size on disk | none | 4.6 MB | 4.2 MB |
| Works offline | yes | yes | yes |
| ES modules, Next.js server | yes | yes | yes |

Both parsers would be cheap enough, and neither sends anything over the network. Cost isn't why they're rejected.

## 5. A different architecture

The evidence across five splits now points the same way. Reading free text deterministically gets structure but misses meaning. The fixes that work close the phrasings they were shown, and each new split brings new ones. I'd change what is collected, so less has to be inferred.

1. **Ask for the person's part directly, as a choice, then the details.** The clarification and follow-up forms would add one required choice:

   > I did this myself · I did part of it · I supervised or assigned it · I arranged or requested it from someone else · I assisted · I watched or trained on it · I haven't done this

   It would come with "how often or how much" and "most recent" fields. Free text stays, for what they did, and it gets checked for **consistency** with the choice: a contradiction keeps the answer unresolved. Rules then decide from the choice and the dates, never from guessing who the subject of a sentence is.
   - **What it solves:** supervision, delegation, requests, assistance, observation and ambiguous "we" are no longer inferred.
   - **What it costs:** a database field, which is a migration that needs your approval later, and a form change. It's still self-reported, with the same provenance and the same ceilings: Possible at most for answers and replies.

2. **Stop crediting role descriptions by shared words alone.** A description should support a requirement only through:
   - the title rules (Stage 1);
   - an explicit statement of doing the work, in the person's own clause;
   - or an approved equivalence.

   Overlap of a single word, which caused all 7 sense collisions and most of the 20 false credits, would become a lead for a question, not credit.

3. **Recognition through your equivalence review (Stage 4)**, not through looser matching. Paraphrase misses are the largest part of the 124 missed ownerships.

4. **Keep the local model out of verdicts.** If it's used at all, it stays a question suggester. A narrow involvement classifier could be measured later against this new 400-item benchmark, but it wouldn't decide anything.

**What I wouldn't do:** integrate wink-nlp or compromise, or keep adding regex families for supervision and corrections.

## Decisions needed

1. Agree not to integrate a parser.
2. Whether to design the structured "your part" choice (item 1). That would be a design document first; any migration needs your approval.
3. Whether to make role-description word overlap a lead rather than credit (item 2). That's an engine change, which would come with its own baseline.
4. Continue to Stage 4: the equivalence packet, including a pest-control group for fu-102.

The sealed split `m11_followup4` stays unopened until whatever comes next is frozen.
