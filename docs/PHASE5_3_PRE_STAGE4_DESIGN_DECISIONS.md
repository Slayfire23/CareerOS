# Phase 5.3: design decisions before Stage 4

November 11, 2026. **Proposals for owner approval. Nothing here is implemented.**

The compound split review is complete: 33 approved and 76 unsplit, all inactive (docs/PHASE5_3_SPLIT_REVIEW.md). Five design questions came out of it. Each must be settled before any approved split is used. The first two shape the Stage 4 questionnaire itself.

## Owner decisions (2026-11-11)

| # | Decision |
|---|---|
| DD1 | **Conditionally approved:** an independent per-part evidence model. Each part must be supported by evidence specific to that activity. A Supported verdict for the whole requirement never establishes every part. **Exact marker matching is not the final recognition design:** people must not lose legitimate credit for using different words. The recognition approach must be conservative, built from: owner-reviewed distinguishing markers; explicitly approved equivalent wording where justified; first-person ownership and clause-level attribution; correction and contradiction handling; and targeted follow-up questions when evidence is incomplete. No broad semantic equivalences, and related activities are never treated as identical automatically. It must be simulated against all 33 approved splits before implementation |
| DD2 | **Approved:** one explanation field for the whole requirement, with unticked per-part checkboxes. One explanation may establish several parts when it genuinely evidences each, and no duplicate writing is required. Checkboxes alone give Possible at most (D1), never Supported. Targeted follow-ups are asked only for unresolved parts, and an answered question is never repeated |
| DD3 | **Approved in principle**, subject to separate implementation and full regression testing. A correction that transfers responsibility to another person invalidates the earlier claim for that activity. A correction that only narrows scope preserves genuine experience within that scope. A87 and A78 become permanent regression examples, with nearby positive and negative controls. rules-v20 is unchanged for now |
| DD4 | **Separate review track.** Existing verdicts are preserved. A complete inventory of the gaps is to be prepared, including A40–A43, A47, A73, A78, A92 and the A56 and A60 observations. No equivalence or verdict change without separate review and approval |
| DD5 | **Approved:** A1 stays unsplit, with its certification interpretation unresolved. Credential verification stays separate from structured ownership |

The DD1/DD2 specification and its simulation are in docs/PHASE5_3_DD1_DD2_SPEC.md.

Fixed points every proposal keeps:
- D1–D3 and O1–O7;
- no Supported from a checkbox or an unsupported self-report;
- no credit for someone else's work (supervising, observing, requesting, arranging or reviewing);
- non-English text is never read (D3);
- X1: splits apply in the structured questionnaire only, and the free-text engine is unchanged.

## 1. X2: a whole-requirement explanation without automatic credit for every part

**The problem.** Treating a Supported whole-requirement explanation as proof of every part would credit parts the text never mentions. Requiring separate text per part, today's Stage 2 rule, turns down genuine one-sentence answers. In the opened data, for unsplit requirements:
- "I prepare and teach daily lessons…" (A72) reads Supported whole, but Possible once split;
- "I prepare motions … and e-file them…" (A70) does the same.

**Proposal: attribute each part, never inherit.** A part counts as shown only when a statement that is the person's own names that part.

1. **Each approved split carries a marker per part.** The marker is the word or words that tell the part apart from its siblings, taken from your approved wording:
   - A51: "pouring" / "finishing";
   - A24: "venipuncture" / "IV";
   - P13: "recruiting" / "hiring".

   Markers are derived mechanically from your wording, shown to you, and stored with the approved split. There's no list of ambiguous words, and nothing is inferred at run time.
2. **A part is shown** when the person's own clause contains that part's marker (by stem, or through an approved equivalence). A marker inside someone else's clause doesn't count: in "blow-dry once they finish cutting", "cutting" is the stylists' act. This must be covered by tests. The statement must also:
   - be the person's own and performed;
   - not be exposure-only or brief;
   - not be cancelled by a later correction (§3).
3. **A whole-requirement verdict never shows a part by itself.** This is X2 held, made concrete.
4. **Combining the parts.** Supported needs every necessary part checked and shown, plus a consistent explanation (D1). A part that's checked but not shown caps the verdict at Possible and triggers one targeted question naming that part. A part that's unchecked caps at Possible and names what's missing (O3, unchanged).

**How it handles cases from the review:**

| Answer | Parts shown | Result |
|---|---|---|
| A24 "I perform venipuncture … and start peripheral IVs…" | both | Supported is reachable |
| A63 "I shampoo … and blow-dry once they finish cutting" (an assistant) | neither: "cutting" is in the stylists' clause, and "blow-dry" isn't the "styling" marker without an approved equivalence | Possible at most, with a question |
| A93 "I fill in the template … the finance guy builds the forecast" | neither | Possible at most, with a question |
| A22 "I run the calendars … booking the hotels, cars and flights" | calendar shown; travel isn't ("trips", not "travel") | Possible, with a question about travel coordination |
| A25 "book their appointments and route our eight field techs" | neither ("book", "route") | Possible, with questions |

The last two rows are the honest cost: strict markers miss synonyms. They stay safe (Possible, never a false Supported), and recall improves only through approved equivalences.

**Before adoption:**
- a scratch simulation over the opened answers for all 33 approved splits, reporting what is shown and missed per part;
- probes for each rule;
- your review of the derived markers.

## 2. Shared evidence: one explanation for several parts, no duplicate writing

**Proposal: one explanation box, checkboxes per part, then targeted questions only for gaps.**
- **The form** asks once, "Describe what you did", for the whole requirement. Below it are unticked checkboxes, one per approved part, using your exact wording. Nothing is preselected (the Stage 4 rule).
- **Attribution (§1)** runs once over that single explanation. One sentence that names several parts' markers shows all of them, so nothing has to be written twice.
- **Only a part that is checked but not shown** gets a follow-up. It's at most one question per part, never repeated (`mayAskFollowUp`), worded around that part. For example: "You checked *Finishing concrete flatwork*. What did you do yourself?" The reply is read for that part only, and follow-up replies still reach Possible at most (Self-reported).
- **What's stored:** the choice and checkboxes per part (the Stage 1 `ClarificationPart` table) and, per shown part, the offsets of the attributed statement. Events keep the choice only, never the words (Stage 5).
- **Guard against padding:** a statement counts for a part only once, and it must be the person's own act. A list of other people's tasks shows nothing.

## 3. A87: corrections and contradictions that cancel an earlier claim

**The problem (A87, fw-103).** In "I do tune-ups at the shop. Mostly I write them up at the counter and the mechanics in back do the work, I only fix flats.", the phrase "tune-ups" alone reads **Supported**. The person's own correction is missed.

The opposite failure is A78: after "Well, not all of them —", the reader drops the person's real, narrowed statement ("I only measure the residential rooms") and finds no statement of the person's own at all.

The follow-up reply reader already refuses replies that undercut themselves (reason `undercuts_itself`). The answer reader has no matching check.

**Proposal: an in-answer correction rule that cancels or narrows, never ignores.** A correction is a later clause, usually after a discourse marker (well, actually, I mean, mostly, really, but, though, except, not all of them), that does one of these:

| Correction | Example | Effect |
|---|---|---|
| (a) Someone else does the same work | "the mechanics in back do the work" | **Cancels** the earlier claim for that work. The claim shows nothing, and that requirement or part reads Not enough information |
| (b) The person restricts their own act | "I only fix flats", "I just give him my labor numbers" | **Narrows**: the restricted statement stays the person's own work for its object only. "I only fix flats" counts for flat repair, not tune-ups |
| (c) A scope limit | "not all of them … I only measure the residential rooms" | **Narrows scope**: the statement is kept as own work, capped at Possible with a scope note. Whether it meets the requirement in full is your interpretation (the A78 question) |
| (d) An outright denial | "I never assigned them myself" | Already handled (rules-v20). Kept as a regression case |

**Delivery:**
- a separate rules change (a rules-v21 candidate) on the shared reader, with probes from A87, A78 and nearby wordings;
- genuine counter-examples that must keep credit, such as "I do tune-ups; mostly I also handle the brake jobs";
- the full regression comparison (1,266 answers, 392 probes, 320 replies, the four follow-up sets, the 2,121-row engine baseline), with zero labeled losses and zero new false Supported;
- your approval.

**Timing:** this must be in place before any split is activated, because splits create exactly the short part-phrases ("tune-ups") that expose this defect. It doesn't block building the Stage 4 form.

## 4. Recognition gaps (documented; no verdict changes)

Ten labeled-supported answers that rules-v20 doesn't credit (eight from the split review, plus A56 and A60 per the DD4 decision). The first eight are recorded in full in the split review, and those eight requirements stay unsplit. A56 and A60 are approved splits (inactive).

| # | Requirement | Current reading | Likely cause | What it needs |
|---|---|---|---|---|
| A40 | Operate a commercial dishwasher and maintain kitchen sanitation | Not enough | Vocabulary, plus scope: sanitation shown for the dish station only | Your interpretation of "kitchen sanitation", then an equivalence review |
| A41 | Operate forklifts and pallet jacks safely | Not enough | The answer shows the forklift only; pallet jacks appear only in the reply | Your decision on whether a reply may evidence the second equipment type. **Never raised automatically** |
| A42 | Operate point-of-sale systems and process returns | Possible | "the Square POS" isn't matched to "point-of-sale systems" | Equivalence review |
| A43 | Perform merchandising and visual displays | Not enough | Described in substance, but neither requirement word appears | Equivalence review, plus your call on building displays to a corporate plan |
| A47 | Process accounts payable and vendor invoices | Not enough | "bills", "PO", "check run" for accounts payable | Equivalence review |
| A73 | Schedule and coordinate shipments with freight carriers | Not enough | "book pickups", "loads" for scheduling shipments; ownership read correctly | Equivalence review |
| A78 | Conduct customer site surveys and measurements | Not enough | The self-correction makes the reader drop the narrowed own statement | §3 correction handling, plus your residential-scope decision |
| A92 | Prune, plant and maintain landscape beds | Not enough | "dig them in", "cut back" for planting and pruning; ownership read correctly | Equivalence review |
| A56 (fw-076, benchmark pc-176; added to the inventory 2026-11-11) | Develop and deliver sales presentations to clients | Not enough (reader and engine) | "I build the decks in PowerPoint for every prospect and present them in person or on Zoom" (Account Executive, 26 months; labeled supported, performed, hands-on). Neither "develop" nor "deliver … presentations" appears; "build the decks" and "present them" do. In the DD1 simulation, both approved parts are shown and the structured path reaches Supported | A text-path vocabulary gap only; the approved split's markers already cover it. Any text-path fix goes through the equivalence review |
| A60 (fw-088, benchmark pc-188; added to the inventory 2026-11-11) | Plan and execute paid search campaigns in Google Ads | Possible (reader); Not enough (engine) | "I plan and run our Google Ads search campaigns — keyword research, ad copy, bids and weekly budget adjustments…" (Digital Marketing Specialist, 20 months; labeled supported). "Run" isn't matched to "execute". Reply: "My manager approves the monthly budget". In the DD1 simulation, both parts are shown and the structured path reaches Supported | A text-path vocabulary gap ("run" for "execute"). Equivalence review. The reply's manager approval is about the budget, not the campaigns |

**Recommended route:**
- **Vocabulary gaps** (A42, A43, A47, A73, A92, and A40's vocabulary part): a future equivalence batch under the existing process, with simulation, the no-new-false-Supported bar and per-group approval.
- **A41, A78 and A40's scope:** need your interpretation first.
- **The complete DD4 inventory is the 10 rows above:** A40–A43, A47, A73, A78, A92, A56, A60.
  - The full evidence for the first eight is in the split review's recognition-gap section. A56 and A60 are recorded here.
  - Existing verdicts are preserved, and nothing is implemented.
  - A56 and A60 are text-path gaps that the approved splits would cover on the structured path (DD1 simulation).

## 5. A1: unresolved credential interpretation (preserved)

"Certified rigger and signal person" stays **unsplit**, with the original wording preserved. The open question is whether it requires one certification covering both roles, a certification for each role, or certification for one role plus experience in the other. **Nothing assumes two separate certifications.** Credentials are verified from the person's profile entries, separately from structured activity ownership. The questionnaire doesn't ask about the certification. No decision is proposed yet: it needs your view of the job's intent, and it touches no Stage 4 work.

## Proposed order

1. **Decide §1 and §2** (X2 attribution and the shared-evidence form). The Stage 4 questionnaire depends on them.
2. **§3 correction handling** as its own rules change, any time before splits are activated. It can run in parallel with Stage 4.
3. **§4** through the equivalence and interpretation track, independent of Stage 4.
4. **§5** waits for your interpretation.

## Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| DD1 | Adopt part attribution with owner-reviewed markers for X2 (§1)? | Yes, after the scratch simulation and your review of the markers |
| DD2 | Adopt one explanation, checkboxes per part, and targeted questions only for unshown parts (§2)? | Yes |
| DD3 | Build in-answer correction handling (cancel or narrow) as a separate rules change before any split activation (§3)? | Yes |
| DD4 | Route the vocabulary gaps to a future equivalence batch, and answer the A40, A41 and A78 interpretation questions (§4)? | Yes; no verdict changes until then |
| DD5 | Keep A1 unresolved and unsplit (§5)? | Yes |
