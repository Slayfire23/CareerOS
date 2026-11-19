# Phase 5.2: Answer Reader Safety and Recognition — Investigation and Plan

November 6, 2026. **Investigation only. No matching code has changed.**

Evidence comes from the two opened splits: `m11_followup2` (100 cases) and the old blind split (80 cases). They're used here as regression and diagnostic data only, never as proof that a fix generalizes. The raw readings are in `ai-service/evals/reports/m11/followup/phase5-2-investigation.json`.

## 1. Why the unsafe results happen

All eight come from the deterministic answer reader.

| Case | What the reader did | Root cause |
|---|---|---|
| fv-052 (false Supported) | Read "I plan the small-group reading activities myself, the lead teacher plans the whole-class lessons" as one statement of the person's own | The cut that removes another person's clause only fires on a fixed list of 17 verbs ("did", "handles", "runs"…). "Plans" isn't on it, so the teacher's "lessons" counted as the person's |
| fv-061, fv-080 | Credited "I configure our firewalls" and "I've inspected bridges" despite the "I mean, …" that follows | The correction check needs the following words to *shrink* the claim, or to open on another person. "I put in the request and our network engineer actually changes the rules" does neither by its word lists. Both answers also hand the work to a named role mid-sentence |
| fv-046, fv-062, fv-091 | "I make sure every PR gets two reviewers", "I manage cleaning for eight buildings", "I run the swim lesson program" read as doing the work | Oversight is a list of phrases ("managed the team", "scheduled the crews"). "Manage cleaning", "run the program" and "make sure X gets Y" aren't on it |
| fv-042, fv-088 | "We put in a ticket with the managed IT company" and "Snow removal… is a contract with a plow company. I call them…" got Possible | Asking a provider to do the work isn't a kind of ownership the reader knows. Only "hired / outsourced / contracted" phrases are |

**The pattern:** ownership is decided by matching phrases. Each round adds the phrasings it has seen, and the next split brings new ones. These are the families rules-v17 fixed, in new words.

## 2. Why legitimate experience is missed

**32 of 65 answers labeled Supported or Possible got no credit.** The earlier report said 29 of 60, because the harness counted legitimate answers more narrowly. Each case is counted once, under its main cause:

| Main cause | Count | Cases | Fixable without loosening policy? |
|---|---|---|---|
| **Parsing: clear first-person work misread** | 8 | fv-012, fv-029, fv-048, fv-064, fv-079, fv-096, fv-099, fv-100 | **Yes** |
| **Granularity: one correction or hand-off drops the whole answer** | 2 | fv-009 ("…the month-end close, our outside accountant does that part"), fv-025 | **Yes:** drop only the clause that's corrected or handed off |
| **Refusal errors** | 2 | fv-097 (a time claim refused as a bare yes); fv-034 (refused with "remarks about how this should be judged" because of "approve") | **Yes** |
| **Paraphrase: real work, none of the requirement's words** | 5 | fv-037, fv-041, fv-056, fv-076, fv-090 | **Not to Supported** without your approved equivalences. Possible is reachable through a targeted follow-up |
| **Limited or brief activity, labeled Possible** | 7 | fv-005, fv-015, fv-022, fv-040, fv-055, fv-074, fv-083 | **Partly.** Limited hands-on work can be Possible, but fv-015 and fv-074 are also verb misreads. A class can't support "experience" |
| **By design:** another language | 5 | fv-003, fv-027, fv-045, fv-065, fv-084 | Separate track (see the multilingual note) |
| **By design:** an injection mixed with real work | 3 | fv-010, fv-030, fv-069 | Keep refusing. A clearer message could ask the person to resubmit without the instruction |

**Follow-up behavior** also contributed in two of these. fv-037's reply described real classroom routines but was read as undercutting itself, because it says "not just bad ones". fv-040's reply described the work but was read as repeating the question. Follow-ups were asked in only 6 of the 32.

The parsing errors in detail. Each one is a bug, not a policy:

- **English read as not English** (fv-029, fv-048): slang, numbers and product names like "React Query" brought the word-share check under its threshold.
- **A word inside a compound noun sets the ownership:**
  - fv-100: in "I do all the staff training… new **hire** training", "hire" made it oversight.
  - fv-096: in "before calling the **help** desk", "help" made it assistance.
- **A main verb misread as saying little:**
  - fv-015 "I've **done** some MIG tack welds…"
  - fv-099 "I **get** three quotes…, push back on freight terms…"
  - fv-074 "I **went** to a demo day where I flew…"
- **Statements dropped or misattributed:**
  - fv-012: "At the dealership I do the cycle counts…" produced no statement.
  - fv-064: "When people come in… I go through their ID, explain the options…" lost everything except the last sentence.
  - fv-079: only "I've been one of two developers" survived.

## 3. Could a narrowly scoped AI step do better?

The test was a "who did what" reading: `qwen3:8b`, the existing extraction prompt, every quoted span checked against the answer. It ran locally on all 180 opened answers, and nothing was sent anywhere.

| Question | Result |
|---|---|
| Unsafe cases caught, used as a veto (only removes credit) | **4 of 8:** fv-042, fv-052, fv-061, fv-080. In each, another person's subject is explicit in the text |
| Supervision cases caught | **0 of 4.** The model reads "I manage / hire / schedule / assign" as `self, done` |
| Unqualified answers it reads as "the person did the requirement's work" | **35 of 80:** supervisors, assistants, observers, people with only a credential |
| Legitimate answers it would wrongly veto | 5 of 36 credited. 4 are mixed-ownership answers that should stay Possible, not drop to nothing |
| Outputs with spans not in the answer | 60 of 180 (33%) |
| Latency | p50 4.1 s, p95 7.2 s per answer. Not deterministic |

**Conclusion:** the model doesn't separate *doing* from *running*, *helping* or *watching*, and that's the unsafe family it would have to fix. Every case it does catch has an explicit other-person subject that code can find. It can't be trusted to grant credit: it would have granted 35 unqualified answers. As a veto it is too blunt, and it brings non-determinism into the verdict.

Its one real strength is noticing that a paraphrase is about the requirement. The existing design already uses that only to *ask a follow-up question*, never to decide.

## 4. Approaches compared

| | A. More regex phrases | **B. A structured clause reading (recommended)** | C. Model veto in the verdict path |
|---|---|---|---|
| How it works | Add the new phrasings to the lists | Split each sentence into clauses wherever a new subject starts. For each clause, read **who** (I, we, a named person, a role, a company) and the **main verb**. Then classify the verb's kind of involvement from a small verb lexicon: did / ran or managed / arranged or requested / helped / watched. The object can change the kind: "run the dishwasher" vs "run the program" | Ask `qwen3:8b` who did each thing. Code checks the spans and removes credit |
| Fixes the 8 unsafe cases | Yes, but only these wordings | Yes, by structure (§5) | 4 of 8 |
| Generalizes | Poorly: five rounds of evidence | Better: a new verb is one lexicon entry, and the clause structure doesn't change | No better than B, plus model drift |
| Deterministic, auditable | Yes | **Yes**: every reading has a clause, a subject and a verb to show | No |
| New dependency | None | **None.** It builds on the existing statement splitter and the verb finder in `readAct` | None (the model is already local) |
| Recognition gains | Few | Fixes the 8 parsing errors and the granularity problem | None for verdicts |

Option D was a full part-of-speech tagger library (for example `compromise`, which runs offline). It would make subject detection sturdier, but it's a new dependency, it's English only, and B gets the cases above without it. I'd keep it in reserve and only propose it if B's subject detection proves fragile.

**Recommendation: B.** It's the smallest maintainable change. It replaces phrase matching for *ownership* with a structure that keeps the readings separate:

- **performed:** the person did it.
- **oversaw:** ran, managed, made sure, approved, hired, scheduled or assigned it.
- **requested:** put in a ticket, called the provider, arranged it.
- **assisted:** helped, prepped, or handed things over.
- **observed:** watched, sat in, or took notes.
- **other:** a colleague, contractor or company did it.

**Unclear stays unclear and gets no credit.** The model stays out of the verdict path. Its existing use, suggesting a follow-up question behind the flag, doesn't change.

## 5. Implementation plan (after your approval)

### Stage 0 — sealed blind split, before any matching code changes

- One agent writes about 120 new scenarios from a brief. It never sees the repo or these failures. The brief covers ownership mixes, supervision, contractors, colleagues, corrections, paraphrases, durations, brief exposure, follow-up replies, injections and other languages.
- A second agent labels them blind.
- I commit both without opening the scenarios or labels.
- After Stages 1–3 are frozen in a commit, it runs exactly once, sealed. Only then is it opened.

### Stage 1 — ownership attribution and safety (rules-v18)

1. A **clause splitter** that starts a new clause at a boundary followed by a new subject:
   - The boundaries are a comma, semicolon, "and", "but", "while" and "whereas".
   - A new subject is a determiner plus one to three words, a capitalized name, or a pronoun, followed by a finite verb in the right position.
   - This replaces the 17-verb list. **Fixes fv-052.**
2. **An involvement reading for each clause**, from the subject plus the main verb and its object, as listed in §4. It replaces the `OVERSAW` and `ASSISTED` phrase lists, and verb lexicons replace phrase lists.
   - Compound nouns can no longer set ownership: "new hire training", "help desk".
   - **Fixes fv-046, fv-062, fv-091, fv-042 and fv-088, plus fv-100 and fv-096 in Stage 2.**
3. **Corrections apply clause by clause.** A correction like "I mean, I put in the request and our network engineer actually changes the rules" retracts the earlier claim it revises. The person's own remaining clause keeps its own reading: "put in the request" is *requested*. Nothing outside the correction is dropped. **Fixes fv-061 and fv-080 without dropping fv-009 or fv-025.**
4. **Several people in one sentence:** each clause is credited only to its own subject. "Mixed" means Possible at most, and only for the person's own part. Supported needs the requirement's own words in the person's own clause.
5. **Ambiguity rule:** a clause with an unclear subject, or a verb the lexicon doesn't classify, is *unclear*. It earns nothing, and it can make a follow-up question worth asking.

### Stage 2 — legitimate recognition (same version, separate commit)

1. Fix the English check for slang, numbers and product names (fv-029, fv-048), keeping the non-English tests passing.
2. Main-verb fixes: "have done some X", "get quotes, push back", "went to X where I flew". The brief-exposure and limited-activity rules still apply.
3. Scene-setting openings ("At the dealership I…", "When people come in, I…") keep the person's clause (fv-012, fv-064).
4. **fv-097:** an explicit time claim on a timed requirement isn't a bare yes. It goes to the earlier-roles question (rules-v17) and is never Supported.
5. **Refusal messages chosen by cause:**
   - oversight wording: "Say what you did yourself…";
   - hypothetical wording: "This reads as not done yet…";
   - an instruction: "Remove the note about how this should be judged and describe your work".

   No more "remarks about how this should be judged" for "approve".
6. **Paraphrases stay under the current policy:** no Supported without your owner-approved equivalences. When there's clear first-person concrete work and no shared terms, ask a targeted follow-up instead of giving nothing.

### Stage 3 — follow-up quality

1. Choose the question from what's missing, in this order:
   1. **who did it**: "Which parts did you do yourself, and which did others do?"
   2. **the level of responsibility**: "Did you do the [work] yourself, or lead or schedule the people who did?"
   3. **how long**: "For how long, and in which role?"
   4. **the link to the requirement**: "How does this relate to [requirement]?"
2. **A reply can't override disqualifying evidence without a credible explanation.** The disqualifying evidence is an answer clause that says the person doesn't do it, or that someone else does. Two examples:
   - fv-034: "I don't pick much myself", then "I pick right alongside them every day".
   - fv-025: "the finance guy builds the forecast", then "I built the whole budget, every line".

   A reply that flatly reverses that stays unresolved. A reply that explains the change specifically (when, what changed, what they did) can reach Possible at most. It's marked as conflicting with the earlier answer.
3. A bare yes, or a reply that only repeats the requirement, is never proof (unchanged).
4. Fix the reply misreads (fv-037: "not just bad ones" isn't undercutting; fv-040).

### Validation for every stage

- **Baselines:**
  - rules-v16 and rules-v17 engine results on all spent sets must not change (0 of 1,251).
  - Every changed answer or reply reading is listed and reviewed.
  - Unintended changes are investigated before commit.
- **Regression tests:**
  - one per identified failure: the 8 unsafe cases, the 8 parsing cases, fv-009, fv-025, fv-097, fv-034, fv-037, fv-040;
  - plus wording variants written separately, so tests don't only pin the exact fixture sentences.
- **Full suite:** unit, integration, Python and ruff, build, secret scan, `npm audit`, and the browser suites with the flags off and on.
- **The sealed split,** run once after the freeze, reported separately:
  - false Supported;
  - unsafe Possible;
  - recognition of legitimate experience, split into Supported and Possible;
  - refusal accuracy: honest answers refused, and unqualified answers correctly refused;
  - follow-ups: asked, useful, and replies accepted, good and bad.
- **The opened splits** are reported as regression data only.
- **Not touched:** your locked labels.
- **All local.** No push, deployment or migration. Flags stay off by default.

### What this won't do

- No Supported from paraphrases until you approve the equivalence groups.
- No credit for answers in other languages.
- No model in the verdict path.
- A clause the structure can't read stays unresolved, so recognition will still be conservative.

## Decisions needed

1. Approve **B** (structured clause reading, no new dependency), with the model kept out of verdicts?
2. Approve Stage 0: two agents create a new sealed split of about 120 scenarios, before any code changes.
3. Should the *requested* involvement ("put in a ticket", "call the provider") ever count, for example for a requirement like "vendor coordination"? I'd treat it like oversight: it counts only where the requirement asks for that kind of work.
