# Phase 5.3 Stage 3: Consistency Checks and Text-Reader Rules (rules-v20)

November 11, 2026. Local commit, not pushed. **Matching is unchanged: it still reads with rules-v19.** rules-v20 is implemented behind an explicit opt-in (`textRules: "v20"`) that only tests and evaluations use. The plan adopts each rule only after its comparison is reported, and labeled losses need owner approval, so switching matching to v20 is a separate owner decision. The O4 word-sense rules were simulated in scratch only and not adopted. Neither sealed split was opened; only the hash guard ran. The Stage 2 split report (docs/PHASE5_3_STAGE2_SPLIT_PROPOSALS.md) is unchanged; its 16 proposed splits and 93 ambiguous cases stay inactive, awaiting decisions.

## What was built

| Part | Where | What it does |
|---|---|---|
| rules-v20 clause rules | `src/lib/ai/evidence-boundary.ts` (the shared boundary), `src/lib/ai/rules/answer-review.ts` | Opt-in rules that read sentence structure (no lists of ambiguous words) |
| Consistency checks | *new* `src/lib/ai/rules/structured-consistency.ts` | `assessConsistency()`: the person's choice compared with their explanation, giving the consistency state the Stage 2 rule table takes. Not connected to any workflow (Stages 5–6) |
| Tests | *new* `tests/ai-rules-v20.test.ts` (53) | Traps and keeps for every rule, labeled regression cases, consistency, end-to-end D1–D3, isolation |
| Evidence | `ai-service/evals/reports/m11/structured/stage3-*.json` | v19/v20 history and probes, the O4 simulation, the Batch 5 re-simulation |

### rules-v20 rules

| Rule | Example | Reading under v20 | Blocker |
|---|---|---|---|
| Teaching or training others to do it | "I teach new hires how to operate a forklift" | `taught`: a lead (Possible) unless the requirement is about training others (O1). "I trained as a welder" is the person's own training, not teaching | B4-TEACH, B3-BLUEPRINT |
| Learning, intending or planning to | "I'm learning to make cold calls", "I'll install ductwork once I finish…", "I hate to make cold calls" | Not done: no statement (Not enough information). "I used to weld every day" stays the person's work | B4-INTENT, B3-BLUEPRINT |
| Others' purpose or instrument | "the books people use to read blueprints", "the chargers used to power the forklifts" | Taken out of what's read; only the person's own act counts | B3-BLUEPRINT |
| Someone else's finished work | "the contracts the attorneys drafted" | Taken out of what's read; it applies only when the doer is a person or group ("the attorneys", "our teachers") | B4-OTHERS |
| Reviewing others' finished work | "I reviewed the lesson plans our teachers prepared" | `oversaw` | B4-OTHERS |
| Paperwork for another party (O2) | "I collect timesheets and send them to the payroll company", "filed the lesson plans for the teachers" | `requested`, unless the requirement is that paperwork ("Filing customs entries"). The party must follow the verb closely | B1, B4-OTHERS |
| Personal context | "for my own guitar practice", "with my own doctors", "for my family vacation" | Exposure only (Possible at most). "My own" counts only as a beneficiary or place, never for business words ("my own clients", "my own small business") | B4-PERSONAL |
| Recognition: paying documents | "I paid vendor invoices for the warehouse" | No longer read as hiring a firm: Supported for accounts payable | B1 recognition |
| Recognition: passing medications | "I passed medications to 20 residents" | Administering (performed), not handing over: Supported | B2 recognition |

### Consistency checks (design §3)

`assessConsistency({ requirement, involvement, explanation })`:

- **No text, a denial, or refused text** (instructions or templates) → `no_text`. **Non-English** → `text_unread`, never read further (D3).
- Otherwise the explanation is read with rules-v20 to find the person's own part: performed, supervised, arranged or paperwork, helped, watched or trained, taught, someone else, or nothing about their part.
- **"Did it myself" or "did some"**:
  - the text shows doing it → `consistent`, with `textShowsWork` true only when v20 would give Supported;
  - anything else (teaching, supervising, paperwork, learning, a class, someone else, nothing about the person) → `text_mismatch`.
- **A lead choice**:
  - matching text → `consistent`;
  - text showing the person doing it → `text_mismatch` suggesting PERFORMED. The rule table keeps the choice's reading and asks.

End to end with the Stage 2 rule table (tested):
- Supported needs a consistent explanation that shows the work.
- A choice alone is Possible and asks for specifics (D1).
- Every contradiction gives no automatic credit and asks (D1).
- Non-English text stays Possible at most, with a note that it wasn't read (D3).

## Results

| Check | Result |
|---|---|
| 1,266 historical answers, v19 → v20 | **1 change, a labeled gain**: "entered the codes doctors picked … never assigned them myself" (does_not_qualify) P → Not enough. **0 labeled losses. 0 new Supported** |
| Ownership benchmark (220 labeled answers) | Identical under v19 and v20 (label "no": 8 credited, 1 Supported; label "yes/partial": 55 credited, 8 Supported) |
| Earlier probes (357: batches 1–4, B1–B4, B3-BLUEPRINT) | **11 distinct false Supported removed**, 0 new false Supported, 0 positives lowered |
| Per-rule probes (35) | All pass: every trap below Supported, every genuine example kept |
| Engine baseline (2,121 rows) | 0 changed |
| Unit / integration | 2,551 / 183 passed; TypeScript, lint and schema checks pass |
| Sealed splits | Hash guard only: 8 of 8 pass; neither split opened or changed |

**Labeled losses during development, now regression cases.** Earlier drafts of these rules lowered 8 genuine, labeled-qualified answers. Each is fixed, and each is now a test that v20 must read it exactly as v19 does:
- banquet event orders;
- an iOS app;
- registered agent filings;
- front-desk staff training;
- teaching math lessons;
- customs entries;
- litigation deadlines;
- same-store sales growth.

### False Supported removed (distinct)

1. Teaching others to do it:
   - "I teach new hires how to operate a forklift"
   - "I teach new reps how to handle customer complaints"
2. Learning or attitude:
   - "I hate to make cold calls"
   - "I'm learning to make cold calls in a sales course"
3. Paperwork, others' work, or reviewing it:
   - "I collect timesheets and send them to the payroll company"
   - "I filed the contracts the attorneys drafted"
   - "I reviewed the lesson plans our teachers prepared"
   - "I printed and filed the lesson plans for the teachers"
4. An instrument for others: "I maintain the chargers used to power the forklifts"
5. Personal context:
   - "I scheduled appointments with my own doctors after surgery"
   - "I planned lessons for my own guitar practice"

All eight B3-BLUEPRINT and ductwork present-tense cases also stay below Supported under v20.

### False Supported still open (word sense; not fixable by clause structure)

- **Domain or sense:**
  - "office holiday party" budget
  - fryer oil
  - parking-permit registration
  - medication disposal
  - medication reimbursement forms
- **Modifier or particle:**
  - "forklift rental counter"
  - "forklift dealership's service desk"
  - "customer complaints data"
  - "reports of resolved customer issues"
  - "picked orders up" (two cases)

These remain release blockers (B1 budget, B2, B3-OIL, B4-MODIFIER).

## O4 word-sense simulation (scratch only, not adopted)

Both candidate rules were applied on top of rules-v20 to the 1,266 historical answers and all probes:

| Rule | Historical Supported lowered | Labeled-qualified lost | Labeled false Supported removed | Probes: false S fixed / positives lowered |
|---|---|---|---|---|
| (a) A requirement word followed by a noun that makes it a modifier, or a separable particle ("picked orders up") | 70 | **62** | 8 | 10 / 15 |
| (b) A targeted question instead of credit when Supported rests only on the requirement's own words | 100 | **90** | 10 | 13 / 19 |

**Recommendation: adopt neither.** Each removes 8–10 false Supported but loses 62–90 labeled-qualified ones. Ordinary objects after a verb ("Tableau dashboards", "water heaters", "air brake chambers") look exactly like modifiers. The structured flow already covers most of these cases more safely:
- An answer with a choice and no matching text can't reach Supported (D1).
- The person states their part directly.

What remains are text-path cases, so these blockers stay open for the release gate.

## Batch 5 re-simulation under rules-v20 (both groups remain held)

| Group | False Supported, v19 → v20 | Labeled historical gains | Remaining blockers |
|---|---|---|---|
| Pest control | 4 → 3 (personal garden removed) | none | Two modifier readings ("pesticides to … invoices", "bait stations orders") and a one-time job-shadow observation |
| Inventory control | 4 → 2 (teaching and learning removed) | 3, all labeled qualified (fv-012, pc-012, an m11_shadow answer) | Two modifier readings ("reorder points reminders", "variances reports") |

Neither group meets the no-new-false-Supported bar. Both stay out of the table; the remaining failures are word sense, which O4 shows can't be fixed without large losses.

## Remaining recognition gaps

- "Kept the books" (bookkeeping) and the bank-reconciliation answer (Batch 1) are unchanged.
- The surgical-dressings wound-care answer (Batch 2) is unchanged.
- The structured flow (stated part plus specific text) is the intended route for these.

## Decisions for the owner

1. **Adopt rules-v20 for matching?** That means switching the default from v19 to v20. The comparison shows 1 labeled gain, 0 labeled losses, 11 false Supported removed, and 0 new ones. Adopting also changes answers already saved, read through the existing text path. *Recommended: yes, as a separate, approved change with its own commit and a full rerun.*
2. **O4:** don't adopt either simulated rule; keep the word-sense blockers open for the release gate. *Recommended.*
3. **Batch 5:** keep pest control and inventory control held. *Recommended.*
4. **The Stage 2 split report:** 16 proposed splits and 93 ambiguous cases await explicit decisions. They are needed before Stage 4's per-part form can use any split.
