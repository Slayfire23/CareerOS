# Phase 5.3: compound requirement split review (decision-ready)

November 11, 2026. **For the owner's decisions. Nothing is approved, activated or changed.**
- The splitter, matching and the Stage 2 report (docs/PHASE5_3_STAGE2_SPLIT_PROPOSALS.md) are unchanged.
- Recommendations below are mine. Each split needs your explicit decision before Stage 4 can use it.

**Owner decisions so far (2026-11-11):**
- **X1** is provisionally approved: reviewed splits apply in the structured questionnaire only, and the free-text matching engine is unchanged.
- **X2** is held. A whole-requirement Supported explanation is *not* assumed to show every part.
- **X3** is approved: mixed and/or requirements stay unsplit for now.
- **X4** is approved: owner-reviewed wording edits are allowed if they preserve the requirement's meaning.
- **Group 1 (P1–P16) was decided on 2026-11-11** (see "Group 1 owner decisions" below):
  - 10 approved for the structured questionnaire: 7 as proposed, 2 with edited wording, 1 with clarification;
  - 6 kept unsplit.
- **Ambiguous batch 1 (A1–A18) was decided on 2026-11-11:** all 18 are kept unsplit, and A1's credential reading is flagged as unresolved.
- **Ambiguous batch 2 (A19–A34) was decided on 2026-11-11:**
  - 8 splits approved with edited wording (A19–A26);
  - 8 kept unsplit (A27–A34).
- **Ambiguous batch 3 (A35–A50) was decided on 2026-11-11:** all 16 are kept unsplit. Five recognition gaps (A40–A43, A47; A73 added later) are recorded in their own follow-up section, separate from split approval.
- **Ambiguous batch 4 (A51–A63) was decided on 2026-11-11:**
  - 11 splits approved (A51–A60, A63);
  - 2 kept unsplit (A61, A62).
- **Ambiguous batch 5 (A64–A75) was decided on 2026-11-11:** A67 approved as a split; the other 11 kept unsplit. A73 was added to the recognition-gap follow-up.
- **Ambiguous batch 6 (A76–A90) was decided on 2026-11-11:** A76 and A77 approved as splits; the other 13 kept unsplit. A78 was added to the recognition gaps, and the A87 possible false-Supported issue was flagged.
- **A91–A93 were decided on 2026-11-11:** A93 approved as a split; A91 and A92 kept unsplit. A92 was added to the recognition gaps.
- **Every one of the 109 cases now has an owner decision** (see the reconciliation below). None of the splits is implemented or active, and no approved-splits list exists.

**Sources.** Only the Stage 2 evidence (`ai-service/evals/reports/m11/structured/stage2-split-proposals.json`) and opened data were used. Neither sealed split (`m11_followup4`, `m11_structured`) was opened. The opened data:
- the engine baseline cases;
- follow-up sets 1–3;
- the 1,266 historical answers.

**Scratch simulation.** This was not a code change. Each requirement was read whole and also per proposed part, using today's rules-v20 readers:
- the engine on the baseline rows;
- the answer reader on every opened answer to that requirement.

The parts were combined the way O3 does: every part Supported gives Supported; some parts give Possible; none gives Not enough information. The simulation never goes above the whole reading. It covers 112 engine rows and 134 answer readings over the 109 texts (the 220-answer benchmark repeats some follow-up answers). Most texts have only 1–2 rows, so the evidence is thin, and the rationale rests mainly on what the requirement means.

## Headline findings

1. **Splitting can lower qualified candidates.** On opened data it lowered 8 correct Supported readings to Possible, and it lowered nothing that was wrong:
   - Answers labeled supported (3):
     - P10, welding and fabrication;
     - A70, prepare and file court documents;
     - A72, prepare and teach daily lessons.
   - Engine rows allowed only Supported (2):
     - A2, Bachelor's in Chemistry, minimum;
     - A8, verify and approve invoices: 3 years.
   - Engine rows where Possible is also allowed (3):
     - A5, litigation paralegal, 3 years;
     - A7, supported Windows and AD users;
     - A49, the DROP TABLE migration item.

   The cause is the same each time. A part re-worded by the splitter ("fabrication of steel structures") is harder to match than the original sentence ("I perform welding and fabrication on structural steel"), or the part is a fragment ("minimum", "3 years").
2. **No opened example shows an unsplit requirement giving Supported for only part of the work.** The partial answers in the data stay at Possible because the whole-text reading needs the requirement's own words:
   - P1, bookkeeping without month-end;
   - P7, scheduling but a coworker does insurance;
   - P6, grant reporting with a partial compliance reading.

   The real value of a split is the form: it asks which parts the person did and names the missing one. The risk of partial Supported without splits exists in principle (title credit, loose wording) but wasn't observed.
3. **Several "parts" are misparses:** fragments, qualifiers, durations, or a part that lost its verb or object. Those should stay whole or be split only with parts you edit.

## Cross-cutting decisions (needed whatever you decide per item)

| # | Decision | Recommendation |
|---|---|---|
| X1 | **Where approved splits apply.** O3 describes per-part checkboxes in the clarification form. Should a split also change the engine's and the free-text reader's reading of the whole requirement? | **The structured form only.** All 8 simulated losses came from re-reading split parts on the text and engine paths, and the form is where a split adds value |
| X2 | **Per-part text in the form.** The Stage 2 rule needs each checked part to have its own specific text for Supported. Should an explanation that reads Supported for the *whole* requirement count as showing every part? | **Yes.** Otherwise "I perform welding and fabrication on structural steel" can't reach Supported once split. Missing parts still cap at Possible, and the D1 limits are unchanged |
| X3 | **"Any of" parts.** "AWS and either Terraform or CloudFormation" and "Python or R, plus SQL" are truly compound but need a part that accepts alternatives, which O3 can't express yet | **Keep both unsplit for now**; revisit only if the form needs it |
| X4 | **Edited parts.** Where the splitter's wording is wrong, may approved parts use your edited wording (stored with the approval)? | **Yes.** Several otherwise-useful splits need it (for example P7 "Handle patient scheduling" → "Patient scheduling") |

## Group 1: the 16 proposed splits

Legend for the data column: S Supported, P Possible, I Not enough information, G Not supported; "split" is the simulated reading after splitting.

| # | Requirement | Proposed parts | Opened data (whole → split; label) | Recommendation | Rationale |
|---|---|---|---|---|---|
| P1 | Bookkeeping and month-end reconciliation | `Bookkeeping` · `month-end reconciliation` | answer P → P; label possible, ownership partial (does the books; someone else does month-end) | **Approve as proposed** | Distinct duties, and the data shows the exact partial case. The form would ask about month-end directly |
| P2 | Cash handling and till reconciliation | `Cash handling` · `till reconciliation` | answer I → I; label not supported (the shift lead counts) | **Approve as proposed** | Reconciling the till is a separate, accountable duty; cashiers often hand it off |
| P3 | Crane signaling and rigging | `Crane signaling` · `Crane rigging` | answer I → I; label possible (a one-day class) | **Approve as proposed** | Signal person and rigger are separate qualified roles |
| P4 | Data engineering, building ETL pipelines | `Data engineering` · `building ETL pipelines` | engine I → I; allowed I | **Keep unsplit** | Misread apposition: the phrase after the comma describes data engineering, it isn't a second task |
| P5 | Experience operating a cash register and handling cash transactions | `operating a cash register` · `handling cash transactions` | answer I → I; label not enough ("yep I have") | **Keep unsplit** | The same activity in two wordings; a split would only add a redundant question |
| P6 | Experience with grant reporting and compliance | `grant reporting` · `grant compliance` | answer P → P (parts S, P); label supported | **Approve as proposed** | Reporting and compliance (audits, allowability) are separate responsibilities; the labeled answer covers both and isn't lowered |
| P7 | Handle patient scheduling and insurance verification | `Handle patient scheduling` · `insurance verification` | answer P → P; label possible, ownership partial (a coworker does insurance) | **Approve with edit:** `Patient scheduling` · `Insurance verification` | Distinct front-desk duties; the data shows the partial case. The edit drops the lead verb from the first part |
| P8 | Perform bookkeeping and monthly financial reporting | `Perform bookkeeping` · `monthly financial reporting` | answer I → I; label not supported (the spouse does both) | **Approve with edit:** `Bookkeeping` · `Monthly financial reporting` | Distinct duties; the edit drops "Perform" |
| P9 | Perform data cleaning and transformation in Python | `Perform data cleaning` · `transformation in Python` | answer I → I; label supported (reader misses it either way) | **Clarify first** | "In Python" applies to both parts but the split drops it from the first. Cleaning and transforming are usually one workflow; if you split, use `Data cleaning in Python` · `Data transformation in Python` |
| P10 | Perform welding and fabrication of steel structures | `Perform welding` · `fabrication of steel structures` | **answer S → P; label supported** | **Keep unsplit** | "Welding and fabrication" is one trade phrase, and splitting lowered a labeled-qualified answer. If you still want it split, adopt X2 first |
| P11 | Pipe threading and fitting | `Pipe threading` · `Pipe fitting` | answer I → I; label possible (a workshop) | **Approve as proposed** | Threading is a distinct skill; fitting with grooved or welded joints alone is a real partial case |
| P12 | Pruning and tree felling | `Pruning` · `tree felling` | answer I → I; label not supported (schedules the crew) | **Approve as proposed** | Felling is a separate, higher-risk skill; pruning alone is common |
| P13 | Recruiting and hiring staff | `Recruiting staff` · `hiring staff` | answer I → I; label not supported (an agency recruited) | **Clarify first** | The two overlap heavily in small workplaces. Decide whether "recruiting" (sourcing, screening) and "hiring" (the decision) must both be shown |
| P14 | Recruiting and onboarding new staff | `Recruiting new staff` · `onboarding new staff` | engine I → I (2 rows; allowed S and P) | **Approve as proposed** | Separate stages, often different people (a recruiter vs HR or a manager) |
| P15 | Soil testing and analysis | `Soil testing` · `Soil analysis` | answer I → I; label possible | **Clarify first** | Often named as one service. Decide whether interpreting results is separate from sampling and testing |
| P16 | Standard costing and variance analysis | `Standard costing` · `variance analysis` | engine P → P; allowed S | **Clarify first** | Variance analysis is a core part of standard costing; a split adds a question but little protection |

**Group 1 tally (my recommendations only):**
- approve as proposed: 7 (P1, P2, P3, P6, P11, P12, P14);
- approve with edit: 2 (P7, P8);
- clarify first: 4 (P9, P13, P15, P16);
- keep unsplit: 3 (P4, P5, P10).

### Group 1 owner decisions (2026-11-11, owner-approved)

These apply **to the structured questionnaire only (X1)**. They are recorded here and **not implemented or activated**: no approved-splits list exists yet.

| # | Original requirement (unchanged) | Decision | Approved parts (exact wording) |
|---|---|---|---|
| P1 | Bookkeeping and month-end reconciliation | Approved as proposed | `Bookkeeping` · `month-end reconciliation` |
| P2 | Cash handling and till reconciliation | Approved as proposed | `Cash handling` · `till reconciliation` |
| P3 | Crane signaling and rigging | Approved as proposed | `Crane signaling` · `Crane rigging` |
| P6 | Experience with grant reporting and compliance | Approved as proposed | `grant reporting` · `grant compliance` |
| P11 | Pipe threading and fitting | Approved as proposed | `Pipe threading` · `Pipe fitting` |
| P12 | Pruning and tree felling | Approved as proposed | `Pruning` · `tree felling` |
| P14 | Recruiting and onboarding new staff | Approved as proposed | `Recruiting new staff` · `onboarding new staff` |
| P7 | Handle patient scheduling and insurance verification | Approved with edited wording | `Patient scheduling` · `Insurance verification` |
| P8 | Perform bookkeeping and monthly financial reporting | Approved with edited wording | `Bookkeeping` · `Monthly financial reporting` |
| P13 | Recruiting and hiring staff | Approved with clarification | `Recruiting staff` · `Hiring staff`. *Recruiting* means sourcing and screening candidates. *Hiring* means taking part directly in selection or hiring decisions. Recruiting alone never establishes hiring experience |
| P4 | Data engineering, building ETL pipelines | Keep unsplit | — |
| P5 | Experience operating a cash register and handling cash transactions | Keep unsplit | — |
| P9 | Perform data cleaning and transformation in Python | Keep unsplit | — |
| P10 | Perform welding and fabrication of steel structures | Keep unsplit | — |
| P15 | Soil testing and analysis | Keep unsplit | — |
| P16 | Standard costing and variance analysis | Keep unsplit | — |

**Safeguards attached to these approvals:**
- No split is used in the free-text matching engine.
- X2 stays held: a whole-requirement Supported explanation doesn't grant every part.
- The original requirement wording and the approved part wording are both kept.
- No unreviewed split is activated.
- Existing matching outcomes don't change.
- D1–D3 and O1–O3 are preserved.

### Ambiguous batch 1 owner decisions (A1–A18, 2026-11-11, owner-approved)

**All 18 are kept unsplit in the structured ownership questionnaire.** These decisions are recorded only, not implemented; matching is unchanged.

| # | Original requirement (unchanged) | Decision |
|---|---|---|
| A1 | Certified rigger and signal person | Keep unsplit, with the original wording preserved. **The credential interpretation is flagged as unresolved:** don't assume two separate certifications are required. Credential verification stays separate from structured activity ownership |
| A2 | Bachelor's in Chemistry, minimum | Keep unsplit. The credential, duration, role-qualifier and employment-history checks are preserved, not turned into separate activity questions |
| A3 | Experience with AWS and 3+ years of DevOps work | Keep unsplit (as A2) |
| A4 | Forklift certification and 1+ year operating material handling equipment | Keep unsplit (as A2) |
| A5 | Litigation paralegal, 3 years | Keep unsplit (as A2) |
| A6 | State teaching certificate, secondary mathematics | Keep unsplit (as A2) |
| A7 | Supported Windows and Active Directory users for at least 2 years | Keep unsplit (as A2) |
| A8 | Verify and approve all invoices: 3 years of accounts payable experience | Keep unsplit (as A2) |
| A9 | AWS and either Terraform or CloudFormation | Keep unsplit; the existing alternative and mixed and/or logic is preserved (X3) |
| A10 | Python or R, plus SQL | Keep unsplit (X3) |
| A11 | AWS, Azure, or GCP | Keep unsplit (X3) |
| A12 | Bachelor's degree or equivalent combination of education and experience | Keep unsplit (X3) |
| A13 | Degree in Mathematics, Statistics, or Physics | Keep unsplit (X3) |
| A14 | Degree in Statistics, Mathematics or Economics | Keep unsplit (X3) |
| A15 | Write and maintain automated tests using Selenium or Cypress | Keep unsplit (X3) |
| A16 | You will evaluate vendors and mark each as approved or rejected; procurement experience required | Keep unsplit (X3) |
| A17 | HTML, CSS, and JavaScript | Keep unsplit; the existing item-level evaluation is preserved |
| A18 | *(requirement with embedded instructions; text omitted)* | Keep unsplit; embedded instructions are still treated as untrusted data |

### Ambiguous batch 2 owner decisions (A19–A34, 2026-11-11, owner-approved)

**Eight splits approved for future use in the structured questionnaire only, with the exact edited part wording below. Recorded only, not implemented or active.**

| # | Original requirement (unchanged) | Decision | Approved parts (exact wording) |
|---|---|---|---|
| A19 | Conduct inventory cycle counts and reconcile variances | Approved, edited | `Inventory cycle counts` · `Reconciling inventory variances` |
| A20 | Hands-on brake and suspension repair | Approved, edited | `Brake repair` · `Suspension repair` |
| A21 | Install drywall and finish joints | Approved, edited | `Drywall installation` · `Drywall joint finishing` |
| A22 | Manage executive calendars and coordinate travel arrangements | Approved, edited | `Executive calendar management` · `Travel coordination` |
| A23 | Manage social media accounts and create content | Approved, edited | `Social media account management` · `Content creation` |
| A24 | Perform venipuncture and start IV lines | Approved, edited | `Venipuncture` · `Starting IV lines` |
| A25 | Schedule service appointments and dispatch technicians | Approved, edited | `Scheduling service appointments` · `Dispatching technicians` |
| A26 | Prepare tax returns for individuals and small businesses | Approved, edited | `Individual tax return preparation` · `Small-business tax return preparation` |
| A27 | 20 years as a tool and die maker | Keep unsplit | — |
| A28 | A year and a half of phlebotomy | Keep unsplit | — |
| A29 | Able to follow system instructions and use override controls on CNC machines | Keep unsplit | — |
| A30 | Administer medications and document on the MAR | Keep unsplit | — |
| A31 | Administer user accounts and permissions in Microsoft 365 | Keep unsplit | — |
| A32 | Comfy on a ladder & good with hand tools | Keep unsplit | — |
| A33 | Conduct background checks and onboarding paperwork | Keep unsplit | — |
| A34 | De-escalate conflicts and handle difficult customer interactions | Keep unsplit | — |

**Safeguards attached to these approvals:**
- They apply only to the future structured questionnaire.
- No split is activated or implemented yet, and existing matching behavior isn't changed.
- X2 stays unresolved: a Supported whole-requirement explanation isn't automatically evidence for every part.
- Original requirement wording is preserved.
- Unreviewed cases stay pending.
- D1–D3 and O1–O3 are preserved.

**Open design item, required before any split is activated:** don't make a person write duplicate explanations when one explanation genuinely covers several parts. For example, "I run the calendars for our CEO and two VPs … and book the hotels, cars and flights for their trips" covers both A22 parts. This behavior is to be designed and approved separately, and it is distinct from X2.

### Ambiguous batch 3 owner decisions (A35–A50, 2026-11-11, owner-approved)

**All 16 are kept unsplit in the structured ownership questionnaire.** These decisions are recorded only; matching is unchanged.

| # | Original requirement (unchanged) | Decision |
|---|---|---|
| A35 | Develop curriculum and assessments for online courses | Keep unsplit |
| A36 | Experience with SQL queries and database reporting | Keep unsplit |
| A37 | *(requirement with embedded instructions; text omitted)* | Keep unsplit; still untrusted data |
| A38 | *(requirement with embedded instructions; text omitted)* | Keep unsplit; still untrusted data |
| A39 | Microsoft Outlook and calendar management | Keep unsplit |
| A40 | Operate a commercial dishwasher and maintain kitchen sanitation | Keep unsplit (recognition gap recorded separately below) |
| A41 | Operate forklifts and pallet jacks safely | Keep unsplit (recognition gap recorded separately below) |
| A42 | Operate point-of-sale systems and process returns | Keep unsplit (recognition gap recorded separately below) |
| A43 | Perform merchandising and visual displays | Keep unsplit (recognition gap recorded separately below) |
| A44 | Perform patient transfers and mobility assistance | Keep unsplit |
| A45 | Perform phlebotomy and specimen collection | Keep unsplit |
| A46 | Perform spay and neuter surgeries | Keep unsplit |
| A47 | Process accounts payable and vendor invoices | Keep unsplit (recognition gap recorded separately below) |
| A48 | Wound care and dressing changes | Keep unsplit |
| A49 | Write SQL that can DROP TABLE and re-create it safely during migrations | Keep unsplit |
| A50 | You will have override authority on the POS and approve voids | Keep unsplit |

### Ambiguous batch 4 owner decisions (A51–A63, 2026-11-11, owner-approved)

**Eleven splits approved for future use in the structured ownership questionnaire only, with the exact part wording below. Recorded only, not implemented or active.**

| # | Original requirement (unchanged) | Decision | Approved parts (exact wording) |
|---|---|---|---|
| A51 | Pour and finish concrete flatwork | Approved | `Pouring concrete flatwork` · `Finishing concrete flatwork` |
| A52 | Verify and approve all invoices before payment | Approved | `Verifying invoices` · `Approving invoices for payment` |
| A53 | Build and maintain Excel financial models | Approved | `Building Excel financial models` · `Maintaining Excel financial models` |
| A54 | Configure and maintain AWS cloud infrastructure | Approved | `Configuring AWS cloud infrastructure` · `Maintaining AWS cloud infrastructure` |
| A55 | Design and develop RESTful APIs | Approved | `Designing RESTful APIs` · `Developing RESTful APIs` |
| A56 | Develop and deliver sales presentations to clients | Approved | `Developing sales presentations for clients` · `Delivering sales presentations to clients` |
| A57 | Install and maintain security camera systems | Approved | `Installing security camera systems` · `Maintaining security camera systems` |
| A58 | Install and repair residential plumbing | Approved | `Installing residential plumbing` · `Repairing residential plumbing` |
| A59 | Order and manage pharmacy inventory | Approved | `Ordering pharmacy inventory` · `Managing pharmacy inventory` |
| A60 | Plan and execute paid search campaigns in Google Ads | Approved | `Planning paid search campaigns in Google Ads` · `Executing paid search campaigns in Google Ads` |
| A63 | Cut and style hair | Approved | `Cutting hair` · `Styling hair` |
| A61 | Able to override and reset PLC faults on the line | Keep unsplit | — |
| A62 | Clean and sanitize patient rooms per infection control standards | Keep unsplit | — |

**Interpretation safeguards attached to these approvals:**
- Each approved part is a distinct activity. Completing one part doesn't establish the other.
- Partial experience stays eligible for Possible when consistent with D1–D3 and the existing evidence rules.
- Supervising, observing, requesting, arranging, or reviewing someone else's work never counts automatically as personally performing a part.
- X2 stays unresolved: a whole-requirement verdict doesn't grant Supported for every part.
- One genuine explanation may support several parts without duplicate text. That must be designed and tested before activation (the open design item above).
- The original requirement text and the exact approved part wording are both preserved.
- No split is activated, and matching behavior is unchanged.

### Ambiguous batch 5 owner decisions (A64–A75, 2026-11-11, owner-approved)

**One split approved for future use in the structured ownership questionnaire only (A67); 11 kept unsplit. Recorded only, not implemented or active.**

| # | Original requirement (unchanged) | Decision | Approved parts (exact wording) |
|---|---|---|---|
| A67 | Load and unload freight from trucks | Approved | `Loading freight onto trucks` · `Unloading freight from trucks`. Partial credit is preserved for someone who personally does only one of the two (for example inbound unloading only). Neither activity establishes the other |
| A64 | Grant and revoke admin permissions in Active Directory | Keep unsplit | — |
| A65 | Harvest and pack fresh produce | Keep unsplit | — |
| A66 | Linux and Bash scripting | Keep unsplit | — |
| A68 | Mark and cut steel to specification | Keep unsplit | — |
| A69 | Prepare and cook menu items following standardized recipes | Keep unsplit | — |
| A70 | Prepare and file court documents | Keep unsplit | — |
| A71 | Prepare and serve coffee drinks on espresso machines | Keep unsplit | — |
| A72 | Prepare and teach daily lessons in high school mathematics | Keep unsplit | — |
| A73 | Schedule and coordinate shipments with freight carriers | Keep unsplit (recognition gap added to the follow-up section; no rule change) | — |
| A74 | Troubleshoot and repair network connectivity issues | Keep unsplit | — |
| A75 | Write and test system prompts for LLM applications | Keep unsplit | — |

**Safeguards still in force:**
- Approved splits apply only to the future structured questionnaire.
- X2 stays unresolved.
- One genuine explanation may cover several activities, but only after that behavior is explicitly designed and tested.
- Supported is never granted automatically from a checkbox or an unsupported self-report.
- Supervising, observing, requesting or arranging someone else's work never counts as personally performing it.
- D1–D3 and O1–O7 are preserved.
- No split is activated, and matching behavior is unchanged.

### Ambiguous batch 6 owner decisions (A76–A90, 2026-11-11, owner-approved)

**Two splits approved for future use in the structured ownership questionnaire only; 13 kept unsplit. Recorded only, not implemented or active.**

| # | Original requirement (unchanged) | Decision | Approved parts (exact wording) |
|---|---|---|---|
| A76 | CNC lathe setup and operation | Approved | `CNC lathe setup` · `CNC lathe operation` |
| A77 | Accounts receivable aging and collections | Approved | `Accounts receivable aging analysis` · `Accounts receivable collections` |
| A78 | Conduct customer site surveys and measurements | Keep unsplit (recognition gap recorded in the follow-up section) | — |
| A79 | Coordinate maintenance service requests with vendors and tenants | Keep unsplit | — |
| A80 | Draft architectural drawings in AutoCAD and Revit | Keep unsplit | — |
| A81 | Experience with event planning and logistics | Keep unsplit | — |
| A82 | Guest check-in and check-out | Keep unsplit | — |
| A83 | Install residential electrical wiring and fixtures | Keep unsplit | — |
| A84 | Manage project budgets and timelines | Keep unsplit | — |
| A85 | Patient transfer and lifting | Keep unsplit | — |
| A86 | Perform IT hardware repair and replacement | Keep unsplit | — |
| A87 | Perform bicycle repairs and tune-ups | Keep unsplit (possible false-Supported safety issue recorded in the follow-up section) | — |
| A88 | Perform dental cleanings and scaling | Keep unsplit | — |
| A89 | Quality inspection with calipers and micrometers | Keep unsplit | — |
| A90 | Transmission removal and replacement | Keep unsplit | — |

**Safeguards still in force:**
- D1–D3 and O1–O7 are preserved.
- Supported never comes from a checkbox or an unsupported self-report alone.
- There's no credit for someone else's work.
- X2 stays unresolved.
- Evidence shared across parts must be explicitly designed and tested.
- All approved splits stay inactive.

### Final ambiguous decisions (A91–A93, 2026-11-11, owner-approved)

| # | Original requirement (unchanged) | Decision | Approved parts (exact wording) |
|---|---|---|---|
| A91 | Pick, pack and ship customer orders | Keep unsplit | — |
| A92 | Prune, plant and maintain landscape beds | Keep unsplit (recognition gap recorded in the follow-up section) | — |
| A93 | Forecasting and budgeting | Approved (future structured questionnaire only; inactive) | `Forecasting` · `Budgeting`. Personally owning or performing the budgeting or forecasting stays distinct from merely providing numbers, filling in a template, requesting the work, or reviewing someone else's results. Supported never comes from a self-report or a structured checkbox alone |

## Group 2: the 93 ambiguous cases, by type of ambiguity

**Recommendation tally:**
- split with edited parts: 11;
- clarify first: 13;
- keep unsplit: 69.

Rows inside each type are ordered split, then clarify, then keep. "Split (edited parts)" means the splitter's wording needs your edit, and the suggested parts are in the rationale.

**Types where I recommend keeping everything (or nearly everything) unsplit:**
- credential or length of time (8);
- 'and' mixed with 'or' (8);
- three parts (2);
- three actions on one object (2).

Durations, credentials and alternatives are already read from the profile entries or by the item reader, and splitting them lowered correct readings. Three texts carry embedded instructions: they're never split, and the existing refusal applies.

#### mixes a credential or a length of time with other parts (8: clarify first 1, keep unsplit 7)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A1 | Certified rigger and signal person | `Certified rigger` · `signal person` | engine I | **Clarify first** | 'Certified' covers both. If split: `Certified rigger` · `Certified signal person`; a credential is read from entries, not the form |
| A2 | Bachelor's in Chemistry, minimum | `Bachelor's in Chemistry` · `minimum` | engine S; **split lowers 1** (S→P) | **Keep unsplit** | Misparse ('minimum' is a qualifier). Splitting lowered a row allowed only Supported |
| A3 | Experience with AWS and 3+ years of DevOps work | `AWS` · `3+ years of DevOps work` | engine G | **Keep unsplit** | Years come from employment dates and AWS from skills; the engine already reads each. Splitting adds nothing to the form |
| A4 | Forklift certification and 1+ year operating material handling equipment | `Forklift certification` · `1+ year operating material handling equipment` | engine I; answers I | **Keep unsplit** | Credential plus duration; both read from entries, not a structured choice |
| A5 | Litigation paralegal, 3 years | `Litigation paralegal` · `3 years` | engine S; **split lowers 1** (S→P) | **Keep unsplit** | Misparse (a role and its duration). Splitting lowered a correct Supported row |
| A6 | State teaching certificate, secondary mathematics | `State teaching certificate` · `secondary mathematics` | engine I | **Keep unsplit** | Misparse: the subject qualifies the certificate |
| A7 | Supported Windows and Active Directory users for at least 2 years | `Supported Windows` · `Active Directory users for at least 2 years` | engine S; **split lowers 1** (S→P) | **Keep unsplit** | One support role plus duration. Splitting lowered a correct Supported row |
| A8 | Verify and approve all invoices: 3 years of accounts payable experience | `Verify` · `approve all invoices: 3 years of accounts payable experience` | engine S; **split lowers 1** (S→P) | **Keep unsplit** | Mixed task and duration. Splitting lowered a row allowed only Supported |

#### mixes 'and' with 'or' (8: clarify first 2, keep unsplit 6)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A9 | AWS and either Terraform or CloudFormation | — | engine S | **Clarify first** | Genuinely compound: AWS · one of Terraform/CloudFormation. O3 parts can't hold an 'any of' part yet; keep unsplit unless that's added |
| A10 | Python or R, plus SQL | — | engine S | **Clarify first** | Genuinely compound: one of Python/R · SQL. Same 'any of' limitation as the AWS case |
| A11 | AWS, Azure, or GCP | — | engine S | **Keep unsplit** | Alternatives: any one is enough |
| A12 | Bachelor's degree or equivalent combination of education and experience | — | engine P | **Keep unsplit** | Alternatives |
| A13 | Degree in Mathematics, Statistics, or Physics | — | engine S | **Keep unsplit** | Alternatives |
| A14 | Degree in Statistics, Mathematics or Economics | — | engine S | **Keep unsplit** | Alternatives |
| A15 | Write and maintain automated tests using Selenium or Cypress | — | engine I; answers P | **Keep unsplit** | One test-automation skill with alternative tools |
| A16 | You will evaluate vendors and mark each as approved or rejected; procurement experience required | — | engine P | **Keep unsplit** | Instruction-shaped text; one procurement requirement. Don't split |

#### three parts, not all clearly tasks (2: keep unsplit 2)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A17 | HTML, CSS, and JavaScript | `HTML` · `CSS` · `JavaScript` | engine P/S | **Keep unsplit** | Named items; the existing item reading already handles each |
| A18 | *(requirement with embedded instructions; text omitted)* | — | engine P | **Keep unsplit** | Contains instructions aimed at the reader. Never split: the existing refusal already handles it |

#### two phrases, not both clearly tasks (32: clarify first 1, keep unsplit 24, split (edited parts) 7)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A19 | Conduct inventory cycle counts and reconcile variances | `Conduct inventory cycle counts` · `reconcile variances` | engine I; answers P | **Split (edited parts)** | `Inventory cycle counts` · `Reconciling inventory variances`. Counters and reconcilers are often different people (like P1); partial experience is common |
| A20 | Hands-on brake and suspension repair | `Hands-on brake` · `suspension repair` | engine P | **Split (edited parts)** | `Brake repair` · `Suspension repair`. Two different systems; brake work alone is common. Misparsed parts need the edit |
| A21 | Install drywall and finish joints | `Install drywall` · `finish joints` | engine I; answers I | **Split (edited parts)** | `Drywall installation` · `Drywall joint finishing`. Hanging and taping/finishing are separate trades; partial experience is common |
| A22 | Manage executive calendars and coordinate travel arrangements | `Manage executive calendars` · `coordinate travel arrangements` | engine P; answers P | **Split (edited parts)** | `Executive calendar management` · `Travel coordination`. Distinct duties; either can be done without the other |
| A23 | Manage social media accounts and create content | `Manage social media accounts` · `create content` | engine I; answers I | **Split (edited parts)** | `Social media account management` · `Content creation`. Often split between a community manager and a creator |
| A24 | Perform venipuncture and start IV lines | `Perform venipuncture` · `start IV lines` | engine I; answers P | **Split (edited parts)** | `Venipuncture` · `Starting IV lines`. Different clinical scope: phlebotomists draw blood but often may not start IVs |
| A25 | Schedule service appointments and dispatch technicians | `Schedule service appointments` · `dispatch technicians` | engine I; answers P | **Split (edited parts)** | `Scheduling service appointments` · `Dispatching technicians`. Distinct duties; booking without dispatch is common |
| A26 | Prepare tax returns for individuals and small businesses | `Prepare tax returns for individuals` · `small businesses` | engine P; answers I | **Clarify first** | Misparse ('small businesses' alone). If split: `Individual tax returns` · `Small-business tax returns`. Many preparers do individual returns only; decide whether both are necessary |
| A27 | 20 years as a tool and die maker | `as a tool` · `die maker` | engine I | **Keep unsplit** | Misparse: 'tool and die maker' is one trade; the years are read from employment dates |
| A28 | A year and a half of phlebotomy | `A year` · `a half of phlebotomy` | engine I | **Keep unsplit** | Misparse: a length of time, not two tasks |
| A29 | Able to follow system instructions and use override controls on CNC machines | `follow system instructions` · `use override controls on CNC machines` | engine P | **Keep unsplit** | One operating skill; the first phrase isn't a separately checkable task |
| A30 | Administer medications and document on the MAR | `Administer medications` · `document on the MAR` | engine I; answers P | **Keep unsplit** | Charting on the MAR is part of administering medications; a split would ask about routine documentation separately |
| A31 | Administer user accounts and permissions in Microsoft 365 | `Administer user accounts` · `permissions in Microsoft 365` | engine I; answers I | **Keep unsplit** | Misparse: accounts and permissions are one admin area; the second part lost its verb |
| A32 | Comfy on a ladder & good with hand tools | `Comfy on a ladder` · `good with hand tools` | engine P | **Keep unsplit** | Soft physical and tool comfort; neither part is a task to evidence on its own |
| A33 | Conduct background checks and onboarding paperwork | `Conduct background checks` · `onboarding paperwork` | engine I; answers I | **Keep unsplit** | One HR-onboarding workflow; usually done by the same person |
| A34 | De-escalate conflicts and handle difficult customer interactions | `De-escalate conflicts` · `handle difficult customer interactions` | engine I; answers I | **Keep unsplit** | Two wordings of the same skill |
| A35 | Develop curriculum and assessments for online courses | `Develop curriculum` · `assessments for online courses` | engine I; answers P | **Keep unsplit** | Assessments are part of curriculum development; the second part lost its verb |
| A36 | Experience with SQL queries and database reporting | `SQL queries` · `database reporting` | engine I; answers I | **Keep unsplit** | Database reporting is done with SQL queries; one skill |
| A37 | *(requirement with embedded instructions; text omitted)* | — | engine I | **Keep unsplit** | Contains instructions aimed at the reader. Never split: the existing refusal already handles it |
| A38 | *(requirement with embedded instructions; text omitted)* | — | engine I | **Keep unsplit** | Contains instructions aimed at the reader. Never split: the existing refusal already handles it |
| A39 | Microsoft Outlook and calendar management | `Microsoft Outlook` · `calendar management` | engine P | **Keep unsplit** | Calendar management in Outlook is one skill |
| A40 | Operate a commercial dishwasher and maintain kitchen sanitation | `Operate a commercial dishwasher` · `maintain kitchen sanitation` | engine P; answers I | **Keep unsplit** | One dish-station job |
| A41 | Operate forklifts and pallet jacks safely | `Operate forklifts` · `pallet jacks safely` | engine I; answers I | **Keep unsplit** | Equipment list for one job; pallet jacks alone don't evidence forklift work, and the whole reading already needs forklift words |
| A42 | Operate point-of-sale systems and process returns | `Operate point-of-sale systems` · `process returns` | engine I; answers P | **Keep unsplit** | Returns are done on the POS; one cashier skill |
| A43 | Perform merchandising and visual displays | `Perform merchandising` · `visual displays` | engine I; answers I | **Keep unsplit** | Visual displays are part of merchandising |
| A44 | Perform patient transfers and mobility assistance | `Perform patient transfers` · `mobility assistance` | engine I; answers I | **Keep unsplit** | Two wordings of the same care task |
| A45 | Perform phlebotomy and specimen collection | `Perform phlebotomy` · `specimen collection` | engine I; answers I | **Keep unsplit** | Phlebotomy is specimen collection; a split would only add a redundant question |
| A46 | Perform spay and neuter surgeries | `Perform spay` · `neuter surgeries` | engine I; answers P | **Keep unsplit** | Misparse ('spay' · 'neuter surgeries'); one surgical skill set |
| A47 | Process accounts payable and vendor invoices | `Process accounts payable` · `vendor invoices` | engine I; answers I | **Keep unsplit** | Vendor invoices are accounts payable; one task |
| A48 | Wound care and dressing changes | `Wound care` · `dressing changes` | engine I; answers I | **Keep unsplit** | Dressing changes are wound care |
| A49 | Write SQL that can DROP TABLE and re-create it safely during migrations | `Write SQL that can DROP TABLE` · `re-create it safely during migrations` | engine S; **split lowers 1** (S→P) | **Keep unsplit** | One migration skill. Splitting lowered a labeled-supported row (Supported -> Possible) |
| A50 | You will have override authority on the POS and approve voids | `You will have override authority on the POS` · `approve voids` | engine P | **Keep unsplit** | One authority (POS supervisor); not two tasks |

#### the first word may or may not be a separate task (25: clarify first 8, keep unsplit 15, split (edited parts) 2)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A51 | Pour and finish concrete flatwork | `Pour concrete flatwork` · `finish concrete flatwork` | engine I; answers I | **Split (edited parts)** | `Pouring concrete flatwork` · `Finishing concrete flatwork`. Finishing is a distinct, skilled trade; laborers often pour without finishing |
| A52 | Verify and approve all invoices before payment | `Verify all invoices before payment` · `approve all invoices before payment` | engine P | **Split (edited parts)** | `Verifying invoices` · `Approving invoices for payment`. Approval is an authority clerks often lack; partial experience is common |
| A53 | Build and maintain Excel financial models | `Build Excel financial models` · `maintain Excel financial models` | engine I; answers I | **Clarify first** | Lifecycle pair: maintaining someone else's model is real partial experience. Decide whether building is necessary |
| A54 | Configure and maintain AWS cloud infrastructure | `Configure AWS cloud infrastructure` · `maintain AWS cloud infrastructure` | engine I; answers I | **Clarify first** | Lifecycle pair (configure vs maintain); decide whether both are necessary |
| A55 | Design and develop RESTful APIs | `Design RESTful APIs` · `develop RESTful APIs` | engine I; answers I | **Clarify first** | Lifecycle pair: implementing an API someone else designed is common. Decide whether design is necessary |
| A56 | Develop and deliver sales presentations to clients | `Develop sales presentations to clients` · `deliver sales presentations to clients` | engine I; answers I | **Clarify first** | Delivering a deck someone else made is common; decide whether developing is necessary |
| A57 | Install and maintain security camera systems | `Install security camera systems` · `maintain security camera systems` | engine I; answers I | **Clarify first** | Lifecycle pair (install vs maintain); decide whether both are necessary |
| A58 | Install and repair residential plumbing | `Install residential plumbing` · `repair residential plumbing` | engine I; answers I | **Clarify first** | New-install vs service plumbing are often different jobs; decide whether both are necessary |
| A59 | Order and manage pharmacy inventory | `Order pharmacy inventory` · `manage pharmacy inventory` | engine P; answers I | **Clarify first** | Ordering vs managing stock can be separate duties; decide whether both are necessary |
| A60 | Plan and execute paid search campaigns in Google Ads | `Plan paid search campaigns in Google Ads` · `execute paid search campaigns in Google Ads` | engine I; answers P | **Clarify first** | Strategy vs execution; executing someone else's plan is common. Decide whether planning is necessary |
| A61 | Able to override and reset PLC faults on the line | `override PLC faults on the line` · `reset PLC faults on the line` | engine I | **Keep unsplit** | One troubleshooting action |
| A62 | Clean and sanitize patient rooms per infection control standards | `Clean patient rooms per infection control standards` · `sanitize patient rooms per infection control standards` | engine I; answers I | **Keep unsplit** | One task |
| A63 | Cut and style hair | `Cut hair` · `style hair` | engine I; answers I | **Keep unsplit** | One stylist skill set; virtually always together |
| A64 | Grant and revoke admin permissions in Active Directory | `Grant admin permissions in Active Directory` · `revoke admin permissions in Active Directory` | engine P | **Keep unsplit** | One permissions-administration task |
| A65 | Harvest and pack fresh produce | `Harvest fresh produce` · `pack fresh produce` | engine I; answers I | **Keep unsplit** | One field job |
| A66 | Linux and Bash scripting | `Linux scripting` · `Bash scripting` | engine S | **Keep unsplit** | Misparse: 'Linux scripting' is Bash scripting; one skill |
| A67 | Load and unload freight from trucks | `Load freight from trucks` · `unload freight from trucks` | engine I; answers I | **Keep unsplit** | One dock task |
| A68 | Mark and cut steel to specification | `Mark steel to specification` · `cut steel to specification` | engine P | **Keep unsplit** | One fabrication step |
| A69 | Prepare and cook menu items following standardized recipes | `Prepare menu items following standardized recipes` · `cook menu items following standardized recipes` | engine I; answers I | **Keep unsplit** | One line-cook task |
| A70 | Prepare and file court documents | `Prepare court documents` · `file court documents` | engine I; answers S; **split lowers 1** (S→P) | **Keep unsplit** | One paralegal workflow. Splitting lowered a labeled-supported answer (Supported -> Possible) |
| A71 | Prepare and serve coffee drinks on espresso machines | `Prepare coffee drinks on espresso machines` · `serve coffee drinks on espresso machines` | engine I; answers I | **Keep unsplit** | One barista task |
| A72 | Prepare and teach daily lessons in high school mathematics | `Prepare daily lessons in high school mathematics` · `teach daily lessons in high school mathematics` | engine I; answers S; **split lowers 1** (S→P) | **Keep unsplit** | One teaching job. Splitting lowered a labeled-supported answer (Supported -> Possible); it's also a Stage 3 regression case |
| A73 | Schedule and coordinate shipments with freight carriers | `Schedule shipments with freight carriers` · `coordinate shipments with freight carriers` | engine I; answers I | **Keep unsplit** | Two wordings of one logistics task |
| A74 | Troubleshoot and repair network connectivity issues | `Troubleshoot network connectivity issues` · `repair network connectivity issues` | engine I; answers I | **Keep unsplit** | One support task |
| A75 | Write and test system prompts for LLM applications | `Write system prompts for LLM applications` · `test system prompts for LLM applications` | engine P | **Keep unsplit** | One iterative task |

#### unclear whether the second word is a separate task (15: clarify first 1, keep unsplit 13, split (edited parts) 1)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A76 | CNC lathe setup and operation | `CNC lathe setup` · `operation` | engine P | **Split (edited parts)** | `CNC lathe setup` · `CNC lathe operation`. Setup is the higher skill many operators don't do; the classic partial-experience case. Second part needs its object |
| A77 | Accounts receivable aging and collections | `Accounts receivable aging` · `collections` | engine I | **Clarify first** | If split: `Accounts receivable aging` · `Accounts receivable collections` (the second part needs its object). Reporting vs collection calls can be separate; decide |
| A78 | Conduct customer site surveys and measurements | `Conduct customer site surveys` · `measurements` | engine I; answers I | **Keep unsplit** | Measurements are part of a site survey |
| A79 | Coordinate maintenance service requests with vendors and tenants | `Coordinate maintenance service requests with vendors` · `tenants` | engine I; answers P | **Keep unsplit** | Misparse: vendors and tenants are the parties, not tasks |
| A80 | Draft architectural drawings in AutoCAD and Revit | `Draft architectural drawings in AutoCAD` · `Revit` | engine I; answers P | **Keep unsplit** | Tools for one task; the existing named-item reading covers the two tools |
| A81 | Experience with event planning and logistics | `event planning` · `logistics` | engine I; answers I | **Keep unsplit** | Logistics is part of event planning |
| A82 | Guest check-in and check-out | `Guest check-in` · `check-out` | engine I/P | **Keep unsplit** | One front-desk task |
| A83 | Install residential electrical wiring and fixtures | `Install residential electrical wiring` · `fixtures` | engine P; answers P | **Keep unsplit** | One residential electrical task; fixtures alone lost the verb |
| A84 | Manage project budgets and timelines | `Manage project budgets` · `timelines` | engine I; answers P | **Keep unsplit** | Core project management; one area |
| A85 | Patient transfer and lifting | `Patient transfer` · `lifting` | engine I; answers I | **Keep unsplit** | Two wordings of the same task |
| A86 | Perform IT hardware repair and replacement | `Perform IT hardware repair` · `replacement` | engine I; answers I | **Keep unsplit** | One task |
| A87 | Perform bicycle repairs and tune-ups | `Perform bicycle repairs` · `tune-ups` | engine I; answers I | **Keep unsplit** | Tune-ups are repairs |
| A88 | Perform dental cleanings and scaling | `Perform dental cleanings` · `scaling` | engine I; answers I | **Keep unsplit** | Scaling is part of a dental cleaning |
| A89 | Quality inspection with calipers and micrometers | `Quality inspection with calipers` · `micrometers` | engine P | **Keep unsplit** | Tools for one task |
| A90 | Transmission removal and replacement | `Transmission removal` · `replacement` | engine P | **Keep unsplit** | 'R&R' is one job |

#### three actions on one object (2: keep unsplit 2)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A91 | Pick, pack and ship customer orders | `Pick customer orders` · `pack customer orders` · `ship customer orders` | engine I; answers I | **Keep unsplit** | One fulfillment job |
| A92 | Prune, plant and maintain landscape beds | `Prune landscape beds` · `plant landscape beds` · `maintain landscape beds` | engine I; answers I | **Keep unsplit** | One landscaping job |

#### two words that may name one area of work or two tasks (1: split (edited parts) 1)

| # | Requirement | Splitter's parts | Opened data | Recommendation | Rationale |
|---|---|---|---|---|---|
| A93 | Forecasting and budgeting | `Forecasting` · `budgeting` | engine I; answers I | **Split (edited parts)** | `Forecasting` · `Budgeting`. Distinct FP&A tasks; budgeting was already rejected as a broad equivalence (Batch 1). Partial experience is common |

## Reconciliation of all 109 cases (2026-11-11, documentation only)

Checked by a script that reads every owner-decision table in this document. The wording was compared with the part wording in each of the owner's approval messages.

| Check | Result |
|---|---|
| Every case appears exactly once in the owner-decision tables | **Yes:** 109 of 109 (P1–P16, A1–A93); none missing, none duplicated, no extras |
| P1–P16 | **10 approved, 6 unsplit** |
| A1–A93 | **23 approved, 70 unsplit** |
| Overall | **33 approved, 76 unsplit** |
| Approved wording matches the owner's exact wording | **Yes:** 33 of 33, no mismatches |
| Restricted to the future structured questionnaire | **Yes:** each of the eight decision sections states it |
| All approved splits inactive | **Yes:** nothing in matching, the review queue or the questionnaire reads any split. Outside its own module, the splitter (`proposeCompoundSplit`) is called only by its tests (`tests/ai-structured-answer.test.ts`). The Stage 2 report came from a one-off evaluation |
| No approved-splits runtime list | **Yes:** no file holds approved splits, and no approved part wording appears in application code. The one textual match is a Stage 2 code comment in the splitter ("Patient scheduling and insurance verification": two full task phrases), not a list |

**Approved (33):**
- **Group 1:** P1, P2, P3, P6, P7, P8, P11, P12, P13, P14.
- **Ambiguous:** A19–A26, A51–A60, A63, A67, A76, A77, A93.

**Unsplit (76):** every other case.

**Open before any split is used** (see docs/PHASE5_3_PRE_STAGE4_DESIGN_DECISIONS.md):
- X2;
- shared evidence across parts;
- correction and contradiction handling (A87);
- the eight recognition gaps;
- A1's credential interpretation.

## Recognition-gap follow-up (documentation only; separate from split approval)

Recorded 2026-11-11 at the owner's request. **No verdict or matching rule is changed.** These are labeled-supported answers that the current reader (rules-v20) doesn't credit. They are kept for a later, separately approved recognition review. They have no bearing on the split decisions above: all eight requirements (A40–A43, A47, A73, A78, A92) stay unsplit.

**Source and labels.**
- All eight come from the opened, spent follow-up set `m11_followup3`; each answer is repeated in the ownership benchmark.
- Labels are the set's whole-entry labels (`answer_verdict`, `personally_did`, `involvement`, `hands_on`), written by a separate labeling agent.
- "Engine" is the title-only engine reading of that scenario's role. "Reader" is the answer reader on the answer text alone.
- A follow-up reply exists in the data, but it isn't part of the answer reading below.

| # | Exact requirement | Opened evidence (answer; role; follow-up reply) | Current verdict | Labeled expected | Full requirement or only part? | Ambiguity to clarify |
|---|---|---|---|---|---|---|
| A40 (fw-075, benchmark pc-175) | Operate a commercial dishwasher and maintain kitchen sanitation | "I run the Hobart dish machine every shift, check the sanitizer and temps, and break down and clean the machine and the dish pit at close." Role: Dishwasher, 8 months. No reply | Reader: Not enough information. Engine: Possible | Supported (performed, hands-on) | **Largely full:** operating the machine is explicit. Sanitation is shown for the dish station (sanitizer, temperatures, cleaning the machine and the pit) but not for the kitchen as a whole | Does "maintain kitchen sanitation" mean the dish station's sanitation, or kitchen-wide duties? |
| A41 (fw-019, benchmark pc-119) | Operate forklifts and pallet jacks safely | "I'm on a sit-down Toyota forklift most of my shift, unloading trailers and putting pallets up on the top racks. Got certified by the company when I started." Role: Warehouse Associate, 25 months. Reply: "About two years, 8 to 10 trailers a shift on my own. Electric pallet jack too for staging." | Reader: Not enough information. Engine: Not enough information | Supported (performed, hands-on, reply OK) | **Only part, in the answer:** the forklift only; pallet jacks aren't mentioned. Pallet jacks appear **only in the follow-up reply**. "Safely" rests on the company certification alone | **Don't raise this to Supported automatically.** Should a reply count toward the second equipment type? (Follow-up replies currently reach Possible at most, as Self-reported.) Is the certification enough for "safely"? |
| A42 (fw-112, benchmark pc-212) | Operate point-of-sale systems and process returns | "I operate the Square POS at the register and process returns and exchanges myself, including the manager override ones when I'm keyholder." Role: Store Associate, 15 months. Reply: "Most shifts I'm the only one on register, a year and a quarter now." | Reader: Possible. Engine: Not enough information | Supported (performed, hands-on, reply OK) | **Full:** both parts are stated in the person's own words (operates a named POS; processes returns themselves) | Little: Square is a point-of-sale system. The open question is why "the Square POS" isn't matched to "point-of-sale systems" |
| A43 (fw-105, benchmark pc-205) | Perform merchandising and visual displays | "Every Sunday night I change out the front tables and windows to match the new promo — picking which items go up front, folding them in color order and putting the signs up so they catch your eye from the mall." Role: Retail Associate, 14 months. Reply: "My manager sends the corporate photo and I build it on my own, about a year now." | Reader: Not enough information. Engine: Not enough information | Supported (performed, hands-on, reply OK) | **Full in substance, none in wording:** visual displays (windows, tables, signs) and merchandising (choosing and arranging items) are described, but neither requirement word appears | The reply shows the layout comes from a corporate photo, and the person builds it. Does building a display to plan count as "merchandising", or should the plan be the person's own? |
| A47 (fw-014, benchmark pc-114) | Process accounts payable and vendor invoices | "Bills come into a shared inbox, I match each one to the PO and what the warehouse says we got, code it to the right expense line and schedule the check run every other Friday. I'm the only one in the office who does it." Role: Bookkeeper, 36 months. Reply: "Around 300 bills a month for three years. I also chase the vendors when an amount doesn't match." | Reader: Not enough information. Engine: Not enough information | Supported (performed, hands-on, reply OK) | **Full in substance:** three-way match, coding, payment runs, done alone. "Bills" stands for vendor invoices, and "accounts payable" isn't named | Little. It's a vocabulary gap ("bills", "PO", "check run" for accounts payable), the kind the equivalence review covers. Any fix goes through that review, with its no-new-false-Supported bar |
| A73 (fw-039, benchmark pc-139; added 2026-11-11) | Schedule and coordinate shipments with freight carriers | "I book LTL and full truckload pickups with our carriers, get the quotes, send the BOLs, and track the loads until they're delivered. When a carrier misses a pickup I'm the one rebooking it." Role: Logistics Coordinator, 31 months. Reply: "Around 25 shipments a week across six carriers. I negotiate the spot rates too." | Reader: Not enough information ("no relationship"). Engine: Not enough information | Supported (personally did; involvement "coordinated", hands-on no; reply OK) | **Full in substance:** booking pickups is scheduling, and quotes, bills of lading, tracking and rebooking are coordinating. All of it is with carriers and done by the person | **Likely cause (checked, not fixed):** the reader reads the person's part correctly (both statements are "performed"; neither is read as paperwork). The miss is vocabulary: "book … pickups" and "loads" aren't matched to "schedule … shipments". Read whole, the requirement finds no relationship. Read as one part at a time, each part reaches only Possible, through the shared word "carriers". Coordinating is the work asked here, so O2 doesn't limit it. Any fix goes through the equivalence review and its no-new-false-Supported bar |
| A78 (fw-031, benchmark pc-131; added 2026-11-11) | Conduct customer site surveys and measurements | "I do the in-home measures for every sale. Well, not all of them — on the big commercial jobs our estimator goes out, and I only measure the residential rooms." Role: Flooring Sales Representative, 21 months. Reply: "Residential I measure myself, about ten a week. Commercial is all the estimator." | Reader: Not enough information ("no own statement"). Engine: Not enough information | Supported (performed, hands-on, reply OK; labeler's note: "residential only") | **Partial in scope, full in kind:** the person measures residential jobs themselves, and the estimator does the commercial ones. "Site surveys" isn't named; in-home measuring is the survey work for residential flooring | **Likely cause (checked, not fixed):** this isn't mainly a vocabulary miss. The reader finds *no statement of the person's own* at all, for the whole requirement and for each phrase. The self-correction ("Well, not all of them —") seems to set aside the first sentence, and the narrowed "I only measure the residential rooms" isn't taken up. Vocabulary ("measures" vs "measurements", nothing for "site surveys") may also play a part, unverified. Open question: should residential-only measuring meet the requirement in full (the label says yes), or only in part? |
| A92 (fw-017, benchmark pc-117; added 2026-11-11) | Prune, plant and maintain landscape beds | "Well, I've been doing beds for this HOA since I started, all 30 of the common areas. I mean, I pick the plants, dig them in and cut back the shrubs twice a year on my own." Role: Groundskeeper, 44 months. Reply: "Spring is planting annuals and mulching, fall is the hard pruning. Nobody else on the crew does beds." | Reader: Not enough information ("no relationship"). Each phrase alone reads Possible ("part of what is asked", on the first sentence). Engine: Not enough information | Supported (performed, hands-on, reply OK) | **Full in substance:** choosing and planting ("pick the plants, dig them in"), pruning ("cut back the shrubs") and ongoing care of 30 beds, done personally | **Likely cause (checked, not fixed):** vocabulary. The person's part is read correctly: both statements are "performed", and "on my own" no longer counts as personal context since the rules-v20 adoption fix. But "dig them in" isn't matched to "plant", "cut back" isn't matched to "prune", and only "beds" overlaps. Any fix goes through the equivalence review and its no-new-false-Supported bar |

### Possible false-Supported safety issue (A87; documentation only, not fixed)

Recorded 2026-11-11 at the owner's request. **Flagged for targeted contradiction and correction handling before any new matching rule or compound split is activated.**

| Item | Detail |
|---|---|
| Requirement (exact) | Perform bicycle repairs and tune-ups (A87, kept unsplit) |
| Complete answer (fw-103, benchmark pc-203) | "I do tune-ups at the shop. Mostly I write them up at the counter and the mechanics in back do the work, I only fix flats." |
| Role and reply | Bike Shop Sales Associate, 9 months. Reply: "I do the flats and tubes myself, a few a day. Brakes and gears go to the back." |
| Label | Possible (personally did: yes; involvement: mixed; hands-on: yes; labeler's note: "flats only") |
| The person's own correction | The mechanics do the tune-ups; the person writes them up and personally fixes only flats and tubes |
| Whole requirement today | **Not enough information** (no relationship). Below Supported, so nothing is over-credited on this requirement |
| The defect | Read alone, the isolated phrase is over-credited. `tune-ups` reads **Supported** ("stated work", quoting "I do tune-ups at the shop"). "Bicycle tune-ups" and "Perform bicycle tune-ups" read **Possible** on the same quote. The reader takes "I do tune-ups" as the person's work and misses the correction in the next sentence ("Mostly … the mechanics in back do the work, I only fix flats") |
| Why it matters | A requirement worded just "tune-ups", or a split part, would be given Supported for work the person says someone else does. That breaks "no credit for someone else's work" |
| Required before activation | Targeted handling for in-answer corrections and contradictions ("I do X … mostly someone else does X, I only do Y"), with probes and the full regression comparison. Do it before any new matching rule or compound split is activated. **No fix implemented yet** |

**What this follow-up does not do:**
- It doesn't change verdicts or matching rules, add equivalences, or relabel anything.
- It doesn't count follow-up replies as evidence.

Any later fix must go through:
1. its own approval;
2. the full regression comparison (historical answers, probes, replies, engine baseline);
3. the no-new-false-Supported bar.

## Decision sheet

A reply can be as short as "X1–X4 as recommended; Group 1 as recommended except P13 split; Group 2 split candidates approved, clarify items kept whole, the rest kept whole". Anything you don't decide stays inactive.

**Cross-cutting:** X1 (structured form only), X2 (a whole-requirement Supported explanation shows every part), X3 (no "any of" parts yet), X4 (edited part wording allowed).

**Group 1 (16):**
- approve as proposed: P1, P2, P3, P6, P11, P12, P14;
- approve with edit: P7, P8;
- clarify first: P9, P13, P15, P16;
- keep unsplit: P4, P5, P10.

**Group 2 split candidates (11), each with edited parts:**
- A19, inventory cycle counts · reconciling variances;
- A20, brake repair · suspension repair;
- A21, drywall installation · joint finishing;
- A22, executive calendars · travel coordination;
- A23, social media account management · content creation;
- A24, venipuncture · starting IV lines;
- A25, scheduling service appointments · dispatching technicians;
- A51, pouring · finishing concrete flatwork;
- A52, verifying · approving invoices;
- A76, CNC lathe setup · operation;
- A93, forecasting · budgeting.

**Group 2 clarify first (13):**
- A1, certified rigger and signal person;
- A9 and A10, the "any of" cases (see X3);
- A26, individual vs small-business tax returns;
- A53–A60, eight lifecycle pairs: build and maintain, configure and maintain, design and develop, develop and deliver, install and maintain, install and repair, order and manage, plan and execute;
- A77, accounts receivable aging and collections.

**Group 2 keep unsplit (69):** every remaining A-row.

After your decisions, approved splits would be recorded as a reviewed list (requirement, approved parts, your wording). Stage 4 would only read that list. The splitter's own output is never used directly.
