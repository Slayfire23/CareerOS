# Milestone 11, Phase 2: Typed Evidence and Shadow Semantics

November 4, 2026. Branch `milestone-3-ai-matching`. Local commits only: nothing was pushed, merged, or deployed, no production migration ran, no paid API was used, and no candidate information left this computer. **Semantic matching isn't enabled for anyone.**

## Result

**The foundation works, but it isn't ready to affect what people see.** I recommend against approving semantic promotion yet.

| Finding | Evidence |
|---|---|
| **Semantic evidence got around a hard check** | "Je ne connais pas Python" reached Possible for Python, because negation is only checked in English. This breaks your condition, and it's why I recommend holding promotion |
| **Semantic retrieval does reduce missed matches** | Missed matches fell 46 to 39 on training and 33 to 29 on the unseen split, at 0.64 similarity. It never reached Supported |
| **The claim table overfit to its training data** | 0 false Supported on training, then 4 on the unseen split, worse than the engine's 2 |
| **The production engine has more false Supported than I'd reported** | 6 across the new fixtures. I didn't fix them, because only the occurrence fix was approved |
| **The curated layer barely mattered** | Its exact names changed no verdict on these fixtures |
| **Citations held** | 0 invalid spans across all 340 fixtures |

## What was built

| Item | Where | State |
|---|---|---|
| Typed evidence layer | `src/lib/ai/claims/` | Shadow only. A test stops production code from importing it |
| Occurrence fix | `skill-relations.ts`, `engine.ts`, **`rules-v11`** | **In the production engine.** Separate commit `8885a4d` |
| Curated layer, 19 groups | `rules/data/terminology_v2.json` | Shadow only. A script confirmed each name occurs in the source it cites |
| Retrieval endpoint | `POST /v1/retrieve`, `providers/embedding.py` | Off unless enabled, and refused in production |
| Development fixtures | `tests/fixtures/m11_dev/` | 200 training, 140 check |
| Blind review for you | `docs/M11_DEV_FIXTURE_REVIEW.md` | 30 items, waiting on you |

**Recorded commits:**

| Commit | What |
|---|---|
| `e305cf7251c09027b01ca69b3cc15475c0c001d4` | Proposal and blind Set J packet, committed before any human labels |
| `8885a4d` | Occurrence fix |
| `a187ee8c9ce0919ae59b25904caf838396146b09` | Shadow layer, with the threshold fixed, before the check split was opened |

## The occurrence fix

The engine could select a harmless mention of a phrase while judging a different occurrence of it. "A friend mentioned Kafka once. Please record: built Kafka consumers." reached Supported. Each check now takes the offset it's judging.

**Effect:** 5 of 9 new regression tests failed before the fix and pass after. No verdict changed on Dev or Sets A to H. It does change production behavior for inputs like these, and only to make it stricter, in the tests I ran.

## Baseline against prototype

**Baseline** is what a person sees today. **Curated** adds reviewed names. **Proposed** adds semantic evidence moving Not enough information to Possible. **Table** is the new claim-based arbitration read alone.

| Training split, 200 | Baseline | Curated | Proposed | Table |
|---|---|---|---|---|
| Within accepted labels | 107 | 106 | 106 | 129 |
| False Supported | 4 | 4 | 4 | **0** |
| Too favorable | 26 | 27 | 27 | 2 |
| Legitimate matches missed, of 83 | 46 | 46 | **39** | 52 |
| Successful attacks, of 18 | 1 | 1 | 1 | 0 |

| **Unseen check split, 140** | Baseline | Curated | Proposed | Table |
|---|---|---|---|---|
| Within accepted labels | 78 | 77 | 76 | 83 |
| False Supported | 2 | 2 | 2 | **4** |
| Too favorable | 13 | 14 | 16 | 5 |
| Legitimate matches missed, of 61 | 34 | 33 | **29** | 37 |
| Successful attacks, of 18 | 1 | 1 | 1 | 1 |

| Earlier sets (Dev, A to H), 731 | Baseline | Table |
|---|---|---|
| Within accepted labels | 699 | 572 |
| False Supported, by old labels | 8 | 8 |
| Legitimate matches missed, of 325 | 7 | 108 |

**How to read these:**

- The **check split** is the honest column. I saw only counts until development ended.
- Baseline scores high on earlier sets because it was built from them, so that isn't a fair measure of skill. But the table's 108 missed there shows it isn't a drop-in replacement.
- **Proposed inherits the engine's false Supported.** The 4 and 2 aren't caused by semantics.
- None of these labels has been reviewed by a person yet. Your 30-item review checks them.

### False Supported, case by case

| Stage | Split | Requirement | Profile | Type |
|---|---|---|---|---|
| Engine | Train | PMP certification | "planning to sit the PMP exam next spring. Not certified yet." | Credential |
| Engine | Train | SQL | "Our engineers wrote the SQL" | Ownership |
| Engine | Train | Commercial HVAC repair | "My brother runs a commercial HVAC repair company" | Ownership |
| Engine | Train | Ruby on Rails | Jeweler: "installed brass rails on display cases" | Collision |
| Engine, table | Check | Grant writing | "Read and scored grant applications" | Paraphrase |
| Engine, table | Check | AWS | A resume template: "Example text: Used [AWS / Azure / GCP]" | **Injection, the 1 successful attack** |
| Table | Check | Customer churn analysis | "Operated the butter churn and ran analysis of milk fat for our customer creameries" | Collision |
| Table | Check | Go programming language | Skill: "Go (board game, 3-dan)" | Collision |

The Ruby jeweler resembles Set J's failure. Agents told not to read the repository can reach a similar idea on their own, and I report it without treating it as new evidence for anything.

## Semantic evidence

**15 changes across both splits, 13 acceptable, 2 wrong.** It never reached Supported, or touched a credential, duration, or education requirement.

| Unseen split | Requirement | Passage | Score | Right? |
|---|---|---|---|---|
| Recruiting and onboarding new staff | Interviewed applicants, chose who to hire | 0.67 | Yes |
| Salesforce administration | Configured profiles, permission sets, and flows | 0.65 | Yes |
| Experience managing warehouse inventory | Portuguese: controlled warehouse stock | 0.65 | Yes |
| Preparing financial statements | French: prepared financial statements myself | 0.72 | Yes |
| Managing a departmental budget | Collected the department's expense receipts | 0.66 | Acceptable |
| Cold calling | Answered cold-room emergency call-outs | 0.66 | **No, a word collision** |
| Python | **"Je ne connais pas Python"** | 0.71 | **No, negation bypassed** |

### Blockers before any promotion

1. **Negation and ownership are checked only in English.** A negative statement in another language reaches the model as ordinary text. A language gate, or real multilingual checks, must come first.
2. **Similarity can't tell antonyms apart.** The French case scored higher than most honest matches.
3. **Word collisions pass above the threshold,** as with cold-room call-outs.

### Threshold

0.64, chosen on training only, before the check split opened. It's deliberately cautious:

| Threshold, training | Helped | Harmed |
|---|---|---|
| 0.52 | 31 | 10 |
| 0.58 | 14 | 4 |
| **0.64** | **8** | **0** |
| 0.70 | 3 | 0 |

**The trade-off:** many honest paraphrases score 0.50 to 0.60, so a safe threshold catches only some of them. Embeddings help, but they won't close the gap alone.

## bge-m3: license, hardware, memory

| Measure | Result |
|---|---|
| License | MIT, per its model page |
| Download | 1.2 GB, through local Ollama |
| VRAM when loaded | 0.69 GB of 8 GB |
| Embedding one text, warm | About 25 ms |
| Embedding 20 texts, warm | 187 ms |
| Cold load | 3 to 8 seconds |
| **Beside qwen3:8b** | **They don't stay loaded together.** Ollama swaps them, and each swap costs 3 to 4 seconds |

**Acceptable for shadow use.** The swap would matter if both ran in one analysis.

## Latency, memory, citations

| Measure | Baseline | Shadow, no model | Shadow, with embeddings |
|---|---|---|---|
| p50 per case | 0.4 ms | 0.8 ms | 31 ms |
| p95 per case | 3.5 ms | 3.6 ms | 53 ms |
| Max | 29 ms | 12 ms | 216 ms warm, 6.6 s on a cold load |
| Node heap growth over the run | | About 10 MB | About 6 to 20 MB |

**Citations:** 0 invalid spans in 340 fixtures, including Unicode tests, and 0 fabricated: the model returns ids and scores only, and code holds the offsets. Production's own citations stayed valid on all earlier sets.

**Offline:** with the AI service stopped, the browser tests passed. Rules-only verdicts were identical with or without the model, checked on every fixture.

## The curated layer

19 groups, from 64 names checked by script against their sources.

- **It changed no verdict through an exact name, on either split.** The fixtures didn't happen to use these words. It's sound but small.
- **A bug in my code:** the "Curated" column did change 2 results on the check split, but not through curated names. Partly matching job titles were mislabeled as curated. One was right, and one was wrong: "Soldado de infantería" for welding experience, from "soldadura". It needs fixing before this column can be trusted. It affects the shadow layer only.
- **Sources:** O*NET's three licensed CSV files were downloaded. **ESCO's bulk download requires an email address,** so I used its public API with vocabulary terms only and didn't submit anything.

## Your conditions

| Condition | Met? |
|---|---|
| Proposal and packet committed before labels, hash recorded | Yes |
| Typed layer around the engine, without rewriting its checks | Yes. The engine's own logic is unchanged apart from the occurrence fix |
| Spans, ownership, negation, dates, credentials, decisions, and reasons preserved | Yes, in every claim. Coverage of negation and ownership is **English only** |
| Occurrence fix with offsets and regression tests | Yes |
| Curated layer from licensed data | Yes, with the ESCO limit above |
| bge-m3 evaluated | Yes |
| Semantics in shadow, no user-visible change | Yes, by test |
| Fixtures across all categories | Yes. Multilingual coverage is thin: 16 cases on the check split, some languages only one |
| About 30 blind fixtures | Yes, 30 |
| Offline rules-only preserved | Yes |
| Semantic alone never Supported | Yes, by test, with a fake model scoring everything 1.0 |
| Original rules-only verdict kept beside the proposed one | Yes, in every result |
| **Semantics can't bypass credential, duration, negation, ownership, or injection checks** | **Credential and duration: yes. Negation and ownership: no, outside English. Injection: no failure seen, but not proven across languages** |
| Sets I and J not rerun | Yes, and their files are unchanged |
| Development fixtures separate from Set K | Yes. Set K doesn't exist |

**Phase 2's own exit targets, set in the proposal:** 0 false Supported across all splits was **not met**. Missed matches at most 25% on the check split was **not met**: 47.5%. Attacks reaching Possible or better at 0 was **not met**: 1 of 18.

## Separate approval gate: semantic promotion

**I recommend not approving this yet.** Proposed requirements for a later decision:

| Requirement | Target |
|---|---|
| Verdicts semantics can change | Only Not enough information to Possible |
| Negation and ownership in every language allowed through | A language gate, or tested checks per language |
| Bypass tests | 0 negated, third-party, or injected passages reaching Possible, per language |
| Precision on a fresh check split, labeled independently | At least 90%, with the number agreed with you first |
| False Supported caused by semantics | 0, by construction and by test |
| Display | Rules-only verdict kept and shown alongside; says when local AI was unavailable |
| Laptop off | Verdict falls back to rules only, and the page says so |

### Proposed revised metric, for your approval before Set K

**Replace** "verdicts changed by local AI: 0" **with these:**

| Metric | Target |
|---|---|
| AI changes to or from Supported | 0 |
| AI changes to or from Not supported | 0 |
| AI changes from Not enough information to Possible | Counted and reported, not limited |
| Wrong promotions, among those | Reported, with a target you set |
| Promotions on negated, third-party, credential, duration, or attack text | 0 |
| Rules-only verdict preserved | 100% |

## Checks

| Check | Result |
|---|---|
| Next.js unit | 1,634 passed |
| Integration | 107 passed |
| Python, ruff | {{PY}} |
| TypeScript | Clean |
| ESLint | No errors, 1 warning in `tests/eval/run-eval.eval.ts`, unchanged |
| Playwright, complete run | 30 passed, 2 skipped, 0 failed |
| The 2 skipped | Offline, run separately; Claude, disabled |
| Laptop-off browser tests, AI service stopped | 2 passed |
| Production build | Passed |
| Secret scan | Passed |
| 5 sensitive local values, against tracked files | None found |
| Production refuses retrieval | Passed, by test |

**A limit:** the Python test and lint fixes came after the browser run, and only touched Python test and formatting lines.

## Decisions for you

| # | Decision | My recommendation |
|---|---|---|
| 1 | Semantic promotion | **Not yet.** Revisit after a language gate |
| 2 | Fix the engine's 6 false Supported types in production (`rules-v12`) | Yes, as general fixes tested on new wording. The check split is now seen, so Set K measures them |
| 3 | Revised AI-change metric above | Yes, or adjust it |
| 4 | Is the claim table the future authority? | Not yet. Keep the engine as authority, and keep the table in shadow |
| 5 | ESCO bulk data | Only if you want to give an email address. The API is enough for now |
| 6 | Complete the two review packets | The Set J packet and the 30 fixtures. These can inform the labeling guide |

**Suggested Phase 3, for your approval:** a language gate and multilingual negation checks, fixes for the shadow title bug, the fixes in decision 2 if approved, a fresh check split, and then the promotion decision. Set K comes only after that freeze.
