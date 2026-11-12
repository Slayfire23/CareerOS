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

## Batch 1 owner decisions (2026-11-12, owner-approved; recognition proposals only, not implemented)

The owner-approved part wording is unchanged. These decisions approve *recognition patterns* for future use only. Nothing is implemented or active, and no list exists.

| # | Part (exact) | Owner decision |
|---|---|---|
| P1 | Bookkeeping | **Approved:** the revised specific markers ("bookkeeping"; "keep/do (all) the books") and the "posting to the ledger" equivalent |
| P1 | month-end reconciliation | **Approved with interpretation:** requires actual month-end reconciliation, monthly reconciliation, or month-end close context (the revised patterns). Daily cash or till reconciliation alone doesn't establish month-end reconciliation. The bank-statement equivalent likewise requires month or close context |
| P2 | Cash handling | **Approved:** the revised markers, which need evidence of personally handling cash, payments, or register or drawer activity. "Cash flow" alone never counts |
| P2 | till reconciliation | **Approved** as proposed |
| P3 | Crane signaling | **Approved:** the marker and the directing and "talking the operator through" equivalents, **provided they refer to personally performing crane signaling**, not merely communicating with an operator |
| P3 | Crane rigging | **Approved:** the revised load- or lift-specific patterns. A truck "rig" is never crane rigging |
| P6 | grant reporting | **Approved:** the revised reporting patterns, with grant-reporting context and clause-level ownership. Reporting *to* a supervisor, and merely filing another person's report, don't establish grant reporting |
| P6 | grant compliance | **Approved:** the compliance marker and the single-audit equivalent. "Allowable" needs cost, expense or charge context (revised) |
| P7 | Patient scheduling | **Approved:** the revised patient-, appointment- or visit-specific markers and the booking-appointments equivalent. Staff scheduling alone never counts |
| P7 | Insurance verification | **Approved** as proposed |
| P8 | Bookkeeping | **Approved:** the same revised patterns and safeguards as P1 |
| P8 | Monthly financial reporting | **Approved:** the revised financial-reporting patterns. Preparing financial reports is distinct from having P&L accountability or merely reviewing reports. P&L and balance-sheet equivalents only with a preparing verb |
| P11 | Pipe threading | **Approved:** the revised pipe-specific markers, including threading-machine evidence **when the surrounding context establishes pipe threading** |
| P11 | Pipe fitting | **Approved:** the revised pipe-specific markers and the "making up the joints" equivalent, with pipe-work context |
| P12 | Pruning | **Approved, by owner interpretation (differs from the recommendation):** personally pruning branches, limbs, shrubs **and hedges** counts as relevant pruning experience, so the drafted equivalent including shrubs and hedges is kept. **Shrub or hedge trimming never establishes tree felling** |
| P12 | tree felling | **Approved** as proposed |

**Implementation notes, for when patterns are built (not now):**
- **P3:** the signaling equivalents count only in the person's own clause, as their act of directing the lift. "I radio the operator about the schedule" isn't signaling.
- **P11:** "threading machine" counts only with pipe-work context in the same answer.
- **P12:** shrub and hedge wording maps only to *Pruning*, never to *tree felling*.

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

Every revision keeps the genuine design probes and opened answers that the draft matched, as tested. Batch 2 (A19–A26) is below; batches 3–4 (A51–A60; A63, A67, A76, A77, A93) follow.

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

## Batch 2 of 4: A19–A26 (presented 2026-11-12; pending owner decisions)

The same method as batch 1. Each revision was re-tested against the DD1 design probes, the split's opened answer, and all 1,266 opened answers. "Kept" means every genuine case the draft matched still matches.

| # | Original requirement | Approved part (exact) | Draft | Candidate equivalent | Why valid | Ambiguity / over-credit risk (measured) | Recommendation |
|---|---|---|---|---|---|---|---|
| A19 | Conduct inventory cycle counts and reconcile variances | Inventory cycle counts | "count…" | — | — | **Very generic:** 38 opened hits ("counter", "counterbalance") | **Revise:** "cycle count…", or "count" near inventory, stock, aisles, shelves, bins, locations, SKUs or on-hand (38 → 7, all genuine; probes and opened answer kept) |
| | | Reconciling inventory variances | "reconcil…"; "variance(s)" | *new candidate:* counts or numbers don't match/line up, then fixing or correcting the record or count | Investigating why counts don't match and correcting the record is reconciling, in substance | "variance" alone fires on budget-variance and Excel answers. **"I flag variances to the analyst" would show reconciling.** The candidate matches the opened labeled-supported answer (fw-002: "If the numbers don't line up I dig through the receiving slips … until I find out why, then fix the record"), so it is **partly fitted to one opened answer**. The lookalike "…I tell the manager and she fixes the record" only matches across a change of subject, so it depends on clause attribution | **Revise** the marker: "reconcil…", or investigate, resolve, correct, research or adjust near variances or discrepancies. **Owner interpretation** for the candidate equivalent |
| A20 | Hands-on brake and suspension repair | Brake repair | "brake(s)" | pads, rotors, calipers | Replacing pads, rotors and calipers is brake repair | "brakes" fires on pre-trip *inspection*, an elevator, and a sheet-metal *brake*. **"Calipers" is also a measuring tool** (2 opened hits, both measuring) | **Revise:** "brake job/repair/work/service", or a repair verb (repair, replace, bleed, machine, resurface, install, do) near "brake(s)". Equivalent only with a repair verb (tested: unrelated hits removed; "I only do pads and rotors" still kept) |
| | | Suspension repair | "suspension" | struts, shocks, control arms, ball joints, ~~tie rods~~, coil springs | Replacing these components is suspension repair | **Tie rods are steering parts, not suspension:** removed. "Struts" also appears in construction. 0 opened hits either way | **Approve** the marker. **Revise** the equivalent: requires a repair verb, tie rods removed, sway-bar links added |
| A21 | Install drywall and finish joints | Drywall installation | install or hang near drywall, sheetrock, gypsum or **board** | — | — | Bare "board" is generic ("install the circuit board"; the supervision probe "runs the crew that hangs the board") | **Revise:** drop bare "board"; drywall, sheetrock, gypsum board or wallboard only (genuine probes kept) |
| | | Drywall joint finishing | finish, tape or mud near joints or seams | "tape and mud" | Standard trade wording | Low; 0 unrelated hits | **Approve** both |
| A22 | Manage executive calendars and coordinate travel arrangements | Executive calendar management | "calendar(s)" | — | — | "calendar" fires on court-deadline calendars, a month-end close calendar and an Android calendar UI (13 opened hits) | **Revise:** "calendar" with executive context (CEO, executives, VP, president, founder, director, partner, principal, leadership) (13 → 3, all genuine). **Owner interpretation:** does a manager's, attorney's or physician's calendar count? The revised pattern excludes them |
| | | Travel coordination | "travel…" | booking flights, hotels or trips | Booking travel for others is travel coordination | **"I travel to client sites" would show travel coordination.** "Traveler" (a manufacturing document) is excluded as an agent noun. **Booking one's own flights isn't coordination** | **Revise:** a coordinating verb (coordinate, arrange, plan, manage, handle) near "travel", or "travel arrangements/itineraries/bookings/logistics". **Revise** the equivalent to booking **for others** ("for her/them/the team", "the CEO's flights"); own trips excluded (tested) |
| A23 | Manage social media accounts and create content | Social media account management | manage, run or handle near social media, a platform, or **"accounts"** | — | — | **"I manage 40 accounts across the territory" (sales) would show social media management** | **Revise:** a named platform or "social media", or "accounts" only with posts, followers, DMs, comments or "social" in the same sentence (tested: the sales sentence excluded; "I manage the accounts and schedule posts" kept) |
| | | Content creation | "content"; shoot, film, edit or design photos/videos | — | — | Bare "content" fires on course content | **Revise:** a creating verb (create, write, produce, make, shoot, film, edit, design) near "content". **Approve** the photo/video pattern |
| A24 | Perform venipuncture and start IV lines | Venipuncture | "venipuncture"; drawing blood; blood draws | — | — | **"Draw arterial blood" is arterial puncture (ABGs), not venipuncture** (1 opened hit) | **Revise:** exclude "arterial" (tested: the ABG answer no longer matches; probes kept) |
| | | Starting IV lines | start, place or insert near IV, IV lines, intravenous or peripheral lines | — | — | The opened hits from other requirements are IV-insertion answers, all genuine | **Approve** |
| A25 | Schedule service appointments and dispatch technicians | Scheduling service appointments | "schedul…" | booking appointments or service calls | Booking service appointments is scheduling them | **Very generic:** 44 opened hits ("staff schedules") | **Revise:** "schedul…" near appointments, service calls, visits, jobs, installs or customers (44 → 0 unrelated; probes kept). **Approve** the booking equivalent |
| | | Dispatching technicians | "dispatch…" | routing or assigning techs/technicians | Routing field techs is dispatching them | "dispatch…" fires on truck and train dispatching | **Revise:** "dispatch" near techs, technicians, crews, installers, service or field (tested). **Owner interpretation:** does dispatching **drivers** count? The revised pattern excludes it. **Approve** the routing equivalent |
| A26 | Prepare tax returns for individuals and small businesses | Individual tax return preparation | "individual"; "1040(s)" | — | — | "individual" alone fires on "individual students with IEPs" | **Revise:** "individual" near returns, tax or 1040, or "1040(s)" (tested) |
| | | Small-business tax return preparation | "small business"; "business returns" | 1120(-S), 1065, S-corp, partnership returns | These are small-business entity returns | **"I run a small business" would show small-business tax returns.** Bare "1120" (a C-corporation return) can be a large company's ("Preparing corporate tax workpapers") | **Revise:** "small business" near returns or tax; "business (tax) returns". **Approve** 1120-S, 1065, "S-corp … returns", partnership returns and Schedule C. **Owner interpretation:** does a C-corporation 1120 count as small-business? The revised pattern excludes it |

**Batch 2 summary (by item):**
- **Approve:** 8.
- **Revise:** 16.
- **Reject:** 0 (tie rods removed within a revision).
- **Owner interpretation:** 5 questions:
  1. the A19 reconciliation equivalent;
  2. A22: a manager's, attorney's or physician's calendar;
  3. A22: confirm that booking your own travel is excluded;
  4. A25: dispatching drivers;
  5. A26: a C-corporation 1120.

**Patterns that could cause false Supported if approved as drafted:**
- "count", "variance", "brake(s)", "calipers", "calendar", "travel", "accounts", "content", "schedul…", "dispatch…", "individual", "small business";
- "draw … blood", which matches arterial draws.

**Patterns where a revision could cause a qualified loss** (tested; none found on opened data or probes):
- requiring executive context for calendars (a manager's calendar);
- excluding driver dispatch;
- excluding C-corporation 1120s.

These are listed as owner interpretations so the exclusion is your decision.

**Revised patterns (exact; scratch-tested, not adopted):**
- **A19 Inventory cycle counts:**
  - `\bcycle count\w*`
  - `\bcount(s|ed|ing)?\b[^.]{0,30}\b(inventory|stock|aisles?|shel(f|ves)|bins?|locations?|SKUs?|on[- ]hand)\b`
  - `\b(inventory|stock)\s+counts?\b`
- **A19 Reconciling inventory variances:**
  - `\breconcil\w*`
  - `\b(investigat\w*|resolv\w*|correct\w*|research\w*|adjust\w*)\b[^.]{0,25}\b(variances?|discrepanc\w*)\b`
  - Candidate equivalent, owner interpretation: `\b(numbers|counts?|quantities|totals)\b[^.]{0,15}\b(don'?t|do not|doesn'?t|didn'?t)\s+(match|line up|agree|tie)\b[^.]{0,80}\b(fix|fixes|fixed|correct\w*|adjust\w*|updat\w*)\b[^.]{0,10}\b(the\s+)?(record|records|count|counts|system|on[- ]hand)\b`
- **A20 Brake repair:**
  - `\bbrake (jobs?|repairs?|work|service)\b`
  - `\b(repair\w*|replac\w*|bleed\w*|machin\w*|resurfac\w*|install\w*|do|does|did)\b[^.]{0,25}\bbrakes?\b`
  - Equivalent: `\b(replac\w*|install\w*|swap\w*|machin\w*|resurfac\w*|change\w*|do|does|did)\b[^.]{0,25}\b(brake )?(pads|rotors|brake calipers|calipers)\b`
- **A20 Suspension repair equivalent:** `\b(replac\w*|repair\w*|install\w*|swap\w*)\b[^.]{0,30}\b(struts?|shocks|shock absorbers|control arms?|ball joints?|coil springs?|sway bar links?)\b`
- **A21 Drywall installation:**
  - `\b(install\w*|hang\w*)\b[^.]{0,25}\b(drywall|sheetrock|gypsum board|wallboard)\b`
  - `\bdrywall (install\w*|hanging)\b`
- **A22 Executive calendar management:**
  - `\bcalendars?\b[^.]{0,40}\b(CEO|executives?|VPs?|vice presidents?|president|founder|directors?|partners?|principals?|leadership)\b`
  - `\b(CEO|executives?|VPs?|president|founder|directors?|partners?|principals?|leadership)\W{0,3}\w*\W{0,3}calendars?\b`
- **A22 Travel coordination:**
  - `\b(coordinat\w*|arrang\w*|plan\w*|manag\w*|handl\w*)\b[^.]{0,20}\btravel\b`
  - `\btravel (arrangements?|itinerar\w*|bookings?|logistics|plans?)\b`
  - Equivalents (booking for others):
    - `\bbook\w*\b[^.]{0,40}\b(flights?|hotels?|trips?|travel)\b[^.]{0,40}\b(for (her|him|them|their|the|our|my|each|every|all)\b|their\b)`
    - `\bbook\w*\b[^.]{0,15}\b(her|his|their|the (CEO|team|executives?)'?s?)\b[^.]{0,25}\b(flights?|hotels?|trips?|travel)\b`
- **A23 Social media account management:**
  - `\b(manag\w*|run\w*|handl\w*)\b[^.]{0,30}\b(social media|instagram|facebook|tiktok|linkedin|youtube)\b`
  - `\b(manag\w*|run\w*|handl\w*)\b[^.]{0,15}\baccounts?\b[^.]{0,40}\b(posts?|followers|DMs|comments|social)\b`
- **A23 Content creation:**
  - `\b(creat\w*|writ\w*|wrote|produc\w*|mak\w*|shoot|shot|film\w*|edit\w*|design\w*)\b[^.]{0,20}\bcontent\b`
  - plus the drafted photo/video pattern
- **A24 Venipuncture:**
  - `\bvenipuncture\b`
  - `(?<!arterial )\b(draw\w*|drew)\b(?![^.]{0,15}\barterial)[^.]{0,15}\bblood\b`
  - `\bblood draws?\b`
- **A25 Scheduling service appointments:** `\bschedul\w*\b[^.]{0,25}\b(appointments?|service calls?|visits?|jobs|installs?|customers?)\b`
- **A25 Dispatching technicians:** `\bdispatch(es|ed|ing)?\b[^.]{0,25}\b(techs?|technicians|crews?|installers|service|field)\b`
- **A26 Individual tax return preparation:**
  - `\bindividual\b[^.]{0,20}\b(returns?|tax\w*|1040s?)\b`
  - `\b1040s?\b`
- **A26 Small-business tax return preparation:**
  - `\bsmall[- ]business\b[^.]{0,20}\b(returns?|tax\w*)\b`
  - `\bbusiness (tax )?returns?\b`
  - Equivalents: `\b1120-?S\b`, `\b1065s?\b`, `\bS[- ]corp\w*\b[^.]{0,15}\breturns?\b`, `\bpartnership returns?\b`, `\bSchedule C\b`
