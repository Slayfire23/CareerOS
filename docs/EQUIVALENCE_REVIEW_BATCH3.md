# Equivalence review — Batch 3: trades and automotive

**Owner decisions recorded 2026-11-10 (see the end of this packet).** Eleven source-checked groups. Vehicle pre-trip checks and shop nonconformance reports are included here; forklift operation is reserved for logistics. Batch 2 decisions are separate.

## Method

> **Correction (2026-11-10).** The first version of this packet called four historical answers "unlabeled". They are not: m11_review stores labels as `truly_qualified` / `acceptable_after`, which the packet's harness did not read. All four (routine vehicle maintenance, ductwork, conduit, non-conformance) are labeled qualified with Supported the acceptable reading, so each candidate's drop from Possible to Not enough information is a labeled loss, not a removed unproven promotion. The rows below are corrected in place.

Each group was simulated independently in memory using the unchanged TypeScript production `readAnswer`, a Skills/Required request, and three readings: current / approved as written / proposed revision or rejection. Revisions use only the exact candidate descriptions listed, no verb–object patterns, original asks and related-only entries except where explicitly narrowed. A simulated rejection excludes the group entirely, including its leads. All 1,266 previously opened historical verdicts matched the saved post-Batch-1 snapshot before simulation. No sealed data, model calls, production writes or baseline rewrites.

**S** = Supported (self-reported); **P** = Possible; **I** = insufficient information; **G** = gap. Negative probes must not reach S. A P can still be misleading. Exact phrases match within statements; they do not validate credentials or establish who did every part of a compound task.

## Drywall finishing — revise

`drywallfinishing`: Hanging board is not finishing.

- Requirement names: `drywall finishing`
- Existing exact descriptions: `taped and mudded`, `taped joints`, `taped drywall joints`, `applied joint compound`, `sanded and finished drywall`
- Existing verbs → objects: `tape`, `tapes`, `taped`, `mud`, `muds`, `mudded`, `sand`, `sands`, `sanded`, `finish`, `finishes`, `finished` → `drywall`, `sheetrock`
- Related only: `hung drywall`, `hung sheetrock`
- Source recorded in table: O*NET 31.0 task statement, 47-2082.00 Tapers
- Candidate exact descriptions: `taped drywall joints`, `sanded and finished drywall`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I taped drywall joints on apartment walls every week. | P / S / S |
| Must not establish full requirement | I taped joints on shipping cartons before dispatch. | P / S / I |
| Must not establish full requirement | I hung drywall while the finishing crew taped the seams. | P / P / P |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. Neither targeted negative reaches Supported under the candidate.

## Brake repair — revise

`brakerepair`: Ordering or relabeling parts is not repairing brakes.

- Requirement names: `brake repair`, `brake system repair`, `brake service`
- Existing exact descriptions: `replaced brake pads`, `replaced brake rotors`, `changed brake pads`, `relined brakes`, `repaired brakes`, `rebuilt brake calipers`
- Existing verbs → objects: `replace`, `replaces`, `replaced`, `change`, `changes`, `changed`, `repair`, `repairs`, `repaired`, `rebuild`, `rebuilds`, `rebuilt`, `reline`, `relines`, `relined` → `brake pads`, `brake rotors`, `brakes`, `brake calipers`
- Related only: `ordered brake parts`
- Source recorded in table: O*NET 31.0 task statement, 49-3023.00 Automotive Service Technicians and Mechanics
- Candidate exact descriptions: `replaced brake pads`, `replaced brake rotors`, `rebuilt brake calipers`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I rebuilt brake calipers on customer vehicles. | P / S / S |
| Must not establish full requirement | I replaced the shelf labels for brake pads in our parts warehouse. | P / S / I |
| Must not establish full requirement | I ordered brake parts and the mechanic installed them. | P / P / P |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. Neither targeted negative reaches Supported under the candidate.

## Oil changes — revise

`oilchanges`: Specify an engine; genuine but underspecified service may be missed.

- Requirement names: `oil changes`, `lube service`
- Existing exact descriptions: `changed oil`, `changed the oil`, `did oil changes`, `performed oil changes`
- Existing verbs → objects: `change`, `changes`, `changed`, `drain`, `drains`, `drained` → `oil`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 49-3023.00 Automotive Service Technicians and Mechanics
- Candidate exact descriptions: `changed engine oil`, `changed the engine oil`, `performed engine oil changes`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I changed the engine oil on delivery vans every week. | S / S / S |
| Must not establish full requirement | I changed the oil in restaurant deep fryers each night. | S / S / S |
| Must not establish full requirement | I drained cooking oil after each weekend shift. | P / S / P |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/P; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. **Hold: 1 targeted negative(s) still reach Supported. Do not activate.**

## Wheel alignment — revise

`wheelalignment`: Exact descriptions alone can pick up graphics and displays.

- Requirement names: `wheel alignment`, `wheel alignments`
- Existing exact descriptions: `aligned wheels`, `did alignments`, `performed alignments`
- Existing verbs → objects: none → none
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 49-3023.00 Automotive Service Technicians and Mechanics
- Candidate exact descriptions: `performed wheel alignments`, `aligned vehicle wheels`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I performed wheel alignments on customer cars using a calibrated rack. | I / I / S |
| Must not establish full requirement | I performed alignments on graphics for a print catalogue. | P / S / I |
| Must not establish full requirement | I aligned wheels on display racks for photos. | P / S / I |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. Neither targeted negative reaches Supported under the candidate.

## Pipefitting — revise

`pipefitting`: Installing inventory software or insulation is not fitting pipe.

- Requirement names: `pipefitting`, `pipe fitting`
- Existing exact descriptions: `threaded pipe`, `cut and threaded pipe`, `fitted pipe`, `installed process piping`
- Existing verbs → objects: `thread`, `threads`, `threaded`, `fit`, `fits`, `fitted`, `install`, `installs`, `installed` → `pipe`, `piping`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 47-2152.00 Plumbers, Pipefitters, and Steamfitters
- Candidate exact descriptions: `cut and threaded pipe`, `installed process piping`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I cut and threaded pipe for the new boiler plant. | P / S / S |
| Must not establish full requirement | I installed software for pipe inventory on warehouse tablets. | P / S / I |
| Must not establish full requirement | I fitted pipe insulation sleeves over existing plumbing. | P / S / I |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. Neither targeted negative reaches Supported under the candidate.

## Routine vehicle maintenance — revise

`vehiclemaintenance`: A supply noun or moving tires is not vehicle servicing.

- Requirement names: `routine vehicle maintenance`, `vehicle maintenance`, `preventive maintenance on vehicles`
- Existing exact descriptions: `oil and filter`
- Existing verbs → objects: `rotate`, `rotates`, `rotated`, `replace`, `replaces`, `replaced`, `swap`, `swaps`, `swapped` → `tires`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 49-3023.00 Automotive Service Technicians and Mechanics
- Candidate exact descriptions: `performed scheduled maintenance on fleet vehicles`, `serviced fleet vehicles`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I performed scheduled maintenance on fleet vehicles at our depot. | P / P / S |
| Must not establish full requirement | I replaced price labels on tires in the showroom. | P / S / I |
| Must not establish full requirement | I stocked oil and filter kits in our parts warehouse. | I / I / I |

**Historical changes:** 

- m11_review/train · Performing routine vehicle maintenance · “All day I drain and refill oil, swap filters, rotate tires, and top off fluids on customers' cars.” · P / S / I · **labeled qualified** (truly_qualified, acceptable_after: supported).

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. 1 historical as-written promotion(s) not retained (see rows above; **corrected: these answers are labeled qualified, so the candidate is a labeled loss from Possible to Not enough information**). Neither targeted negative reaches Supported under the candidate.

## Pre-trip inspections — revise

`pretrip`: A cosmetic inspection or walk-around does not establish a pre-trip safety check. Remove the umbrella ask “vehicle inspections”.

- Requirement names: `pre-trip inspections`, `pre trip inspections`, `completing pre-trip inspections`, `vehicle inspections`
- Existing exact descriptions: `inspected the truck`, `inspected my truck`, `walked around the rig`
- Existing verbs → objects: `inspect`, `inspects`, `inspected`, `check`, `checks`, `checked` → `the truck`, `my truck`, `the rig`, `the trailer`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 53-3032.00 Heavy and Tractor-Trailer Truck Drivers
- Candidate exact descriptions: `performed pre-trip vehicle inspections`, `completed pre-trip safety inspections`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I completed pre-trip safety inspections before driving the school bus. | S / S / S |
| Must not establish full requirement | I walked around the rig to take advertising photos. | P / S / I |
| Must not establish full requirement | I inspected the truck for cosmetic damage for an auction listing. | P / S / I |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. Neither targeted negative reaches Supported under the candidate.

## Ductwork installation — revise

`ductwork`: Inspecting, labeling and cleaning existing ducts do not establish installation.

- Requirement names: `ductwork installation`, `installing ductwork`, `installing residential ductwork`, `duct installation`
- Existing exact descriptions: `installed ductwork`, `hung ductwork`, `ran ductwork`
- Existing verbs → objects: `hang`, `hangs`, `hung`, `install`, `installs`, `installed`, `run`, `runs`, `ran` → `ductwork`, `ducts`, `duct`, `sheet metal trunks`, `flex runs`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 47-2211.00 Sheet Metal Workers
- Candidate exact descriptions: `installed ductwork`, `hung ductwork`, `installed sheet metal trunks`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I hung ductwork and sealed the seams in new homes. | P / S / S |
| Must not establish full requirement | I installed price tags on ductwork at the supply store. | P / S / P |
| Must not establish full requirement | I ran a camera through existing ducts to inspect them. | P / S / I |

**Historical changes:** 

- m11_review/train · Installing residential ductwork · “I hang sheet metal trunks and flex runs in attics, seal the joints with mastic, and cut in the registers on new houses.” · P / S / I · **labeled qualified** (truly_qualified, acceptable_after: supported).

**Ownership probes** (current / as written / candidate): introductory class P/P/P; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. 1 historical as-written promotion(s) not retained (see rows above; **corrected: these answers are labeled qualified, so the candidate is a labeled loss from Possible to Not enough information**). Neither targeted negative reaches Supported under the candidate.

## Blueprint reading — revise

`blueprintreading`: Drawings can be art rather than technical plans.

- Requirement names: `blueprint reading`, `reading blueprints`, `read blueprints`
- Existing exact descriptions: `read blueprints`, `read drawings`, `worked from blueprints`, `worked from drawings`
- Existing verbs → objects: `read`, `reads`, `follow`, `follows`, `followed` → `blueprints`, `drawings`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 47-2111.00 Electricians
- Candidate exact descriptions: `read blueprints`, `worked from blueprints`, `read construction drawings`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I read construction drawings to lay out framing on site. | P / S / S |
| Must not establish full requirement | I worked from drawings of flowers for greeting cards. | P / S / I |
| Must not establish full requirement | I read drawings at a gallery workshop. | P / S / I |

**Historical changes:** None in either simulation.

**Ownership probes** (current / as written / candidate): introductory class P/P/P; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. No historical as-written Supported gain was lost in this sample. Neither targeted negative reaches Supported under the candidate.

## Conduit bending and installation — reject as submitted

`conduit`: Reject as one group. Bending, installing, and doing both are distinct requirements; do not merge these questions.

- Requirement names: `conduit bending`, `conduit installation`, `conduit bending and installation`
- Existing exact descriptions: `bent conduit`, `ran conduit`, `installed conduit`, `bent emt`, `shaped emt`
- Existing verbs → objects: `bend`, `bends`, `bent`, `run`, `runs`, `ran`, `install`, `installs`, `installed`, `shape`, `shapes`, `shaped` → `conduit`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 47-2111.00 Electricians
- Candidate exact descriptions: none. No group-based credit or question merging.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I bent conduit and installed the runs on commercial jobs. | P / S / P |
| Must not establish full requirement | I installed conduit on site; our fabricator did all the bending. | P / P / P |
| Must not establish full requirement | I shaped EMT with a hand bender in the shop. | P / S / I |

**Historical changes:** 

- m11_review/train · Conduit bending and installation · “I shaped EMT with a hand bender, mostly offsets and saddles, and strapped the runs along block walls between the boxes.” · P / S / I · **labeled qualified** (truly_qualified, acceptable_after: supported).

**Ownership probes** (current / as written / candidate): introductory class P/P/P; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The genuine positive does not reach Supported under this candidate; retain it for recognition review. 1 historical as-written promotion(s) not retained (see rows above; **corrected: these answers are labeled qualified, so the candidate is a labeled loss from Possible to Not enough information**). Neither targeted negative reaches Supported under the candidate.

## Writing non-conformance reports — revise

`nonconformance`: Containment or tagging does not demonstrate writing a quality report.

- Requirement names: `non-conformance reports`, `nonconformance reports`, `writing non-conformance reports`
- Existing exact descriptions: `wrote up defects`, `quarantined parts`, `quarantine the parts`, `documented defects`
- Existing verbs → objects: `tag`, `tags`, `tagged`, `quarantine`, `quarantines`, `quarantined`, `document`, `documents`, `documented` → `defects`, `failed parts`
- Related only: none
- Source recorded in table: O*NET 31.0 task statement, 51-9061.00 Inspectors, Testers, Sorters, Samplers, and Weighers
- Candidate exact descriptions: `wrote nonconformance reports`, `documented nonconformances in quality reports`. Exclude every other existing exact description and all verb–object combinations from this group’s Supported path.

| Expected | Probe | Current / as written / candidate |
|---|---|---|
| Should qualify | I documented nonconformances in quality reports for engineering disposition. | P / P / S |
| Must not establish full requirement | I quarantined parts on the loading dock; the engineers wrote the reports. | P / P / I |
| Must not establish full requirement | I documented defects in my apartment for the landlord. | P / S / I |

**Historical changes:** 

- m11_review/train · Writing non-conformance reports · “When a lot fails, I tag and quarantine the parts, write up what's wrong against the drawing and send the paperwork to engineering for disposition.” · P / S / I · **labeled qualified** (truly_qualified, acceptable_after: supported).

**Ownership probes** (current / as written / candidate): introductory class P/P/I; supervision I/I/I; helping I/I/I; someone else I/I/I; negated I/I/I; hypothetical I/I/I.

**Decision cost:** The positive probe reaches Supported. 1 historical as-written promotion(s) not retained (see rows above; **corrected: these answers are labeled qualified, so the candidate is a labeled loss from Possible to Not enough information**). Neither targeted negative reaches Supported under the candidate.

## Matching-feature release blockers (open)

- **B3-OIL — wrong work domain (base reader).** Restaurant fryer oil changes receive Supported for automotive oil changes today, as written, and with the narrower candidate. Release criterion: the fryer example must not establish automotive oil changes; preserve the delivery-van engine-oil positive.
- **B3-CONDUIT — partial work credited for a compound requirement (group promotion).** Bending EMT in the shop is Possible today, Supported with the group as written, and insufficient with simulated rejection. Release criterion: neither bending alone nor installation alone may establish both. Retain the positive example explicitly describing both tasks. Do not activate or merge the compound group as written.

## Owner decision requested (original request)

For each group, request a different revision, reject, approve specific wording, or leave it unapproved. A surviving false Supported needs investigation even if it comes from the baseline reader. Keep positive misses and unsafe probes as regression cases; verify ownership and question-key behavior before applying any future decision. Do not expand Batch 1 or Batch 2 or change the Stage 4A ownership design as part of this packet.

## Owner decisions — 2026-11-10

| Group | Decision | Implemented |
|---|---|---|
| Drywall finishing | Approve candidate | `taped drywall joints`, `sanded and finished drywall`; no patterns |
| Brake repair | Approve candidate | `replaced brake pads`, `replaced brake rotors`, `rebuilt brake calipers`; no patterns |
| Wheel alignment | Approve candidate | `performed wheel alignments`, `aligned vehicle wheels`; no patterns |
| Pipefitting | Approve candidate | `cut and threaded pipe`, `installed process piping`; no patterns |
| Pre-trip inspections | Approve candidate and remove `vehicle inspections` | `performed pre-trip vehicle inspections`, `completed pre-trip safety inspections`; no patterns; asks without `vehicle inspections` |
| Blueprint reading | Approved, then **held** (owner decision 2026-11-10, after validation) | unchanged from Batch 2, source_checked; the approved candidate produced 8 new false Supported results — see B3-BLUEPRINT |
| Oil changes | Hold | unchanged, source_checked |
| Routine vehicle maintenance | Hold | unchanged, source_checked |
| Conduit bending and installation | Hold; never approve as one group | unchanged, source_checked; investigate separate bending and installation requirements during structured ownership |
| Writing non-conformance reports | Hold | unchanged, source_checked |
| Ductwork installation | Revise and re-simulate with `hang ductwork`, `install ductwork`, `hang sheet metal trunks` | **not activated**; see below |

Five groups are approved. Approved groups keep their original asks (except pre-trip) and related-only entries. Six groups are held: oil changes, routine vehicle maintenance, conduit, non-conformance, ductwork and blueprint reading. Table version answer-equivalences-v4.

## Ductwork re-simulation (2026-11-10)

Simulated against the Batch 3 table with six approvals (before blueprint reading was held); the two groups share no requirement name or phrase.

Candidate: `installed ductwork`, `hung ductwork`, `installed sheet metal trunks`, `hang ductwork`, `install ductwork`, `hang sheet metal trunks`; no patterns; simulated as approved in memory only.

- **Labeled answer recovered.** “I hang sheet metal trunks and flex runs in attics…” moves Possible → Supported (labeled qualified). It is the only historical change in 1,266 answers.
- **New false Supported: 5.** Under the revision these negatives reach Supported (today all Possible):
  - I hang ductwork signs in the showroom.
  - I sell the hangers people use to hang ductwork.
  - I teach apprentices how to hang ductwork.
  - I'll install ductwork once I finish my apprenticeship.
  - I install ductwork insulation wrap on existing ducts.
- Still not Supported: watching videos, hiring a contractor, helping the crew, supervising, someone else, never, could-if-needed, scheduling, a class.

**Result: fails the owner's criterion** (recover the labeled answer without new false Supported). Ductwork stays held and unchanged. Present-tense exact phrases are exposed to the reader's missing checks for teaching, future, purpose (“used to …”) and object-modifier readings (“ductwork signs”); past-tense phrases are not.

## Matching-feature release blocker added 2026-11-10

- **B3-BLUEPRINT — present-tense exact phrase (approved group).** `read blueprints` is spelled the same in present and past, so with the group approved these answers reach Supported (Possible before): “I teach apprentices how to read blueprints.” · “I sell the books people use to read blueprints.” · “I'll read blueprints once I start my apprenticeship.” · “I am learning to read blueprints in night school.” · “I train new hires to read blueprints.” · “I need to learn to read blueprints.” · “I worked from blueprints of my house that the architect explained to me.” · “I read blueprints of famous buildings as a hobby.” The other five approved groups use past-tense-only phrases; their equivalent probes (e.g. “I teach apprentices how to replace brake pads.”) are not Supported. Release criterion: learning, teaching, intending and purpose clauses must not establish the requirement.

  **Owner decision 2026-11-10: hold.** Blueprint reading is reverted to its Batch 2 state (source_checked, original phrases), so it grants no Supported and merges no questions. All eight answers are back to Possible and are kept as regression cases in tests/ai-equivalence-batch3.test.ts. Any future approval needs phrases that cannot be read as present tense, or reader checks for teaching, learning, intention and purpose clauses.

## Validation of the five approved groups (2026-11-10)

Against the Batch 2 commit (20da208): 1,266 historical answers, 0 verdict changes (no gains, no losses); 2,121 engine baseline rows, 0 changes; every packet negative, all 42 ownership probes (35 for the five approved groups, 7 for blueprint reading) and all eight B3-BLUEPRINT cases below Supported; no newly introduced false Supported result (the only false Supported probes are the pre-existing base-reader blockers, including B3-OIL). Evidence: ai-service/evals/reports/m11/equivalence/batch3-*.json.
