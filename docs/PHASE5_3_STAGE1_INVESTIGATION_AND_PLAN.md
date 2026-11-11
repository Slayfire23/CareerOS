# Phase 5.3: Qualification Evidence and Safety — Stage 1 Investigation and Plan

November 6, 2026. **Investigation and baseline only. The matching engine hasn't changed.**

## Baseline of engine-derived credit

`tests/eval/engine-basis.eval.ts` records every engine verdict with its **basis** (why it was given) and the **role titles and quotes** it cites. It writes `ai-service/evals/reports/m11/engine/engine-basis-v18.json`.

- **2,121 requirements in all:**
  - the 1,251 spent ones;
  - Sets I and J, as regression data only;
  - the three follow-up splits, where the engine sees only the title and its months.
- **Never Set K.**
- **rules-v16, rules-v17 and rules-v18 engine verdicts are identical**, so this baseline stands for all three.

**175 credits come from titles or dates:**

| Basis | Supported | Possible |
|---|---|---|
| Employment dates (a role naming the field covers the time) | 58 | 41 |
| Role title or description (the title names the field, or shares a term) | 8 | 68 |

## What's wrong with title and date credit

Each credit was scored against the labels: the allowed verdicts in the held-out sets, or the label in the follow-up splits. **22 credits go above what the label allows.** None of them come from dates alone.

| Cause | Count | Examples |
|---|---|---|
| **A leader title credited for an operational task** | 5 | Plumbing Foreman → hands-on plumbing; Site Foreman → hands-on tile setting; Sanitation Supervisor → sanitation of equipment; Food Service Manager → preparing food; Safety Coordinator → conducting training |
| **A helper title credited for the trade it helps** | 1 | Electrician's Helper → **Supported** for installing wiring (fw-008) |
| **A word collision in a role description** | 9 | Dentist "bridges" → designing highway bridges; Pest Control Technician "bug" → bug tracking; Car Detailer "gun" → spray-gun refinishing; Energy Auditor → financial audits; Landscaper "crane" → tower crane; a Software Engineer's "guest" → hotel check-in; Food Service Worker "imaging"; a cashier's "motores" |
| **A workplace in the title read as the occupation** | 2 | "Cashier, Bellwood Pharmacy" → pharmacy technician; "Recepcionista en hospital pediátrico" → pediatric nursing |
| **An assisting role not recognized as one** | 2 | Scrub Technician → performing laparoscopic surgery; Office Runner → preparing corporate tax returns |
| **An injection in a description** | 1 | A Retail Associate's description saying "GMP pharmaceutical plant" |
| **Only the answer shows it** | 2 | Pharmacy Technician → ordering inventory, when the answer says Gloria orders (fw-082); Dental Receptionist → **Supported** from 30 months of dates (fw-083). The label judged the answer alone, and the dates do cover it, so I'd call this a labeling difference |

**36 helper and leader credits are correct and must stay.** In each, the requirement is general field experience or leadership itself:
- Warehouse Associate → warehouse experience;
- Retail Associate → retail;
- Dental Assistant → dental assisting;
- Team Lead → leading teams;
- Warehouse Supervisor → warehouse operations, or supervising crews;
- Kitchen Manager → costing menus;
- Volunteer Coordinator → coordinating volunteer schedules.

### Checked by simulation, not by changing code

I simulated the proposed rule over the baseline: an operational task gets no title credit from a leader title, and at most Possible from a helper title.
- **It fixes 6 of the 22:** fu-058, fw-008, fw-037, fw-063, fw-078 and the Site Foreman case.
- **It loses no credit that any label allows.** All 36 correct leader and helper credits are kept.

## Implementation plan (after your approval)

### Stage 0 — a fresh sealed split, before any engine change

About 120 scenarios, from one agent that never sees the repo, labeled by a second agent. Both are committed unread.

- **New this time:** each scenario has a role title and dates, and some have a role description. The labeler judges the whole entry (title, dates, description, answer and reply) under your six rules. That way, engine credit from titles is scored too.
- **The mix:**
  - helper, leader and doer titles;
  - field, leadership and operational-task requirements;
  - workplace-in-title cases;
  - ambiguous description words;
  - answers and replies of every kind from the last split.
- **A sealed rules-v18 baseline** gets recorded before any change.

### Stage 1 — title and date credit (rules-v19, engine change)

1. **What the requirement asks for:**
   - *leadership or management* (lead, manage, supervise, coordinate, schedule, hire, budget, cost, plan, purchase, administer, team, crews);
   - *assisting*;
   - an *operational task* (it opens with a doing verb such as install, repair, operate, prepare, perform, conduct, clean or set, or says "hands-on");
   - *field or time* ("warehouse experience", "3 years in retail", "hotel management").
2. **The role level of the title:**
   - *leader*: supervisor, manager, foreman, superintendent, coordinator, director, lead, head, chief;
   - *helper*: helper, apprentice, aide, trainee, runner, porter, assistant, scrub tech;
   - *doer*: everything else.
3. **The rule.** For an operational task, a leader title gives no title credit, and a code-chosen follow-up asks whether they did it themselves. A helper title gives Possible at most. Everything else is unchanged:
   - field, time and leadership requirements;
   - credit from doer titles;
   - credit from dates.
4. **Workplace in the title.** A workplace ("Cashier, Bellwood Pharmacy") is a lead only for a *setting* requirement ("pharmacy experience"). It isn't for a *role* requirement ("pharmacy technician experience").
5. **Not in Stage 1:** the 9 description word collisions are about word sense, not titles. I'd leave them to the parser work (Stage 3) or a later sense table, and keep them as known failures with tests.
6. **A decision for you:** may an answer *remove* credit that came only from a title? Today answers can only raise a verdict. When an answer says someone else does the work (fw-082) or that the person only supervises it, the title-based Possible stays. There's a precedent: a "No, I don't have this" answer already lowers a verdict. I'd let a confirmed answer that gives the requirement's work to someone else lower a title-only Possible to "not enough information", never to Not supported.

**The tests:** every one of the 22 cases is pinned, along with the 36 to keep and variants for each title level.

**Engine changes are expected only on the listed cases.** The engine comparison will list every change, and anything outside these cases will be investigated before commit.

### Stage 2 — follow-up validation

1. **Supervision or a request in the answer.** When the answer showed supervision, delegation, observation or requesting, a reply counts only if it describes the person doing the asked work itself, specifically: what, on what, and how much or how often. That now applies to *every* question, not only code-chosen ones. A correction stays possible: a reply that says what changed and gives those specifics can still reach Possible.
2. **The same standards as answers.** The reply reader will use the answer reader's ownership, mixed-ownership and correction logic, instead of its own lighter checks.
3. **Known gaps fixed:**
   - the contradiction check missing short verbs ("owns") and verbs beyond its six-word window (fw-004);
   - implied hand-offs ("hand out the work orders to the two techs", fw-001);
   - the mixed-sentence rule firing on an input ("My manager sends the photo and I build it", fw-105).
4. **Tests:** every unsafe reply identified so far (fv-007, fv-042, fv-046, fv-073, fv-088, fw-001, fw-004, fv-025, fv-034), plus variants.

### Stage 3 — offline parser investigation (no dependency installed)

These would run in Next.js, so the rules keep working with the laptop off:

| Candidate | Type | What it gives | Notes |
|---|---|---|---|
| **wink-nlp** with its English lite model | JavaScript, MIT | Part-of-speech tags, sentence and token boundaries, negation | Offline, about 1 MB model, fast. No dependency parse |
| **compromise** | JavaScript, MIT | A rule-based tagger with verb and noun phrases, tenses, and some passive detection | Offline, small. Lower accuracy on unusual text |
| **UDPipe 2** via WebAssembly | C++, MPL | Full dependency parse (subject, object, passive) | Heavier models (~20–50 MB) and a maintenance cost |

For comparison only, outside the app: **spaCy** (Python, MIT, dependency parse). The rules engine has to stay in TypeScript, so spaCy could only run in `ai-service`, and that would bring back the service dependency for verdicts.

**The plan:** a proof of concept *outside the project*, in a scratch folder. It would run each candidate on every answer and reply in the opened splits, about 400 texts, and measure:
- subject and verb found correctly;
- passives, multiple actors, negation and corrections;
- speed;
- licenses and how actively each is maintained.

That needs downloading the packages from npm into the scratch folder. **I'll ask before downloading,** with each package's name, version and size. I'll recommend one only if it beats the current heuristics on these cases.

### Stage 4 — the 42 equivalence groups

I'll update `docs/EQUIVALENCE_REVIEW_PACKET.md` so that each group shows:
- the exact phrasings it would accept;
- examples it would *not* accept, including intro classes, supervision and brief exposure;
- the cases from the opened splits it would change.

You approve each group one by one. Nothing is approved automatically.

### Validation, as before

- Every stage is committed separately.
- After each stage: unit, integration, engine-basis and reading comparisons.
- The full suite runs at the freeze, including the browser suites with flags off and on.
- The new split is unsealed once, after the freeze.
- Reported separately: false Supported, unsafe Possible, unsupported replies accepted, legitimate recognition, and engine changes.
- All local, flags off.

## Decisions needed

1. Approve the Stage 1 rule: no title credit from a leader title for an operational task; Possible at most from a helper title; and the workplace-in-title change.
2. May a confirmed answer lower credit that came only from a title (to "not enough information")?
3. Approve creating the fresh sealed split (Stage 0) now, before any engine change.
