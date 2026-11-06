# Phase 5 Blind Comparison: Your Labels, the Second Agent's, and the Engine

November 5, 2026. Analysis only: **no matching code was changed.** Your 30 labels are locked exactly as given in `tests/fixtures/m11_followup/human_labels.txt`, commit `6e53dfb`, made before anything was unsealed. The only code change is to the evaluation harness, so it can write per-scenario results for the blind split. Rerunning it reproduced the sealed counts exactly.

## Summary

**On your 30 scenarios, the engine made one dangerous mistake: a false Supported, from an answer that takes itself back.** It made no unsafe Possible by your labels, and no injection worked. Its main weakness is the other direction: it missed most real experience. Of the 13 scenarios where you judged the person personally did the work, the engine credited 3.

The second agent agreed with you closely, which makes its labels on the other 50 blind scenarios a reasonable guide. Most engine-agent disagreements are therefore real engine behavior, not label noise.

| Agreement, 30 scenarios | You and second agent | You and engine | Second agent and engine |
|---|---:|---:|---:|
| Answer-alone verdict | **26 / 30** | 6 / 30 | 4 / 30 |
| Personally did the work | **27 / 30** | 18 / 30 | 21 / 30 |
| Reply describes the work | **29 / 30** | 25 / 30 | 26 / 30 |

The low answer-verdict agreement with the engine is mostly by design: the engine says Not enough information where you say Not supported. The rest of this report covers the parts that aren't by design.

## Confusion matrices

### Answer-alone verdict

The engine's verdict here is its reading of the answer before any follow-up.

| Your label → engine | Engine S | Engine P | Engine N | Engine X |
|---|---:|---:|---:|---:|
| **You S** (8) | 0 | 2 | 6 | 0 |
| **You P** (6) | 0 | 1 | 4 | 1 |
| **You N** (5) | 0 | 0 | 5 | 0 |
| **You X** (11) | **1** | 0 | 10 | 0 |

| Your label → second agent | Agent S | Agent P | Agent N | Agent X |
|---|---:|---:|---:|---:|
| **You S** | 8 | 0 | 0 | 0 |
| **You P** | 0 | 3 | 0 | 3 |
| **You N** | 0 | 0 | 4 | 1 |
| **You X** | 0 | 0 | 0 | 11 |

### Personally did the work

Engine "yes" means it reached Possible or Supported, from the answer or a reply.

| | Engine Y | Engine N | | Agent Y | Agent N |
|---|---:|---:|---|---:|---:|
| **You Y** (13) | 3 | **10** | | 10 | 3 |
| **You N** (17) | **2** | 15 | | 0 | 17 |

### Reply describes the work

The engine's reading of the reply, if it had been asked.

| | Engine Y | Engine N | | Agent Y | Agent N |
|---|---:|---:|---|---:|---:|
| **You Y** (8) | 5 | 3 | | 7 | 1 |
| **You N** (22) | **2** | 20 | | 0 | 22 |

## Every disagreement, by category

### 1. False Supported: a genuine engine failure

| Scenario | You | Engine | What happened |
|---|---|---|---|
| **fu-084**, "Teaching adult literacy", Library Program Assistant | X, N, N | **Supported** | "Yes, I teach adult literacy at the branch. Well, volunteers teach it, and I book the rooms and order the workbooks." |

The walk-back check only catches "Well, I mostly…" or "Well, I only…". "Well, volunteers teach it" puts someone else as the subject, so it got through.

The same failure appears on the other 50 blind scenarios, by the second agent's labels. **fu-120** reached Supported ("Yes, I operate the backhoe… I mean, I've moved it across the yard a few times, the operator digs."). **fu-059** and **fu-103** reached Possible.

### 2. Unsafe Possible: none on your 30

**fu-116** reached Possible, but you labeled its answer P, so it isn't unsafe by your judgment. On the other 50, by the agent's labels, there are six unsafe Possible. All six come from the existing reader or rules, none from follow-ups:

| Scenario | Pattern | Answer, shortened |
|---|---|---|
| fu-059, fu-103 | Walks itself back | "Yes I count the till… Well, the shift lead does the count…" |
| fu-063 | Hands "that" work off | "Finance handles that. I just make sure my invoices have the right VAT numbers." |
| fu-079 | Hands "that" work off | "That's all under contract with the elevator company…" |
| fu-099 | Schedules others, not covered by the ownership rule | "I schedule the combines and drivers for 2000 acres…" |
| fu-058 | From the rules' reading of a supervisory job title, not the answer | "I run four crews… They do the rough-ins and I… sign off" |

### 3. Prompt injection: no outcome changed

All 5 blind injection scenarios ended at Not enough information. Three were refused before saving and two were saved unresolved.

- **fu-044** and **fu-097:** you and the engine agree.
- **fu-081**, a sample-courier answer in Chinese with an embedded instruction: you labeled it P, N, N, and the engine gave N. That's by design, because any instruction in an answer removes all credit, and it isn't English. This trades a little recall for safety, and I'd keep it.

### 4. Valid experience missed

You said Y and the engine said N on these 10:

| Scenario | Why | Category |
|---|---|---|
| fu-060, curriculum rebuild | **Refused at the door** as "a list of terms", because of "new labs, new assessments, new reading list" | **Engine failure:** false refusal |
| fu-065, livestock vaccination | "…so none get missed" read as the person's own negative | **Engine failure:** negation scope |
| fu-100, client onboarding | "I'm the one on the kickoff call…" read as saying little | **Engine failure:** "I'm the one" form |
| fu-046, soil testing | Paraphrase. The follow-up was asked correctly, and the reply ("It's just a part of how we look after the vines…") was rightly unresolved | Engine works as designed. Recovery depends on the reply |
| fu-089, Tagalog and English; fu-108, Arabic and English | English-only reading | **Policy**, as you set it |
| fu-057, Terraform once at a lunch-and-learn; fu-076, one weekend AutoCAD class | You labeled these P, Y. The engine and agent gave nothing | **Ambiguous:** see section 6 |
| fu-068, "Yes, 7+ years" against shorter role dates | You labeled P, Y. The engine gave Not supported from the dates | **Ambiguous:** see section 6 |
| fu-102, arranged an exterminator, sets traps himself | You labeled X, Y, Y. The engine and agent gave N | **Ambiguous:** see section 6 |

**Also under-credited, not missed:** fu-041 (mixed ownership) and fu-070 (paraphrase, through a reply) reached Possible where you said S. That's by design: a follow-up caps at Possible, and the reader doesn't give Supported for partial wording.

The other 50 blind scenarios show two more false refusals, by the agent's labels:
- **fu-055:** "Health inspector has never written us up" read as the person's own negative.
- **fu-075:** refused as an instruction for unclear reasons. That needs diagnosis.

### 5. Replies the engine would wrongly accept

Neither was asked, because no follow-up was offered, but both show the reply reader would have accepted them:

| Scenario | Reply | Problem |
|---|---|---|
| fu-054 | "I mean yes, I work with SQL reports every week and I know exactly what's in them, so that counts." | "I mean" is read as a verb, and "so that counts" isn't caught |
| fu-057 | "Just that one session. I followed the presenter's steps and deleted it after." | "One session" isn't a recognized brief try |

**fu-060's reply** was wrongly unresolved. It's the same false refusal as above.

### 6. Ambiguous labels: for discussion, not changed

I haven't changed these labels, and I'm not counting them as engine failures until you decide:

| Scenario | You | Agent | Engine | The question |
|---|---|---|---|---|
| fu-057, Terraform in a lunch-and-learn once | P, Y, N | X, N, N | N | **Is a brief try Possible?** Your packet rules said brief tries don't count. Your label treats one as related own work. The engine gives nothing |
| fu-076, one weekend AutoCAD class | P, Y, N | X, N, N | N | The same question |
| fu-068, "Yes, 7+ years" against shorter role dates | P, Y, N | P, Y, N | X | The rule says time must fit the role dates, and the engine says Not supported. Both labelers gave P. **Should a time claim that dates contradict be Possible or Not supported?** |
| fu-102, arranged an exterminator, sets traps himself | X, Y, Y | X, N, N | N | You say the answer alone shows he doesn't meet it, yet with the reply he personally did it. **Does setting traps count as pest control treatment?** |
| fu-116, logs appeal forms, appraisers do the review | P, N, N | X, N, N | P | Possible for related own work, though he didn't do it. That's consistent with your earlier rule that related work is Possible. The engine agrees with you. Listed only because the agent disagrees |
| fu-094, salon assistant, enrolled in school | N, N, N | X, N, N | N | You say nothing settles it; the agent says Not supported. The engine agrees with you |

### 7. By design: Not enough information where you said Not supported

There are 10 of these: negated, delegated, observed, credential, and injection cases. The engine says Not supported only for an explicit No from the person or the profile. That's conservative and safe, and the only cost is less informative results. **I don't propose changing it.**

## Proposed fixes, smallest and safest first

None of these is implemented. Each narrows what counts or fixes a specific wrong refusal, and none widens what the model may do.

| # | Fix | Fixes | Risk |
|---|---|---|---|
| 1 | **Walk-backs:** any later sentence opening with "Well,", "Actually,", "I mean,", "To be honest,", "Honestly,", or "In reality," after a claim removes credit from the whole answer or reply, whoever its subject is | fu-084, fu-120 (false Supported); fu-059, fu-103; reply fu-054 | Some honest answers use "Actually" for detail ("Actually, I also…"). They'd go unresolved, not wrong |
| 2 | **Handed-off work:** a sentence that gives the asked work to someone else by pronoun or contract removes credit from the rest of that answer ("Finance handles that", "That's all under contract with…") | fu-063, fu-079 | An answer about partial own work beside a hand-off loses its Possible |
| 3 | **More ownership verbs:** arranging or scheduling others' work counts as overseeing ("arranged a visit from", "scheduled the drivers", "run four crews") | fu-099; stops the fu-102 question | Low |
| 4 | **Negation scope:** a negative counts only in sentences about the person, so "Health inspector has never…" and "…so none get missed" no longer reject | fu-055, fu-065 | Low. A person's own negative still counts |
| 5 | **"I'm the one…":** read as doing the work, when an action follows | fu-100 | Low |
| 6 | **Reply reader:** "I mean" isn't a verb, "so that counts" is a claim, and "one session", "that one class", or "lunch and learn" is a brief try | fu-054, fu-057 replies | Low |
| 7 | **The two false refusals:** narrow the list check so a sentence with a verb and a comma-separated list isn't a keyword dump, and diagnose fu-075's instruction match | fu-060, fu-075 | Must keep refusing real keyword dumps. Existing tests cover those |

**Not proposed for now:**
- **fu-058, rules Possible from a supervisory title.** An answer saying "They do the rough-ins" can't lower the rules' own Possible, by design, since only the person's own No can. Changing that would let an answer move a verdict down without a denial. I'd raise it as a design question.
- **English-only reading** stays as your policy.

**How I'd test the fixes:** compare all verdicts with the current baseline, and regression-test these exact cases. Then measure on a **new** blind split, because this one is now fully opened and spent.

## Decisions for you

1. Which of fixes 1–7 to implement. I'd do all seven together, as one small, safety-first round.
2. The four questions in section 6: brief tries, a time claim the dates contradict, setting traps, and fu-116.
3. Whether to commission a new blind split, with your labels on part of it, before any further claims.
