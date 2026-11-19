# Phase 5.3: Role-Description Matching and the Equivalence Review — Plan

November 7, 2026. **Plan only.** No engine changes. Nothing approved.

## Part A: credit from role descriptions

### What the baseline shows

These figures come from the engine-basis baseline (2,121 requirements), restricted to credit whose citation quotes the role description rather than the title.

| | Credits | Above their label |
|---|---|---|
| Quoting one or two words of a description | 229 | **60**: 8 Supported, 52 Possible |
| Quoting a longer phrase | 4 | 1 Supported |

The 60 come from three causes:

1. **A word used in another sense:**
   - a dentist's "bridges" → bridge design;
   - a pest technician's "bug" → bug tracking;
   - "bar" → bar admission (twice), "cells" → cell culture, "springs" → Spring Framework, "kernel" → Linux kernel;
   - "unit" → unit tests, "gun" → spray-gun refinishing, "crane", "guest", "cycle", "code", "commercial", "corporate", "customer", "mobile".
2. **A word in a clause that isn't the person doing it:**
   - "didn't just…" → **Tableau, Supported**;
   - "couldn't…" → **Terraform, Supported**;
   - wishing for Figma;
   - sitting next to someone using Tableau;
   - colleagues using SolidWorks;
   - a report about HubSpot;
   - avoiding Oracle for PostgreSQL.
3. **A setting or object, not the work:**
   - "pharmaceutical plant", "laparoscopic" (a scrub technician), "imaging", "engines" (a car salesman);
   - "licensed", "certified", "heights".

The other 169 short-quote credits are correct and must be kept. Most are a technology or task named in the person's own work: "Booked appointments" for scheduling, "Rust" in their own clause.

### The proposed rule (rules-v20, after approval)

A role description gives credit only through **a clause of the person's own**, read by the same boundary as answers (`answerStatements`):
- the person or no stated subject, as a work line;
- concrete, performed, not negated, not hypothetical, not someone else's.

On top of that, **one of these:**
- **a technology or tool that's unambiguous** (a known term not in the ambiguous list);
- **two or more of the requirement's specific words** in that clause;
- **the requirement's exact phrase;**
- **an approved equivalence** (Part B).

**A single ordinary word, alone, is a lead, not credit.** That covers "bridges", "bar", "unit", "pipe" or "customer". The finding stays "Not enough information", and a code-chosen question asks: "Your role description mentions *bridges*. Have you done *design highway bridges* in that job?"

**Unchanged:** title, date and listed-skill credit, and the Stage 1 rules.

### How it's checked before any engine change

1. **Simulate it over the 2,121 baseline, as in Stage 1.** Count the 60 over-credits removed and the 169 correct ones kept. The target: **0 correct Supported lost.** Any correct Possible lost gets listed and justified.
2. **Check it against the ownership benchmark's 80 role descriptions,** which have independent word-sense labels. 13 are "different sense", and rules-v19 credits 7 of them.
3. **Only then implement,** in small commits, with a test for every one of the 60 and the kept credits as regression tests.

**Complexity: medium.** One engine function and the boundary reuse, about 1–2 sessions.

## Part B: the 42 equivalence groups

### Where they stand

`answer_equivalences.json` holds 42 groups. All are **unapproved**, so today a group can only make an answer *related* (Possible). It can never grant Supported, and it can't merge two questions.

Paraphrase misses are the largest share of legitimate experience the reader misses: 124 on the ownership benchmark, and most of the "no shared words" misses on every split.

### The review packet (to prepare, for your decision one group at a time)

`docs/EQUIVALENCE_REVIEW_PACKET.md` gets rebuilt. For each group it shows:

1. **What it covers:** the requirement names it answers ("asks"), and the descriptions and verb–object pairs it accepts. For example, phlebotomy: "drew blood", "venipuncture".
2. **What it would credit, with examples from the opened data.** I simulate the group as approved, with `assumeApproved` in evaluation only, and list every opened answer, reply and benchmark item whose verdict would change, with its label.
3. **What it must not credit:**
   - introductory training ("took a phlebotomy class");
   - supervision ("I schedule the phlebotomists");
   - helping ("I label the tubes for the phlebotomist");
   - brief exposure.

   Each of these is checked against the current boundary, which already stops them before any group is read, and confirmed with a test per group.
4. **Risk flags:** generic words that might over-match ("orders", "cash", "files", "schedule", "claims"), or two senses.
5. **A recommendation:** approve, approve with changes (the exact edit), or reject, with the reason.

**Proposed new groups**, marked "proposed", never active until you approve them. They come from gaps seen in the data:
- **pest-control treatment:** set out traps, bait stations, spray (fu-102);
- **inventory control:** cycle counts, reorder points, variances (fv-012).

Only you can change a group's status to `owner_approved`. Every approval is a separate commit, with the engine-basis and reading comparisons, showing exactly which verdicts change.

**Complexity: medium.** The packet takes 1–2 sessions. Applying your decisions takes 1 session, plus a run of the comparisons.

## Order

1. Part A's simulation, then your approval, then Part A's rules (rules-v20).
2. Part B's packet, then your group-by-group decisions, then the approved groups applied.
3. The structured ownership stages (Stage 4A design), if approved.
4. One freeze, then the sealed `m11_followup4` unsealed once, with the full suite.

The structured-ownership work and Part A touch different code (forms and the answer reader, against the engine's description path). They could run in either order.
