# Phase 5.2: Answer Reader Safety and Recognition — Evaluation Report

November 6, 2026. **rules-v18.**

- **Commits:** local only, `858603c` (Stage 0) through `aa2727e` (freeze). Nothing pushed, deployed, or migrated.
- **Flags:** off by default.
- **qwen3:8b:** only suggests follow-up questions; it never sets a verdict.
- **Your locked human labels:** unchanged.

## Result: the success criteria are not met

| Criterion (new sealed split, 120 cases) | Result |
|---|---|
| Zero false Supported | **Fail: 3** (rules-v17: 3) |
| Zero unsafe Possible on hands-on work | **Fail: 7** (rules-v17: 8) |
| Better recognition than rules-v17 | **Fail: 35 of 75 credited** (rules-v17: 37) |
| No unexpected engine regressions | **Pass:** 0 of 1,251 changed |
| No successful prompt injections | **Pass:** 0 of 6 raised credit |
| No unsupported follow-up acceptances | **Fail: 2** (rules-v17: 1) |

**The fixes worked on the cases they were built from, but they didn't generalize.** On the opened 100-case split, false Supported fell from 1 to 0 and unsafe Possible from 7 to 0. On the sealed split, only 7 of 120 verdicts changed. Three moved closer to the label and four moved farther. Nothing was changed after unsealing.

## How it was run

1. **Stage 0:** one agent wrote 120 scenarios without seeing the repo, and a second agent labeled them under your six rules. Both were committed before any code changed. I didn't read them, and only checked their structure.
   - A sealed rules-v17 baseline was recorded.
   - It was re-run later from the Stage 0 code and matched on every verdict count.
2. **Stages 1a, 1b, 1c, 2 and 3:** each was committed separately.
   - After each one: unit and integration tests, an engine comparison (always 0 of 1,251), and a reading-by-reading comparison on 1,022 spent and opened answers.
   - Every changed reading was reviewed before commit.
3. **Freeze** (`aa2727e`): the full suite passed.

   | Check | Result |
   |---|---|
   | Unit | 2,226 |
   | Integration | 176 |
   | Python | 512 |
   | ruff, build, secret scan | pass |
   | `npm audit` | 0 vulnerabilities |
   | Browser, flags off | 31 passed, 3 skipped |
   | Browser, flags on | 32 passed, 2 skipped |

4. **Unsealing:** the new split ran once against the frozen code, in `v3-blind-unsealed-v18.json`. For a per-case comparison only, I then ran the rules-v17 code on it too, in `v3-blind-unsealed-v17-after.json`.

## The new split in detail (rules-v17 → rules-v18)

| | rules-v17 | rules-v18 |
|---|---|---|
| False Supported | 3 | 3 |
| Credit above the label | 12 | 11 |
| …unsafe Possible on hands-on work | 8 | 7 |
| Labeled Supported → got Supported / Possible | 3 / 20 of 39 | 3 / 18 of 39 |
| Labeled Possible → got Possible | 12 of 36 | 12 of 36 |
| Honest answers refused | 2 | 2 |
| Unqualified answers refused | 11 of 45 | 9 of 45 |
| Follow-ups asked (on unqualified people) | 16 (4) | 30 (14) |
| Bad replies accepted (contradicting the answer) | 1 (1) | 2 (2) |
| Injections that raised credit / non-English promoted | 0 / 0 | 0 / 0 |
| Model latency p50 / p95 | 4.4 s / 7.4 s | 4.3 s / 6.8 s |

### Every verdict that changed

| Case | Change | Label | Why |
|---|---|---|---|
| fw-034 | Possible → nothing | requested from a provider, not supported | **Fixed:** asking a provider isn't doing the work (rule 3) |
| fw-114 | Possible → nothing | requested from a provider, not supported | **Fixed:** same |
| fw-009 | nothing → Possible | Possible | **Fixed:** a correction now takes back only the claim it contradicts |
| fw-004 | nothing → Possible | someone else did it, not supported | **New unsafe result.** Code asked "which part was yours?", and "I built the forecasting model" was accepted, though the answer said Priya built it. The contradiction check didn't find the verb in "Priya owns the forecasting model, she built…": "owns" is too short for its pattern, and "built" is past the six words it scans |
| fw-017 | Possible → nothing | Supported | rules-v17 accepted a reply with no "I" in it ("Spring is planting annuals…"), only because "spring" ends in "-ing". rules-v18 reads it correctly as no own work. The loss is right, but recognition is lower |
| fw-054 | Possible → nothing | Possible | The API words are only in Kevin's clause ("Kevin designs the API contracts"), and the person's clause has none. The reply ("The designs… are his") then counts as undercutting itself |
| fw-105 | Possible → nothing | Supported | "My manager sends the corporate photo and I build it on my own" counts as handing part to someone else, though the manager only sends an input. That mixed-sentence rule is too broad |

### The 11 cases credited above their label

**6 come from the rules engine, not the answer reader.** The engine reads the role title or the employment dates before any answer, and this round didn't change it.

| Case | Credit | Source |
|---|---|---|
| fw-008 | **Supported** (false) | Role title, for an electrician's helper |
| fw-083 | **Supported** (label: Possible) | 30 months in a dental-receptionist role. The labeler judged the answer alone; the dates support it. This is arguably a labeling difference |
| fw-037, fw-063, fw-078, fw-082 | Possible | Role titles: observing safety training, a sanitation lead, a diet-office manager, a pharmacy tech |

This was hidden until now, because no earlier split separated engine credit from answer credit. **It's the largest single source of unsafe credit on this split.**

**5 come from the answer reader or a reply:**

| Case | Credit | Cause |
|---|---|---|
| fw-090 | **Supported** (false) | "I finished the free Codecademy Python course over a couple of weekends" wasn't recognized as a course. The brief-exposure list knows "took a course" and "over a weekend", not these |
| fw-115 | Possible | "One semester of ASL 101" isn't recognized as a class |
| fw-016 | Possible | The passive "Incoming steel gets checked…" has no one in it. The rule for sentences about things only knows "is/are/was/were", not "gets" |
| fw-001 | Possible | The model suggested a question, and "I do all the PM on the rooftop units myself" was accepted. The answer implied the techs do it ("hand out the work orders to the two techs"), but never said so outright, so nothing was ruled out |
| fw-004 | Possible | See above |

### The 40 legitimate answers still without credit, by cause

| Cause | Count | Cases (examples) |
|---|---|---|
| Paraphrase: none of the requirement's words, or the model's follow-up reply misread | 10 | fw-014, 030, 042, 055, 070, 081, 093, 105, 117, 119 |
| Your rules by design: helping, observing, a class for proficiency, a different tool | 7 | fw-028, 046, 065, 101, 102, 018, 110 |
| Another language, or an injection beside real work (by design) | 6 | fw-003, 033, 064, 096, 006, 091 |
| Parsing | 11 | Adding-only corrections (fw-017, 044); mixed ownership with the person's part beside someone else's (fw-010, 054, 089, 120); time claims without a number, such as "since 2018" and "since I was 19, I'm 28 now" (fw-005, 067); limited work ("a few Friday nights behind the bar", fw-023, 080, 106) |
| Corrections leaving partial work with no shared words | 4 | fw-031, 052, 068, 086 |
| Refused wrongly | 1 | fw-019: "Got certified by the company" refused as a remark about judging |
| Credential path | 1 | fw-040: a forklift certification needs an entry |

## On the opened splits (regression data, not proof)

| | rules-v17 | rules-v18 |
|---|---|---|
| m11_followup2, false Supported / unsafe Possible | 1 / 7 | **0 / 0** |
| m11_followup2, honest refused / legitimate still missed | 3 / 29 | 1 / 20 |
| m11_followup, your 30 labels | 0 false Supported, 0 unsafe | unchanged |
| m11_followup, all 80 | 3 unsafe Possible | 3: fu-057 and fu-116 match your Possible labels; fu-058's Possible comes from its role title, "Plumbing Foreman" |

**Engine changes:** rules-v16, rules-v17 and rules-v18 engine results are identical on all 1,251 spent requirements.

**Readings on spent and opened answers changed** in 20 answer verdicts, 61 refusals and 14 replies. Each was reviewed in its stage's commit, and nearly all of the refusal changes only improve the message.

**One deliberate policy change:** an answer saying "we" no longer gives Possible; a "which part was yours?" question asks instead (your rule 6). The old test pinning "we" at Possible was updated.

## What this shows

1. **The dependency-free clause reader closes the structures it was shown, but not new ones.** Every new miss is a construction the heuristics don't know:
   - a short verb ("owns");
   - a passive with "gets";
   - "finished the course over a couple of weekends";
   - "one semester of";
   - a noun mistaken for a verb ("wound", "mechanics").

   This is the inadequacy you said would justify a parsing dependency. A deterministic, offline part-of-speech tagger would find subjects, verbs and passives without word lists. I'd propose it only with your approval.
2. **The engine's role-title rule is now the largest source of unsafe credit.** A helper's, observer's or manager's title gives Possible or Supported for hands-on work before any answer is read. Fixing it is an engine change, which needs its own baseline.
3. **Code-asked follow-ups add risk.** They doubled the questions to unqualified people (4 → 14), and the reply checks are weaker than the answer checks. One contradicting reply got through. A reply should probably never lift a verdict when the answer itself shows supervision, a request, or someone else's work.
4. **Recognition didn't improve.** Most misses are paraphrases with no shared words and partial work, which the term policy won't credit without your approved equivalences.

**Recommendation:** not ready for any rollout. Keep everything local with flags off. This report isn't a production proposal.

The next phase should be decided by you. The candidates:
- the role-title engine rule;
- a parser-based subject and verb reading, which is a dependency decision;
- tighter reply rules for code-asked questions;
- your review of the equivalence groups.
