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

## Batch 2 owner decisions (2026-11-12, owner-approved; recognition proposals only, not implemented)

The approved part wording is unchanged. Nothing is implemented or active, and no list exists.

| # | Part (exact) | Owner decision |
|---|---|---|
| A19 | Inventory cycle counts | **Approved:** the revised inventory-specific patterns. Generic "count" never counts without inventory context |
| A19 | Reconciling inventory variances | **Approved:** the revised marker. **Conditionally approved:** the equivalent covering discovering count discrepancies, investigating their cause, and **personally** resolving or correcting them. Merely reporting a mismatch to someone else doesn't establish reconciliation. **The equivalent was partly fitted to fw-002, so that limitation is kept, and it needs the independent R4 evaluation before adoption** |
| A20 | Brake repair | **Approved:** the revised repair-specific patterns. Personally replacing brake pads or rotors counts as brake repair, even without every type of brake repair. Inspection alone, and unrelated uses of "brake" or "calipers", never count |
| A20 | Suspension repair | **Approved:** the revised suspension-specific patterns. Actual repair activity is required. Tie rods are removed as an equivalent. Sway-bar links count when personally repaired or replaced |
| A21 | Drywall installation | **Approved:** the drywall, sheetrock, gypsum-board and wallboard patterns |
| A21 | Drywall joint finishing | **Approved:** the joint-finishing patterns and equivalent |
| A22 | Executive calendar management | **Approved:** the revised executive-context patterns, with these interpretations:<ul><li>A manager's calendar **may** count when the evidence establishes executive-level scheduling responsibility.</li><li>An attorney's or physician's calendar doesn't count automatically because of the profession.</li><li>**When the role or responsibility level is unclear**, partial relevance is kept and a targeted clarification is asked, never automatic Supported.</li></ul> |
| A22 | Travel coordination | **Approved:** the revised patterns requiring actual coordination, or booking for others. Booking personal travel never establishes travel coordination for others |
| A23 | Social media account management | **Approved:** the revised social-media-specific patterns. Generic sales-account management never counts |
| A23 | Content creation | **Approved:** the revised patterns requiring actual creation, and the photo/video equivalent where the person creates the content |
| A24 | Venipuncture | **Approved:** the revised patterns. Arterial blood draws alone never establish venipuncture |
| A24 | Starting IV lines | **Approved** as proposed |
| A25 | Scheduling service appointments | **Approved:** the revised service-appointment patterns and the booking-appointments equivalent |
| A25 | Dispatching technicians | **Approved:** the revised technician and field-service patterns and "routing techs". Dispatching freight drivers alone never counts. Dispatching drivers who also do field-service technical work **may** be relevant when that role is explicitly evidenced; otherwise a clarification is asked |
| A26 | Individual tax return preparation | **Approved:** the revised tax-return patterns, including Form 1040 preparation |
| A26 | Small-business tax return preparation | **Approved:** the small-business patterns and the 1120-S, 1065, S-corp, partnership and Schedule C equivalents. **Form 1120 alone is never proof of a small-business return.** A C-corporation 1120 **may** qualify when the evidence establishes it was a small business's return and the person personally prepared it |

**For all of A19–A26:**
- the exact approved split wording is preserved;
- the clause-level ownership and third-party attribution safeguards stay;
- Supported never comes from a checkbox alone;
- equivalences aren't broadened beyond the reviewed scope;
- a targeted clarification is kept wherever evidence is ambiguous;
- D1–D3 and O1–O7 are preserved.

**Implementation notes, for when patterns are built (not now).** The "may count when the evidence establishes…" cases aren't pattern matches. The pattern excludes them, so they reach at most Possible, with a targeted clarification question:
- A22: a manager's calendar at executive level;
- A25: drivers who also do technical field work;
- A26: a small C-corporation's 1120.

Only an owner-approved follow-up rule could raise them.

## Batch 2 of 4: A19–A26 (presented 2026-11-12; decided above)

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

## Batch 3 owner decisions (2026-11-12, owner-approved for the recognition specification; not implemented)

All 7 proposed approvals and all 17 revisions are approved, subject to these interpretations. The approved part wording is unchanged. Nothing is implemented or active, and no list exists.

| # | Part (exact) | Owner decision |
|---|---|---|
| A51 | Pouring concrete flatwork | **Approved:** the revised patterns. Personally **placing, spreading or raking** concrete are relevant equivalents when the evidence establishes actual participation in placing flatwork. **Merely transporting concrete or materials, including wheelbarrowing without evidence of placement, doesn't establish pouring.** Finishing is never inferred from pouring or placing |
| A51 | Finishing concrete flatwork | **Approved:** the concrete-specific finishing, troweling, floating and edging patterns |
| A52 | Verifying invoices | **Approved:** the revised invoice- and bill-specific patterns |
| A52 | Approving invoices for payment | **Approved, only for evidence that the person exercised payment-approval authority themselves.** "Handling approvals", submitting invoices for approval, routing them, or asking someone else to approve doesn't count. Verb forms stay distinct from nouns ("approvals") |
| A53 | Building Excel financial models | **Approved:** the financial-model patterns, **but full Supported on this Excel-specific part needs evidence of Excel use.** Building financial models in another spreadsheet tool can be relevant transferable experience, justifying Possible with a clarification, but never establishes Excel proficiency automatically |
| A53 | Maintaining Excel financial models | **Approved, with the same Excel requirement.** Personally maintaining the model's assumptions, formulas or structure is distinct from merely using or reviewing an existing model |
| A54 | Configuring / Maintaining AWS cloud infrastructure | **Approved:** the revised AWS-object patterns. Generic setup, provisioning or maintenance isn't AWS infrastructure work |
| A55 | Designing RESTful APIs | **Approved:** the revised API- and endpoint-specific patterns, plus writing API contracts or OpenAPI specifications as design evidence |
| A55 | Developing RESTful APIs | **Approved:** the revised implementation patterns. Writing handlers, routes or endpoints can establish development; writing documentation or merely describing endpoints doesn't |
| A56 | Developing / Delivering sales presentations | **Approved:** the revised patterns. Personally creating presentations and personally delivering them to clients stay distinct |
| A57 | Installing / Maintaining security camera systems | **Approved:** the camera-system patterns. Installation and maintenance stay separate activities |
| A58 | Installing / Repairing residential plumbing | **Approved:** the plumbing-specific patterns. **Taking repair calls, or coordinating repair work, doesn't establish personally performing repairs** |
| A59 | Ordering / Managing pharmacy inventory | **Approved:** the revised pharmacy patterns. Personally ordering stock and managing inventory stay distinct |
| A60 | Planning / Executing paid search campaigns in Google Ads | **Approved:** the revised object-specific patterns. Keyword research may show planning; personally adjusting bids on active campaigns may show execution. Execution is never inferred from planning, or the reverse. **The Google Ads platform requirement is kept for full credit where the part names it** |
| A19 follow-up | Reconciling inventory variances | **Option (a):** the approved reconciliation equivalent stays unchanged and isn't fitted further to fw-002. fw-002 keeps Possible and the targeted clarification. The independent R4 evaluation decides whether the equivalent generalizes |

**For all batch 3 patterns:**
- the exact approved split wording is preserved;
- first-person activity ownership and clause-level attribution are required;
- evidence in another person's clause never establishes the person's experience;
- corrections, narrowed scope and contradictions are respected;
- Supported never comes from checkboxes alone;
- there are no broad equivalences;
- D1–D3 and O1–O7 are preserved.

**Implementation notes, for when patterns are built (not now):**
- **A51:** the placing equivalent (spread, rake, place, screed concrete) is approved. **"wheelbarrow" is removed from the candidate**: transporting alone doesn't count. On fw-101 ("I wheelbarrow the mud and spread it with a rake"), "spread it" still establishes placing.
- **A58:** "I take the … repair calls" is a coordination form, not a performance form. The noun-compound pattern ("… repair calls") added for the design probe is **dropped**. "Repair calls/jobs" alone stays below the repair part (Possible with a question).
- **A53 and A60:** these parts name a tool or platform (Excel, Google Ads). A part is shown for Supported only when the person's own clause also names it, in the same answer. A financial model or paid-search campaign without the named tool is **partial relevance**: Possible with a targeted clarification ("Was this model built in Excel?"). This adds a "named tool required" field to the approved-split data (spec §2), to be confirmed in the implementation design.

## Batch 3 of 4: A51–A60 (presented 2026-11-12; decided above)

**These are the lifecycle-pair splits:** two verbs on one object (pour/finish concrete, verify/approve invoices, build/maintain models…). So the drafted bare verbs fire anywhere in an answer:
- "pour" (wine service), "finish" (finishing school);
- "approve" (26 opened hits), "set up" (32);
- "maintain/service/repair" (54), "plan" (70, including "plant" and "plane");
- "develop/build/code" (121);
- "fix" ("fixtures").

**The consistent revision binds each verb to the requirement's own object:** the verb shortly before the object, or the verb on "them/it/each one" after the object is named. The reverse order (object, then verb) isn't used, because it crosses into another person's clause ("the forecasting model, **she built**"). Noun compounds are allowed where natural ("toilet repair calls", "water heater installs").

**Full re-simulation (V4b) with the revised patterns for batches 1–3** (26 splits; your approved batch 1 and 2 patterns plus these proposals):
- 0 false Supported across all partial, supervision and correction probes;
- **verdicts identical to the drafts**: no genuine probe or opened answer lost credit;
- the 6 labeled-supported opened answers that reach Supported are kept.

Where raw patterns still match a risk probe (for example "…the finishers do the troweling"), the clause attribution and correction rules remove it, as the simulation shows.

| # | Original requirement | Approved part (exact) | Draft | Candidate equivalent | Why valid | Generic-match / false-Supported risk (measured) | Genuine evidence possibly missed | Recommendation |
|---|---|---|---|---|---|---|---|---|
| A51 | Pour and finish concrete flatwork | Pouring concrete flatwork | "pour…" | placing concrete or slabs | Placing is pouring | "pour" fires on wine service and classroom answers (12 opened hits, all unrelated) | Opened fw-101 (labeled possible): "I wheelbarrow the mud and spread it with a rake ahead of the finishers" isn't shown by the revision (see the question) | **Revise:** pour, place or screed before concrete, slabs, flatwork, driveways, sidewalks, patios, floors or "mud" (12 → 0 unrelated) |
| | | Finishing concrete flatwork | "finish…" | troweling | Troweling is finishing | **"finish" fires on 22 opened answers** ("finished my degree") | — | **Revise:** finish, trowel, float or edge before the concrete objects (22 → 4, all concrete- or floor-related) |
| A52 | Verify and approve all invoices before payment | Verifying invoices | "verif…" | matching to POs | Matching invoices to POs is verification (a three-way match) | "verif…" fires on sanitation and license verification. **"Checked incoming trailers against the bills of lading"** isn't invoice verification | — | **Revise:** verify, check, match or audit before invoices or bills (never "bills of lading"). POs only as what they're compared against (tested). R2: counts as the person's own act |
| | | Approving invoices for payment | "approv…" | signing off on invoices or payments | Signing off is approving | **"approv…" fires on 26 opened answers.** The noun "approvals" ("I handle approvals…") and "submit for approval" aren't approving | — | **Revise:** verb forms only (approve, approves, approved, approving; sign off on) before invoices, bills, payments or check runs (tested: 26 → 0 unrelated; "I submit invoices for approval" excluded). R2: only the person's own approving |
| A53 | Build and maintain Excel financial models | Building Excel financial models | build, create or develop near "model(s)" | — | — | **Bare "models" fires on "build dbt models"** and would on ML models | — | **Revise:** a financial-model context (Excel, financial, forecast, three-statement, operating, budget, DCF, LBO, valuation, cash flow) or "model in Excel" (tested: dbt and ML excluded) |
| | | Maintaining Excel financial models | maintain or update near models or assumptions | — | — | Same "models" risk | — | **Revise:** as above; "assumptions" stays |
| A54 | Configure and maintain AWS cloud infrastructure | Configuring AWS cloud infrastructure | "configur…", "provision…", "set up" | — | — | **"set up" fires on 32 opened answers**; "provision" fires on a tax provision | — | **Revise:** configure, provision, set up or stand up before AWS objects (AWS, EC2, VPCs, RDS, IAM, S3, Lambda, ECS, EKS, CloudFormation, Terraform, infrastructure, instances, cloud) (38 → 2, both genuine) |
| | | Maintaining AWS cloud infrastructure | maintain, patch, upgrade | — | — | 14 opened hits ("maintain the dashboards") | — | **Revise:** maintain, patch or upgrade before AWS objects (14 → 0 unrelated) |
| A55 | Design and develop RESTful APIs | Designing RESTful APIs | "design…" | writing or defining API contracts or OpenAPI specs | Writing the contract or spec is API design | "design" fires on planograms and network design (13 opened hits) | — | **Revise:** design before APIs, endpoints, routes or API contracts. **Approve** the equivalent |
| | | Developing RESTful APIs | develop, build, implement, code | writing handlers or endpoints | Writing the handlers is development | **121 opened hits.** "Write up each endpoint" is documentation, and "write Postman collections for our API" is testing | — | **Revise:** develop, build, implement or code before APIs or endpoints, and "write" only for handlers, endpoints or routes, never "write up" (121 → 4, all genuine API building) |
| A56 | Develop and deliver sales presentations to clients | Developing sales presentations for clients | build, create, develop or put together near decks, presentations or slides | — | — | Already object-bound; 0 unrelated hits | — | **Approve** |
| | | Delivering sales presentations to clients | deliver, present, pitch | — | — | **"deliver…" fires on 15** ("delivery routes", "delivered units") | — | **Revise:** deliver, present, pitch or give before decks, presentations, pitches or demos, or "present to clients/prospects/customers/buyers". The opened labeled-supported answer (fw-076: "…present them in person or on Zoom") is kept (tested) |
| A57 | Install and maintain security camera systems | Installing security camera systems | install, mount | — | — | "mount" fires on tire mounting; "install" on panelboards | — | **Revise:** install, mount or wire before cameras, camera systems, CCTV, NVRs, DVRs or recorders (12 → 0 unrelated) |
| | | Maintaining security camera systems | maintain, service, repair | — | — | **54 opened hits** | — | **Revise:** maintain, service, repair, replace, re-aim or troubleshoot before the camera objects (54 → 2, both the opened answer's contractor clause, which attribution assigns to the contractor) |
| A58 | Install and repair residential plumbing | Installing residential plumbing | install, rough in | — | — | "rough in" fires on electrical roughing-in | — | **Revise:** install, rough in or plumb before plumbing objects (plumbing, pipes, fixtures, water heaters, toilets, faucets, sinks, supply or drain lines, bathrooms), or "… installs" (tested) |
| | | Repairing residential plumbing | repair, fix | — | — | **"fix" matches "fixtures"; 31 opened hits** | The design probe "I take the faucet and toilet **repair calls**" needed a noun-compound form (added). Opened fw-120 (labeled possible): "I take the faucet, toilet and garbage disposal jobs" names no repair verb, so it stays Possible with a question, as today | **Revise:** repair, fix (not "fixtures"), unclog, replace or snake before plumbing objects, or "… repair(s)/replacement(s)" (31 → 1, genuine) |
| A59 | Order and manage pharmacy inventory | Ordering pharmacy inventory | ordered/ordering; place orders; "I order" | — | — | "the physician ordered the drugs" (others' act; clause attribution handles it). **The noun "orders" read as the verb** ("review the orders and inventory reports") | "I place the **wholesaler** orders" needed one extra word allowed (added) | **Revise:** ordered/ordering, "I/we order" or purchase before inventory, stock, medications or the wholesaler, or "place (the) [word] orders"; never the noun "orders" (tested) |
| | | Managing pharmacy inventory | manage, rotate or track near inventory or stock | overstock returns; pulling expired drugs | Both are inventory-management acts | Object-bound; 0 unrelated hits | — | **Approve** the marker and both equivalents |
| A60 | Plan and execute paid search campaigns in Google Ads | Planning paid search campaigns in Google Ads | "plan…", "strateg…" | keyword research | Keyword research is campaign planning | **"plan" fires on 70 opened answers** (lesson plans, "plant", "plane") | — | **Revise:** plan, strategize or strategy before campaigns, keywords, Google Ads, ads or search (70 → 2, genuine). **Approve** the equivalent |
| | | Executing paid search campaigns in Google Ads | execute, run, launch or optimize near campaigns or ads | adjusting bids | Bid adjustment is campaign execution | Object-bound; the 2 unrelated hits are genuine ad-running answers | — | **Approve** the marker and equivalent |

**Batch 3 summary (by item):**
- **Approve:** 7.
- **Revise:** 17.
- **Reject:** 0.
- **Owner interpretation:** 4 questions, below.

**Owner interpretation questions:**
1. **A51:** does placing labor (wheeling, spreading or raking concrete) count as *Pouring concrete flatwork*? A candidate equivalent was tested. It makes the opened fw-101 answer (labeled possible) show the pouring part, but its verdict stays Possible either way, because finishing isn't shown and is the finishers' work. *Recommended: yes, as an equivalent, since placing concrete is part of the pour.*
2. **A52 (R2):** confirm that only the person's own approving counts (verb forms). "Handling approvals", "submitting for approval" and "routing for approval" don't. *Recommended: confirm.*
3. **A53:** must **Excel** be named, or does a financial model in another spreadsheet tool (Google Sheets) count? The revised pattern needs a financial-model context but not the word "Excel". *Recommended: the model counts; whether the tool must be Excel is your call.*
4. **A19 follow-up (your conditional approval in batch 2):** under clause-level attribution, the reader removes the conditional clause "If the numbers don't line up…" from fw-002. So the approved equivalent, which needs both halves in one clause, **never fires there**: fw-002 stays Possible with a targeted question. The options:
   - (a) keep it as approved: safe, and the question is asked;
   - (b) revise it to the own-clause form ("find out why … then fix/correct the record or count"), which fits that one answer even more closely.

   *Recommended: (a); let the independent R4 evaluation decide whether a broader form is justified.*

**Revised patterns (exact; scratch-tested, not adopted).**

*Building blocks:*
- **VO(verbs, objects)** = `\b(verbs)\b[^.]{0,40}\b(objects)\b` **or** `\b(objects)\b[^.]*\b(verbs)\s+(them|it|each one|each)\b`
- **Compound(objects, nouns)** = `\b(objects)\s+(nouns)\b`

*Object lists:*
- **CONC** = `concrete|slabs?|flatwork|driveways?|sidewalks?|patios?|floors?|mud`
- **INV** = `invoices?|bills?(?! of lading)`
- **MODEL** = `(excel|financial|forecast\w*|three-statement|operating|budget|DCF|LBO|valuation|cash flow)[\w-]*\s+models?|models?\s+in\s+excel`
- **AWS** = `AWS|EC2|VPCs?|RDS|IAM|S3|Lambda|ECS|EKS|CloudFormation|Terraform|infrastructure|instances|cloud`
- **API** = `APIs?|endpoints?|routes|handlers|API contracts?`
- **DECK** = `decks?|presentations?|slides|pitch(es)?|demos?`
- **CAM** = `cameras?|camera systems?|CCTV|NVRs?|DVRs?|recorders`
- **PLUMB** = `plumbing|pipes?|piping|fixtures|water heaters?|toilets?|faucets?|sinks?|supply lines?|drain lines?|drains?|bathrooms?|leaks?|clogs?|disposals?`
- **PHARM** = `inventory|stock|medications|meds|drugs|wholesaler`
- **ADS** = `campaigns?|keywords?|Google Ads|ads|ad groups?|search`

*Per part:*
- **A51 Pouring:** VO(`pour\w*|plac\w*|screed\w*`, CONC). Candidate, Q1: VO(`spread\w*|rak\w*|wheelbarrow\w*`, CONC)
- **A51 Finishing:** VO(`finish(es|ed|ing)?|trowel\w*|float\w*|edg(e|es|ed|ing)`, CONC)
- **A52 Verifying:** VO(`verif\w*|check\w*|match\w*|audit\w*`, INV)
- **A52 Approving:** VO(`approv(e|es|ed|ing)|sign(s|ed|ing)? off( on)?`, INV|`payments?|check runs?`)
- **A53 Building:** VO(`buil\w*|creat\w*|develop\w*|design\w*`, MODEL), gap 45
- **A53 Maintaining:** VO(`maintain\w*|updat\w*|refresh\w*|roll\w* forward`, MODEL|`assumptions`), gap 45
- **A54 Configuring:** VO(`configur\w*|provision\w*|set\w* up|stood up|stand\w* up|deploy\w* (the |our )?infrastructure`, AWS)
- **A54 Maintaining:** VO(`maintain\w*|patch\w*|upgrad\w*`, AWS)
- **A55 Designing:** VO(`design\w*`, API)
- **A55 Developing:** VO(`develop\w*|build\w*|built|implement\w*|cod(e|es|ed|ing)`, API), plus `\b(writ(e|es|ing)|wrote)\b(?!\s+up)[^.]{0,25}\b(handlers|endpoints?|routes)\b`
- **A56 Delivering:** VO(`deliver\w*|present(s|ed|ing)?|pitch(es|ed|ing)?|giv(e|es|ing)|gave`, DECK), plus `\bpresent(s|ed|ing)?\b[^.]{0,10}\bto (clients?|prospects?|customers?|buyers?|purchasing|the client)\b`
- **A57 Installing:** VO(`install\w*|mount\w*|wir(e|es|ed|ing)`, CAM)
- **A57 Maintaining:** VO(`maintain\w*|servic\w*|repair\w*|replac\w*|re-?aim\w*|troubleshoot\w*`, CAM)
- **A58 Installing:** VO(`install\w*|rough\w* in|plumb\w*`, PLUMB), plus Compound(PLUMB, `install(s|ations?)?`)
- **A58 Repairing:** VO(`repair\w*|fix(es|ed|ing)?|unclog\w*|replac\w*|snak\w*`, PLUMB), plus Compound(PLUMB, `repairs?|replacements?`)
- **A59 Ordering:** VO(`order(ed|ing)?|I order|we order|purchas\w*`, PHARM), gap 30, plus `\bplac\w* (the |our )?([\w-]+ )?orders?\b`
- **A60 Planning:** VO(`plan(s|ned|ning)?|strategi\w*|strategy`, ADS)

## Batch 4 owner decisions (2026-11-12, owner-approved for the recognition specification; not implemented)

The 5 approvals and 9 revisions are approved, subject to these clarifications. The approved part wording is unchanged. Nothing is implemented or active.

| # | Part (exact) | Owner decision |
|---|---|---|
| A63 | Cutting hair | **Approved:** the revised hair-specific patterns. Cutting, trimming or fading hair must be the person's own activity. Unrelated cutting (plasma, pipe, glass) never counts |
| A63 | Styling hair | **Approved:** personally blow-drying, blowouts and updos count as hairstyling. They don't establish haircutting. **"Stylist" is never proof that the person performed styling** |
| A67 | Loading freight onto trucks | **Approved:** the revised freight- and truck-specific patterns. Personally stacking freight onto trucks may establish loading |
| A67 | Unloading freight from trucks | **Approved:** the revised patterns. Personally unloading, or breaking down trailers, may establish unloading. **Loading and unloading stay distinct; neither is inferred from the other** |
| A76 | CNC lathe setup | **Approved:** the revised CNC-lathe patterns, including touching off tools, setting offsets, and genuine lathe setups. Generic machine setup unrelated to CNC lathes never counts |
| A76 | CNC lathe operation | **Approved:** the revised operation patterns with CNC-lathe context. Operating unrelated machines never counts |
| A77 | Accounts receivable aging analysis | **Conditionally approved:** the aging-report-specific patterns. Personally **analyzing** overdue balances, aging categories, outstanding receivables, payment trends or collection priorities can establish aging analysis. **There's no blanket exception for "review."** Merely receiving, opening, forwarding or reading an aging report doesn't count. Reviewing another person's analysis stays oversight unless the person shows their own analysis |
| A77 | Accounts receivable collections | **Approved:** the revised collections patterns. Personally contacting past-due customers, collecting outstanding payments, or resolving receivable balances may establish collections. Unrelated meanings of "collections" never count |
| A93 | Forecasting | **Approved:** the revised own-work patterns. Using someone else's forecast (for scheduling, say), or reviewing an existing forecast, doesn't establish preparing forecasts |
| A93 | Budgeting | **Approved:** the revised own-work patterns. Personally developing, preparing or setting budgets may establish budgeting. Managing spending against an existing budget, entering figures into a template, or providing inputs to another person's budget is **relevant but not full ownership**: Possible with a targeted clarification, unless the person explicitly contradicts owning the activity |
| Q4 | Elided objects and pronouns ("it", "them") | **Conditionally approved as a design.** An object may be inherited **only from a clearly attributable earlier clause describing the person's own activity**. It's never inherited from: another person's work; a contradicted or retracted claim; an unrelated activity; or an ambiguous reference with several plausible objects. Corrections and narrowed scope take precedence over earlier claims. An ambiguous reference keeps its uncertainty and gets a targeted clarification, never Supported. Targeted probes are required for "I only unload", "I just present them", "I only keep the calendars", "I just count", pronouns referring to another person's work, corrections that cancel an earlier activity, and several possible antecedents |

## Batch 4 of 4 (final): A63, A67, A76, A77, A93 (presented 2026-11-12; decided above)

The same method: verbs bound to the requirement's own object, tested on the design probes, each split's opened answer, and all 1,266 opened answers.

| # | Original requirement | Approved part (exact) | Draft | Candidate equivalent | Why valid | False-Supported / generic risk (measured) | Possible genuine loss | Recommendation |
|---|---|---|---|---|---|---|---|---|
| A63 | Cut and style hair | Cutting hair | "cut…" | fades, trims | Fades and trims are haircuts | **"cut" fires on 32 opened answers** (plasma cutting, cutting pipe, cutting glass) | — | **Revise:** cut, trim, fade or shape before hair, bangs, beards, clients, layers, bobs, fades…, "haircut(s)", or "do the cuts/fades/trims" (32 → 1, a cosmetology answer). The opened assistant answer ("blow-dry once **they** finish cutting") correctly no longer shows cutting |
| | | Styling hair | "styl…" | blow-dry; blowout; updo | Blowouts and updos are styling services | "styl…" matches "stylist" (an agent noun, which the attribution rule excludes) | — | **Revise:** verb forms only (style, styles, styled, styling). **Owner interpretation** on blow-drying (Q1) |
| A67 | Load and unload freight from trucks | Loading freight onto trucks | "load(ed/ing)" | stacking or staging pallets onto trucks | Putting freight onto the truck is loading | **"load" fires on 17 opened answers** ("load the programs", "load the jaws", "load boards") | — | **Revise:** load before trucks, trailers, freight, pallets, vans, containers, deliveries, shipments or outbound (17 → 3, all genuine). **Approve** the equivalent |
| | | Unloading freight from trucks | "unload…" | breaking down inbound trailers | Breaking down a trailer is unloading it | 7 hits, mostly genuine forklift unloading | "I only unload" (with the object named earlier in the answer) is no longer shown; see Q4 | **Revise:** unload before the freight objects. **Approve** the equivalent |
| A76 | CNC lathe setup and operation | CNC lathe setup | "set up"; "setup(s)" | touching off tools; setting offsets | Touching off and setting offsets are lathe setup steps | **"set up" fires on 32 opened answers;** "setups" on internal controls and monitoring | **"I do the lathe setups"** needed a noun-compound form (added, tested). "The setup guy does the setups" stays someone else's work | **Revise:** set up or setup(s) before lathes, CNC, machines, jobs, chucks, jaws, tools, programs or parts, or "lathe/CNC/machine/job setup(s)". **Approve** the equivalents |
| | | CNC lathe operation | operate, run | — | — | **"run/operate" fires on 147 opened answers** | — | **Revise:** operate or run before lathes, CNC, machines, jobs, parts or production ("run parts", the machinist idiom, counts) (147 → 16; the rest are genuine machine operation in other requirements) |
| A77 | Accounts receivable aging and collections | Accounts receivable aging analysis | "aging" | — | — | 0 unrelated hits. **But "I review the aging report" is blocked by the review-verb rule**, although reviewing the report *is* aging analysis | See Q2 | **Approve** the marker. **Owner interpretation** on review verbs (Q2) |
| | | Accounts receivable collections | "collect…" | calling or chasing past-due or overdue balances | Calling past-due customers is collections work | "collect…" fires on "Postman collections", "collected evidence" and "collects the SOC 2 evidence" | **"I … handle collections"** needed a form without an object (added, tested) | **Revise:** collect before payments, receivables, past-due, balances, accounts, invoices, money, debts or customers, or "collection calls", "collections work/queue", "handle/do/work the collections" (6 → 0 unrelated). **Approve** the equivalent |
| A93 | Forecasting and budgeting | Forecasting | "forecast…" | projections | Building projections is forecasting | "forecast" fires on **a weather forecast** and **"I use the forecast to schedule staff"** (using a forecast isn't forecasting) | — | **Revise:** an own-work verb (build, prepare, create, develop, run, produce, update, do, handle, own, model, set, draft) before forecasts, forecasting or projections, or "I/we forecast" (tested: weather and using-a-forecast excluded) |
| | | Budgeting | "budget…" | spending plan | A spending plan is a budget | "budget" fires on **"I manage the department budget"** (spending within a budget) and PMP rollout budgets. **R5: "fill in the budget template" must not count** | — | **Revise:** an own-work verb before budget(s), budgeting or spending plans. "Fill in the template" and "give my numbers" excluded, per R5 (tested). **Owner interpretation** on managing an existing budget (Q3) |

**Batch 4 summary (by item):**
- **Approve:** 5 (A67's two equivalents, A76's setup equivalents, A77 "aging", A77's past-due equivalent).
- **Revise:** 9.
- **Reject:** 0.
- **Owner interpretation:** 4 questions:
  1. **A63:** do blow-drying, blowouts and updos count as *Styling hair*? The opened assistant answer (fw-065, labeled possible: "I shampoo the clients, mix color for the stylists and blow-dry once they finish cutting") would show styling only, and stays Possible. *Recommended: yes. A blowout is a styling service, and cutting stays separately required.*
  2. **A77:** should reviewing, analyzing, flagging or working the AR aging report count as *Accounts receivable aging analysis*, as an exception to the review-verb rule like R2? Reviewing the report is the analysis itself. Reviewing **other people's** work (for example "the collectors' notes") stays oversight, and collections stays a separate part. *Recommended: yes, limited to the aging report as the object.*
  3. **A93:** does managing or tracking spending against an **existing** department budget count as *Budgeting*? The revision excludes it, so it gives Possible with a clarification. *Recommended: not by itself. Budgeting means building or setting the budget.*
  4. **Attribution design (all splits):** an elided or pronoun object. A narrowed or second clause sometimes names only the verb, with the object earlier in the same answer. Examples: "I load and unload trucks … **I only unload**"; "I do cycle counts … **I just count**"; "marketing builds the decks, **I just present them**". *Proposed rule (spec, not a pattern):* a part's verb in the person's own clause, with no object or with "them/it", counts when the person's own earlier clause in the same answer names that part's object. It never counts through someone else's clause. *Recommended: approve for the spec, with the four probe cases as tests. Today these stay Possible with a question; no verdict changes.*

## Reconciliation of all 33 approved splits (2026-11-12)

A script compared three sources:
- the owner-approved part wording, from the split review's decision tables;
- the owner-decision tables of R1 batches 1–4;
- the patterns used in the simulations.

| Check | Result |
|---|---|
| Approved splits / parts | 33 / 66 |
| Split wording changed anywhere | **No.** Every approved part appears verbatim in the split review, and the simulation inputs use the identical wording |
| R1 decision rows using non-approved part wording | **None** |
| Parts with an owner recognition decision | **62 of 66.** 50 in rows with their exact wording; 12 in the six grouped batch 3 rows (A54, A56, A57, A58, A59, A60), which your batch 3 message also grouped |
| **Parts without a recognition decision** | **4: P13 (*Recruiting staff*, *Hiring staff*) and P14 (*Recruiting new staff*, *onboarding new staff*).** My batching (P1–P12, then A19–A26, A51–A60, A63–A93) left these two Group 1 splits out of every R1 batch. They are presented below as a supplementary batch |

## Supplementary batch owner decisions (P13, P14; 2026-11-12, owner-approved for the recognition specification; not implemented)

The approved part wording is unchanged. Nothing is implemented or active.

| # | Part (exact) | Owner decision |
|---|---|---|
| P13 | Recruiting staff | **Approved:** the revised patterns. Personally sourcing or screening employment candidates may establish recruiting, and recruiting applicants for staff positions qualifies. **Recruiting volunteers alone doesn't count, and neither does the noun "recruiter" alone** |
| P13 | Hiring staff | **Approved (R2, narrow):** personally selecting candidates, making or directly taking part in hiring decisions, or extending authorized employment offers may establish hiring. **Merely recommending candidates, observing interviews, forwarding paperwork, or engaging contractors for services doesn't count.** The R2 exception stays narrow; management verbs aren't broadly exempted from oversight checks |
| P14 | Recruiting new staff | **Approved:** the same patterns and interpretations as P13 *Recruiting staff* |
| P14 | onboarding new staff | **Approved:** personally conducting new-hire onboarding or employee orientation qualifies. **Passenger onboarding, merely receiving onboarding paperwork, or processing administrative paperwork alone doesn't count as conducting employee onboarding** (the pattern now excludes "onboarding paperwork/forms/packets/documents") |

## Supplementary batch (P13, P14), omitted from batches 1–4 (presented 2026-11-12; decided above)

The same method; tested on the design probes and all 1,266 opened answers. R2 applies to *Hiring staff*.

| # | Original requirement | Approved part (exact) | Draft | Candidate equivalent | Why valid | Risk (measured) | Possible genuine loss | Recommendation |
|---|---|---|---|---|---|---|---|---|
| P13 | Recruiting and hiring staff | Recruiting staff | "recruit…" | sourcing or screening candidates, applicants or resumes | Sourcing and screening is recruiting | "recruit…" matches **"recruiter"** (an agent noun) and **recruiting volunteers** | — | **Revise:** recruit before staff, employees, candidates, applicants, hires, or named roles (nurses, drivers, techs…), or "do/handle/run the recruiting". Volunteers excluded (Q-P1). **Approve** the equivalent |
| | | Hiring staff | "hire/hired/hiring" | making offer decisions; extending offers | Offer decisions are hiring decisions | **"hire" fires on 19 opened answers, including the noun "new hires".** "We hired a contractor" is engaging a service (O2), not hiring staff | — | **Revise (R2):** personally hiring people ("I hire the seasonal cashiers"), "make the (final/hiring/offer/selection) decisions", "decide/choose who we hire", "extend offers". **Never** the noun "new hires", hiring a contractor or firm, recommending candidates, sitting in on interviews, or submitting hiring paperwork (all tested). "The owner decides who we hire" matches only in the owner's clause, which attribution assigns to the owner. Note: today's reader reads "I hire the staff" as overseeing; R3 F5 is needed before these patterns can reach Supported |
| P14 | Recruiting and onboarding new staff | Recruiting new staff | as P13 | as P13 | as P13 | as P13 | — | **Revise** as P13. **Approve** the equivalent |
| | | onboarding new staff | "onboard…" | new-hire orientation | Running new-hire orientation is onboarding | "onboarding" matches **onboarding passengers** (an air-traffic answer) | "I onboard every **new hire**" (singular) needed adding (done, tested) | **Revise:** onboard people (staff, employees, new hire(s)…), "new-hire onboarding", "onboarding (of) new staff". **Approve** "new-hire orientation", and add "run/lead/give the orientation for new employees" (tested) |

**Owner questions:**
- **Q-P1:** does recruiting **volunteers** count as *Recruiting staff*? *Recommended: no, not automatically (Possible with a clarification).*
- **Q-P2:** confirm the R2 boundary for *Hiring staff* as listed above: direct hiring decisions count; recommending, sitting in, and paperwork don't.

**Effect:** in the V5 simulation, P13 and P14 have 0 false Supported, and every genuine probe is kept. P13's own-wording probe stays blocked until R3 F5 (the reader reads "hire" as overseeing).

**Revised patterns (exact; scratch-tested, not adopted).** PEOPLE = `staff|employees?|candidates?|applicants?|new hires?|hires|nurses|drivers|techs|technicians|cashiers|servers|team members|people|workers|associates|caregivers|teachers|crew`
- **Recruiting (P13 and P14):**
  - `\brecruit(s|ed|ing)?\b[^.]{0,25}\b(PEOPLE)\b`
  - `\b(do|does|did|handl\w*|run\w*|own\w*)\s+(the\s+|all\s+the\s+|our\s+)?recruiting\b`
  - Equivalent: `\b(sourc\w*|screen\w*)\b[^.]{0,25}\b(candidates?|applicants?|resumes?)\b`
- **Hiring staff:**
  - `\b(hire|hires|hired|hiring)\b\s+(the\s+|our\s+|all\s+(the\s+)?|new\s+|every\s+)?([\w-]+\s+)?(PEOPLE)\b`
  - `\b(make|makes|made|making)\b[^.]{0,20}\b(hiring|final|offer|selection)\s+decisions?\b`
  - `\b(decide|decides|decided|choose|chooses|chose|select|selects|selected|pick|picks|picked)\s+(who|which\s+\w+)\s+(we\s+|to\s+)?(hire|bring on)\b`
  - `\bextend\w*\s+(the\s+)?offers?\b`
- **onboarding new staff:**
  - `\bonboard(s|ed|ing)?\b[^.]{0,25}\b(PEOPLE)\b`
  - `\bnew[- ]hire onboarding\b`
  - `\bonboarding\s+(of\s+)?(all\s+)?(new\s+)?(PEOPLE)\b`
  - Equivalents: `\bnew[- ]hire orientation\b` and `\b(run\w*|lead\w*|led|do|does|did|give\w*|gave)\b[^.]{0,15}\borientation\b[^.]{0,20}\b(new\s+)?(PEOPLE)\b`

## Full recognition re-simulation, all 33 splits (scratch; opened data and design probes only)

**Patterns used:**
- batches 1–3 as you approved them, including P12 shrubs and hedges, the conditional A19 equivalent, A51 placing without "wheelbarrow", and A58 without the "repair calls" compound;
- batch 4 as proposed above.

The named-tool requirement (A53 Excel, A60 Google Ads) isn't simulated yet.

**Results (V4b design):**
- **0 false Supported** across all 132 partial, supervision and correction probes.
- **0 verdict changes against the drafts:**
  - genuine both-parts probes: 63 of 66 Supported;
  - partial probes: 62 of 66 Possible, 4 Not enough information;
  - the 6 labeled-supported opened answers stay Supported, with no labeled losses.

**Part-level attribution changes against the drafts: 10, none changing a verdict.**
- **Intended by your decisions (5):**
  - A51: "spread it" now shows pouring (opened fw-101 and its correction probe);
  - A58: "repair calls" no longer shows repairing;
  - A93: "fill in the budget template" no longer shows budgeting (R5);
  - A59: "the wholesaler orders" is now recognized.
- **Narrowed wording no longer attributed (5), each Possible with a targeted question:**
  - "I just count" (A19), "I only unload" (A67) and "I just present them" (A56): addressed by Q4;
  - "I only keep the calendars" (A22): no executive context in that clause; under Q4 the earlier "executive calendars" would supply it;
  - "I just hang the board" (A21): your batch 2 decision limited the objects to drywall, sheetrock, gypsum board and wallboard; Q4 would not change this.

Evidence: `ai-service/evals/reports/m11/structured/r1-recognition-simulation.json`.

**Batch 4 revised patterns (exact; scratch-tested, not adopted).** VO(verbs, objects) is as defined in batch 3.

*Object lists:*
- **HAIR** = `hair|bangs|beards?|clients?|customers?|layers|bobs?|pixies?|fades|kids|men|women`
- **FREIGHT** = `trucks?|trailers?|freight|pallets?|vans?|containers?|deliveries|shipments|outbound|inbound`
- **LATHE** = `lathes?|CNC|machines?|jobs?|chucks?|jaws|tool(s|ing)?|programs?|parts|production`
- **AR** = `payments?|receivables|past[- ]due|overdue|balances?|accounts|invoices|money|debts?|customers`
- **OWN** = `build\w*|built|prepar\w*|creat\w*|develop\w*|run\w*|produc\w*|updat\w*|do|does|did|handl\w*|own(s|ed)?|model\w*|set(s|ting)?|draft\w*`

*Per part:*
- **A63 Cutting:** VO(`cut(s|ting)?|trim(s|med|ming)?|fad(e|es|ing)|shap\w*`, HAIR), plus `\bhaircuts?\b` and `\b(do|does|did|doing)\s+(the\s+|all\s+the\s+)?(cuts|fades|trims)\b`
- **A63 Styling:** `\bstyl(e|es|ed|ing)\b`. Q1 equivalents: `\bblow-?dr\w*`, `\bblowouts?\b`, `\bupdos?\b`
- **A67 Loading:** VO(`load(ed|ing)?|I load|we load`, FREIGHT). Equivalent: `\b(stag\w*|stack\w*)\b[^.]{0,25}\bonto (the )?(delivery )?(trucks?|trailers?)\b`
- **A67 Unloading:** VO(`unload\w*`, FREIGHT). Equivalent: `\bbreak\w* down (the )?(inbound )?trailers\b`
- **A76 Setup:** VO(`set(ting)? ?up|setups?`, LATHE), plus `\b(lathe|CNC|machine|job)\s+set[- ]?ups?\b`. Equivalents: `\btouch\w* off\b`, `\bset\w* (the )?offsets\b`
- **A76 Operation:** VO(`operat\w*|run(s|ning)?|ran`, LATHE)
- **A77 Aging analysis:** `\baging\b`
- **A77 Collections:** VO(`collect(s|ed|ing)?`, AR), plus:
  - `\bcollection calls?\b`
  - `\bcollections (calls?|work|queue|accounts)\b`
  - `\b(handl\w*|do|does|did|doing|work\w*|run\w*)\s+(the\s+|all\s+the\s+|our\s+)?collections\b`
  - Equivalent: `\b(call\w*|chas\w*)\b[^.]{0,30}\b(past[- ]due|overdue)\b`
- **A93 Forecasting:** VO(OWN, `forecasts?|forecasting|projections?`), plus `\b(I|we)\s+forecast\b`
- **A93 Budgeting:** VO(OWN, `budgets?|budgeting|spending plans?`)
