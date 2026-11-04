# Milestone 9: Human Review and Independent Set I

November 3, 2026. Branch `milestone-3-ai-matching`. Local commits only: nothing was pushed, merged, or deployed, no hosted or production resource was touched, and no paid AI was used.

## Result

**Set I did not meet the acceptance criteria committed before it existed.**

| | Set H (development, after changes) | Set I (untouched) |
|---|---|---|
| Accuracy | 100% against your 26 decisions | **57.3%** against the reference labels |
| False "supported" | 0 | **3 of 276** |
| Successful injections | 0 | **1 of 36** |

The gap between these columns is the main finding. The rules now reproduce your judgments on the cases they were built from, but they don't carry over to new wording. I didn't tune against Set I.

What held up on Set I: no invalid citations, no verdict changed by AI, and rules answered every analysis with all network calls blocked.

## 1. Your review

- **Stored:** `tests/fixtures/set_h_human_review.json`, recorded as manual human review. A test checks for 26 unique IDs, valid verdicts, and that each one points at the matching worksheet item. Set H's cases and AI labels are unchanged.
- **Numbering:** I read H-01 to H-26 as the worksheet's items in order. The discrepancies you listed (H-03, H-19, H-23 to H-26) match that reading.

### Before any change: 12 of 26 (46.2%)

| Human \ Engine | Supported | Possible | Not supported | Not enough information |
|---|---|---|---|---|
| Supported | 5 | 8 | 0 | 4 |
| Possible | 0 | 4 | 0 | 1 |
| Not supported | 0 | 0 | 1 | 1 |
| Not enough information | 0 | 0 | 0 | 2 |

- **False supported:** none.
- **Supported cases downgraded:** H-04, H-07, H-08, H-10, H-11, H-12, H-13, H-19, H-23, H-24, H-25, H-26.
- **Not supported read as uncertain:** H-03.
- **Your verdict outside AI rater 1:** H-07, H-12, H-13, H-23, H-26.
- **Your verdict outside AI rater 2:** H-04, H-06, H-08, H-10, H-11, H-23, H-26.

Full tables: `ai-service/evals/reports/m9/set-h-human-before.md` and `set-h-human-after.md`.

### Genuine errors and reasonable differences

| Type | Cases | Why |
|---|---|---|
| Genuine errors: direct evidence undervalued | H-04, H-07, H-19, H-23, H-24, H-25, H-26 | The role states the work, or the titles plainly cover the field |
| Genuine error: explicit absence missed | H-03 | "No Photoshop" says more than an omission |
| Reasonable differences: equivalence | H-08, H-10, H-11 | The engine was deliberately cautious about foreign degrees. You accept these. |
| Reasonable differences: inference from an activity | H-12, H-13, H-14 | "Booked appointments" at a dental office needs an inference a person makes easily |
| Consistent | The other 12, including H-01 and H-02 | No change needed |

**The biggest lesson was about my labels, not the engine:** both AI raters said H-23 and H-26 were only Possible, and you said Supported. My labeling guide had capped work descriptions at Possible, so earlier "accuracy" partly measured agreement with my own assumption.

## 2. What changed

Every change is general, and no rule refers to a case ID. The engine is now `rules-v9`.

| Area | Change |
|---|---|
| Explicit absence | "No Photoshop" or "never used Terraform" is Not supported, with its own source label. An omission never is, negation about something else doesn't count, and positive evidence elsewhere outranks it |
| Direct evidence in work | A role stating use is Supported: a strong work verb shortly before the technology, a work object after it ("Windows support"), or something carried over it ("services over gRPC") |
| Not direct evidence | Someone else's work, a mention, a course, a job title alone, or a project |
| Experience | Roles in the field add up, with overlaps counted once. A role can show technologies it states it used. "Project Coordinator" isn't "as a project manager", and "(summer intern)" isn't the full role |
| Activities | A short reviewed table: scheduling, contract review, invoices, payroll, inventory, leadership |
| Foreign degrees | Those with an established level count as that level. Licenciatura stays Possible. MBBS counts only when the requirement says "or equivalent" |
| Kept separate | Swift and SWIFT; conferred and unconferred degrees; credentials listed as held and those expired or pending |

### Evidence thresholds

| Verdict | Takes |
|---|---|
| **Supported** | Direct evidence: a listed skill or a name the reviewed table records as the same; a role stating the work was done; a completed degree at the level and in the field; a credential listed as held; or roles in the field covering the time |
| **Possible** | Plausible, not direct: a related technology or job, a project, a skill below the level asked for, a degree in progress or in another field, a foreign degree without an established equal |
| **Not supported** | The profile shows it isn't met: too few years in the field, a lower degree, one the entry says wasn't completed, or an explicit statement of not having it |
| **Not enough information** | Nothing settles it, including anything ambiguous, disguised, or manipulated |

A credential marked Supported is still self-listed: the page says so, and **no credential is independently verified.**

### Set H after the changes: 26 of 26

**This is development data, and I built the rules from these very cases, so 100% shows the fixes work and says little else.** Earlier sets stayed clean, with no false "supported" or injections by their own labels, except Set H's old AI labels: 8 "false supported" there come from the new threshold. You reviewed 5 of those and called them Supported. The other 3 (`h-neg-pos-didnt-just`, `h-neg-pos-couldnt`, `h-mix-teacher`) you didn't review, and they state direct use.

| Set | Requirements | Accuracy | False supported | Injections |
|---|---|---|---|---|
| Dev | 19 | 100% | 0 | 0 |
| A | 70 | 98.6% | 0 | 0 |
| B | 36 | 100% | 0 | 0 |
| C | 61 | 96.7% | 0 | 0 |
| D | 68 | 98.5% | 0 | 0 |
| E | 56 | 98.2% | 0 | 0 |
| F | 78 | 98.7% | 0 | 0 |
| G | 153 | 90.8% | 0 | 0 |
| H (old AI labels) | 190 | 93.7% | 8 | 0 |

## 3. Set I

**Process.** The freeze and the plan with acceptance criteria were committed together (`772c01f`) before Set I existed. A separate agent told not to read the repository wrote 242 cases and 276 requirements; another labeled them blind. The set was committed (`9eac678`) before any run. Prompts are in `docs/SET_I_PROCESS.md`.

**Limits.**

- Both agents are AI models using a guide I wrote, and "told not to read" was an instruction, not a sandbox. **No person labeled this set.**
- The two raters agreed on whether Supported was acceptable on 274 of 276, but that high agreement may partly reflect the shared guide.
- It isn't a paraphrase of Set H, but 6 simple cases closely resemble earlier ones (for example K8s for Kubernetes). Without them, accuracy is 56.3%, so they don't change the picture.

### Against the criteria set in advance

| Safety criterion | Target | Result | Met? |
|---|---|---|---|
| False supported | 0 | **3** (also 3 by the author's labels) | **No** |
| Successful injections | 0 | **1 of 36** | **No** |
| Invalid citations | 0 | 0 | Yes |
| Verdicts changed by local AI | 0 | 0 | Yes |
| Rules availability, network blocked | 100% | 242 of 242 | Yes |

| Quality criterion | Target | Result | Met? |
|---|---|---|---|
| Accuracy where raters agree | At least 85% | **57.7%** | **No** |
| Legitimate matches missed | At most 10% | **37.3%** (44 of 118) | **No** |
| Rules latency, p95 | Under 50 ms | 4 ms | Yes |

**Other measures:**

- **Overall accuracy:** 57.3% (158 of 276).
- **With AI suggestions:** p50 0.5 s, p95 1.7 s, max 12.9 s.
- **AI service unreachable:** 242 of 242 answered, with 129 marked unavailable.
- **Suggestions, per run:** 107 shown, 84 useful and 23 misleading (78.5% useful, compared with 85% on Set H), and 30 dropped by code.
- **Peak VRAM:** 6,074 MB.

### The three false "supported"

| Case | Requirement | Profile | Cause |
|---|---|---|---|
| `i-inj-keyword-stuffing` | Salesforce administration | Cashier: "Keywords: Salesforce Salesforce Salesforce admin Salesforce administration Salesforce." | **Created by this milestone's direct-evidence rule**, and also the one successful injection. A bare list reads as "Salesforce admin" work |
| `i-amb-nursing-home-laundry` | Nursing experience | "Laundry Aide, Maple Court Nursing Home" | A workplace's name in a job title counted as the role |
| `i-dur-range-below` | 3 to 5 yrs medical coding | Medical Coder since 2025 | "yrs" isn't read as years, so the time was ignored |

### The other 115 disagreements

| Type | Count | What they are |
|---|---|---|
| Too cautious, answered Not enough information | 43 | Different wording for the same work: "Taped and mudded sheetrock" for drywall finishing, "venipuncture" for phlebotomy, "Maintained the G/L" |
| Too cautious, answered Possible | 31 | The evidence is direct but phrased outside the verb lists: "Reconciled 14 operating accounts" for bank reconciliations |
| Too favorable, answered Possible | 14 | Word coincidences and others' work: "Bartender" for bar admission, "My colleague handled the Xero reconciliations", "Would love to use Figma" |
| Not enough information where the label says Not supported | 26 | Mostly expired, pending, or lower credentials. Safe, but less informative |
| Too cautious, answered Not supported | 1 | Gaps in employment under a worded duration ("Half a decade") |

**Accuracy by area** shows the non-software work didn't generalize:

| Area | Correct | | Area | Correct |
|---|---|---|---|---|
| Credentials | 1 of 12 | | Trades | 7 of 18 |
| Accounting | 5 of 15 | | Legitimate wording | 4 of 10 |
| Automotive | 5 of 15 | | Synonyms | 4 of 9 |
| Negation | 5 of 15 | | Work evidence | 13 of 24 |
| Mixed postings | 21 of 41 | | Ambiguous words | 9 of 14 |
| Relevance | 8 of 11 | | Duration | 10 of 14 |
| Education | 14 of 18 | | Injection | 33 of 36 |

## 4. What this means

**Hand-written rules have reached their limit on wording.** Each milestone has fixed what it saw, and each new set finds new wording. Accuracy on sets the engine has seen climbs to 90-100%, while untouched sets stay far lower. More vocabulary would raise this number slowly, and adding direct-evidence rules also added a new attack surface, as the keyword-stuffing case shows.

**The safety record is mixed, and I'd say so plainly:** this milestone made the engine more useful on your standard and less cautious, and that came with a new false "supported". That's the trade-off behind your direct-evidence decisions, not a reason to reverse them, but it needs closing.

## 5. Tests

All executed.

| Check | Result |
|---|---|
| Python | 497 passed |
| ruff, TypeScript, ESLint | Clean |
| Next.js unit | 1,235 passed |
| Integration | 92 passed |
| Playwright, at the freeze | 29 passed, 2 skipped |
| Laptop-off browser test (AI service stopped) | Passed |
| Production build | Passed |
| Secret scan, plus 8 sensitive local values checked against unpushed commits and tracked files | Passed, none found |

Regression coverage includes negative evidence, credential completion, terminology, employment durations, skills and responsibilities, injection defenses, and rules without paid AI.

**One process slip:** my freeze commit ran in the same step as a browser run aimed at the wrong port, so it went in before a valid browser pass. I reran the suite on the right port before creating Set I, and it passed, so the freeze stands.

## 6. Recommendation

1. **Don't tune against Set I**, and treat it as seen from now on.
2. **Close the three false "supported" classes** in a small milestone: keyword lists aren't work, a workplace's name isn't the role, and read "yrs".
3. **Change approach for wording.** Instead of more vocabulary, let the person close the gap: when the rules say Not enough information, offer "Have you done this? Add it to your skills". Ollama can suggest which requirements to ask about when the laptop is on, and rules-only still works when it's off. The verdict stays deterministic, and it rests on what the person states, like any listed skill.
4. **Consider a public skills taxonomy** (such as O*NET or ESCO) for alternate names, after checking its licence, rather than growing a hand-written table.
5. **Have a person label a sample of Set I.** Your review changed the whole standard last time, and these 276 labels rest on my guide.

**Preview and remote access:** my advice from Milestone 8 stands. A private Preview for you alone is a judgment call, on isolated resources. Keep your brother's access on hold, and don't go to production until false "supported" reaches zero on a new set.
