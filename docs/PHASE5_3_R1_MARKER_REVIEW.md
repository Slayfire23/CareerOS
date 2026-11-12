# Phase 5.3 R1: marker and equivalent review

**For owner review; nothing is approved or adopted.** Markers and equivalents are recognition proposals only. **The owner-approved part wording is never changed by them.**

Each part is shown only when the person's own clause contains a marker or an approved equivalent, after the clause-level attribution in docs/PHASE5_3_DD1_DD2_SPEC.md §3. Draft patterns were first used in the DD1 simulation. Where this review recommends a revision, the revised pattern was re-tested (scratch) against three sets:
- the DD1 design probes;
- the split's own opened answers;
- **all 1,266 opened answers**, as a measure of how generic a pattern is. A pattern that fires on many unrelated answers is likely to over-credit inside its own requirement too.

**Recommendations:**
- **Approve:** use as drafted.
- **Revise:** use the revised pattern shown.
- **Reject:** don't use it; that wording leads to a targeted question instead.
- **Owner interpretation:** the answer depends on what the requirement means.

## Batch 1 of 4: P1, P2, P3, P6, P7, P8, P11, P12

| # | Original requirement | Approved part (exact) | Draft marker | Candidate equivalent | Why the equivalent is valid | Ambiguity / over-credit risk (measured) | Recommendation |
|---|---|---|---|---|---|---|---|
| P1 | Bookkeeping and month-end reconciliation | Bookkeeping | "bookkeeping"; "the books" | posting to the ledger | Posting transactions to the general ledger is the core bookkeeping act | "the books" alone fires on "my husband does all the books" or "I audit the books". Its 4 opened hits were all from other requirements | **Revise:** "bookkeeping", or "keep/do (all) the books". **Approve** the ledger equivalent |
| | | month-end reconciliation | "reconcil…" | matching bank statements | Matching statements line by line is reconciliation | Any reconciliation would count, including a nightly till reconciliation. The part says *month-end* | **Owner interpretation:** must it be month-end? If yes, **revise** both to require month-end, monthly or close within the sentence (tested: probes and the opened answer still match). Otherwise, approve as drafted |
| P2 | Cash handling and till reconciliation | Cash handling | "cash" | — | — | "cash" alone matches "cash flow" and "the cash out at night" (a manager's close). 3 opened hits, all from other requirements | **Revise:** a handling verb near "cash" (handle, count, take, accept, process, collect, deposit), or "cash drawer/register/payments/transactions/deposits", never "cash flow" (tested: 3 → 0 unrelated hits; probes kept) |
| | | till reconciliation | count, balance or reconcile near till/drawer | — | — | Good. The opened case ("the shift lead does the count") is handled by the transfer correction | **Approve** |
| P3 | Crane signaling and rigging | Crane signaling | "signal…" | directing, or "talking the operator through" | Signaling *is* directing the crane operator; radio direction is standard | "signal" is generic elsewhere (software, classrooms), but inside this requirement it's specific. A one-day class with practice signals is held at exposure by the existing reader | **Approve** marker and both equivalents |
| | | Crane rigging | "rig"; "rigg…" | slinging; choking the loads | Slinging and choking are rigging methods | **"rig" also means a truck** ("I inspect the rig", seen in a pre-trip answer). "Slings" as a noun ("I inspect the slings") isn't rigging work | **Revise:** "rigging", or "rig(s/ged)" followed by loads/lifts/picks. Equivalents only as verbs on a load ("sling the loads", "choke the loads") (tested: unrelated hits 6 → 3, all real rigging) |
| P6 | Experience with grant reporting and compliance | grant reporting | "report…" | — | — | **Very generic:** 44 opened hits ("I report to the director", "run reports"). Inside this requirement, "I report to the grants manager" would show *grant reporting* | **Revise:** writing, drafting, preparing, submitting or completing near "report(s)", or "progress/grant/federal/financial/performance report". Filing reports is paperwork (O2) and is excluded (tested: 44 → 6 hits. The one unrelated risk, "someone writes up the findings, I file the reports", relies on clause attribution, which assigns it to the other person) |
| | | grant compliance | "complian…" | single audit; allowable costs | The single audit (Uniform Guidance) and cost allowability are core federal grant compliance | "Single audit" is done by auditors. Only the person *preparing* it, as the person's own act, should count (handled by ownership). "allowable" alone is generic | **Approve** the marker and "single audit". **Revise** allowability to "allowable cost/expense/charge", or "expense … allowable" (tested) |
| P7 | Handle patient scheduling and insurance verification | Patient scheduling | "schedul…" | booking appointments | Booking appointments is scheduling patients | **Very generic:** 44 opened hits ("staff schedules", "month-end schedules"). Inside this requirement, "I make the staff schedule" would show *patient scheduling* | **Revise:** "schedul…" near patients/appointments/visits (tested: 44 → 1 hit, the real one). **Approve** the booking equivalent |
| | | Insurance verification | verify or check near insurance/eligibility/benefits/coverage | — | — | Good; 2 opened hits, both genuine | **Approve** |
| P8 | Perform bookkeeping and monthly financial reporting | Bookkeeping | as P1 | posting to the ledger | as P1 | as P1 | **Revise** as P1; **approve** the equivalent |
| | | Monthly financial reporting | "financial reports/statements"; "monthly reports" | P&L; profit and loss; balance sheet | Preparing the P&L and balance sheet is monthly financial reporting | "monthly report" fires on an SEO answer. **"Full P&L responsibility" is accountability, not preparing a report** (2 opened hits) | **Revise:** "financial reports/statements", or "monthly/month-end financials". Equivalents only with a preparing verb (prepare, put together, produce, build, run … P&L/balance sheet) (tested: unrelated P&L hits removed; probes kept) |
| P11 | Pipe threading and fitting | Pipe threading | "thread…" | — | — | "threads" also appears in inspection ("check the threads"), which the review-verb rule already blocks. Sewing or forum "threads" are unlikely here | **Revise:** "thread…" near pipe/nipples/black iron/galvanized/conduit/rod, or "run threads", "threading machine", "threader" (tested: probes kept, including "I run the threading machine") |
| | | Pipe fitting | "fit…"; "pipefit…" | making up the joints | "Making up" joints is the pipefitting term for assembling them | **"fit" is very generic** ("fits the schedule", "fit in"); 8 opened hits, mostly unrelated | **Revise:** "pipefit…", "fit-up", or "fit(s/ted/ting)" near pipe/joints/runs/lines (tested: 8 → 2, both real). **Approve** the equivalent |
| P12 | Pruning and tree felling | Pruning | "prun…" | trimming or cutting back limbs/branches/shrubs/hedges | Trimming limbs is pruning | **Shrubs and hedges:** the requirement is tree work, and hedge trimming is landscaping. A92's "cut back the shrubs" would count | **Owner interpretation:** do shrubs and hedges count as pruning here? Recommended: **revise** to limbs/branches only |
| | | tree felling | "fell/felled/felling" near trees; "tree felling" | taking or bringing down trees | Common wording for felling | "fell" is also the past of "fall" ("I fell off the ladder"); the tree-proximity condition prevents that | **Approve** |

**Batch 1 summary (by marker or equivalent item):**
- **Approve:** 13.
- **Revise:** 12, mostly over-generic single words.
- **Reject:** 0.
- **Owner interpretation:** 2 questions, covering 3 items: P1 month-end (its marker and equivalent) and P12 shrubs and hedges.

Every revision keeps the genuine design probes and opened answers that the draft matched, as tested. Batches 2–4 (A19–A26; A51–A60; A63, A67, A76, A77, A93) follow after your decisions on this batch.

**Revised patterns (exact, for the record; scratch-tested, not adopted):**
- **P1 Bookkeeping:**
  - `\bbookkeeping\b`
  - `\b(keep|keeps|kept|keeping|do|does|did|doing)\s+(all\s+)?the books\b`
- **P1 month-end reconciliation, if month-end is required:**
  - `\b(month[- ]end|monthly|end[- ]of[- ](the[- ])?month)\b[^.]{0,40}\breconcil\w*`
  - `\breconcil\w*\b[^.]{0,40}\b(month[- ]end|monthly|every month|each month|close)\b`
  - The equivalent likewise requires month or close.
- **P2 Cash handling:**
  - `\b(handl\w*|count\w*|tak\w*|accept\w*|process\w*|collect\w*|deposit\w*)\b[^.]{0,20}\bcash\b(?!\s*flow)`
  - `\bcash\s+(handling|drawers?|registers?|payments?|transactions?|deposits?)\b`
- **P3 Crane rigging:**
  - `\brigging\b`
  - `\brig(s|ged)?\b[^.]{0,15}\b(loads?|lifts?|picks?)\b`
  - Equivalents: `\b(sling|slings|slinging|slung)\b[^.]{0,15}\b(the\s+)?(loads?|lifts?)\b` and `\bchok\w* (the )?loads?\b`
- **P6 grant reporting:**
  - `\b(writ\w*|wrote|draft\w*|prepar\w*|submit\w*|complet\w*)\b[^.]{0,30}\breports?\b`
  - `\b(progress|grant|federal|financial|performance)\s+reports?\b`
- **P6 allowability:**
  - `\ballowab\w*[\s-]+(costs?|expenses?|charges?)\b`
  - `\bexpenses?\b[^.]{0,20}\ballowab\w*`
- **P7 Patient scheduling:**
  - `\bschedul\w*\b[^.]{0,25}\b(patients?|appointments?|visits?)\b`
  - `\b(patients?|appointments?|visits?)\b[^.]{0,15}\bschedul\w*`
- **P8 Monthly financial reporting:**
  - `\bfinancial (reports?|statements?)\b`
  - `\b(monthly|month-end) financials\b`
  - Equivalent: `\b(prepar\w*|put\w* together|produc\w*|build\w*|built|run\w*)\b[^.]{0,30}\b(P&L|profit and loss|balance sheets?)\b`
- **P11 Pipe threading:**
  - `\bthread\w*\b[^.]{0,30}\b(pipes?|nipples?|black iron|galvanized|conduit|rod)\b`
  - `\b(pipes?|nipples?|black iron)\b[^.]{0,25}\bthread\w*`
  - `\brun\w* threads\b`, `\bthreading machine\b`, `\bthreader\b`
- **P11 Pipe fitting:**
  - `\bpipefit\w*`
  - `\bfit[- ]?up\b`
  - `\bfit(s|ted|ting)?\b[^.]{0,20}\b(pipes?|joints?|runs?|lines?)\b`
- **P12 Pruning equivalent, if limbs and branches only:**
  - `\b(trim\w*|cut\w* back)\b[^.]{0,25}\b(limbs?|branch\w*)\b`
