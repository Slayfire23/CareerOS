# Equivalence Review — Batch 1 of 5: Finance and Office (9 groups)

November 7, 2026. **For your decisions. Nothing is approved, and no file has changed.**

## How this batch was checked

For each group, I simulated "what if this were approved", using the production answer reader in its evaluation-only `assumeApproved` mode.

1. **Historical answers.** Every answer in the spent fixtures, the opened follow-up splits and the ownership benchmark was read twice: as today, and with the groups approved. That's 1,266 answers in all. A change is listed under a group when the approved reading cites that group.
2. **Probes.** Sentences that must qualify and sentences that must not, read before and after approval. The must-not sentences include:
   - an introductory class, supervising, helping, someone else, a negation and a hypothetical, written from each group's own phrases;
   - ordinary-sense wordings written for that group.

The shared answer boundary runs first, as it does in production. Anything it stops (someone else, negations, hypotheticals, supervising, instructions) never reaches a group.

**Today, unapproved:** a group can only make an answer *related*, so Possible.
**Approved:** a match grants **Supported, Self-reported.** The person's own words must match one of the group's phrases or patterns.

### What the probes show for every group in this batch

| Must not qualify | What happened |
|---|---|
| Someone else, negation, hypothetical, supervising, helping | **Blocked** in all 9 groups, by the shared boundary |
| An introductory class ("a one-day class where we practiced…") | **Possible, never Supported.** That's your existing rule for a skill (limited familiarity) |
| **Ordinary-sense wording that fits a verb–object pattern** | **Supported in all 9 groups if approved as written.** For example, "I keep the books on the shelves at the library" counts as bookkeeping, and "I enter the data center through the badge door" as data entry |

**The patterns are the risk.** A pattern is a listed verb up to seven words before a listed object. Exact phrases are much safer, though not entirely: "kept the books" is still a library sentence too.

**My recommendation for this batch: revise.**
- Approve only the exact phrases.
- Remove the free patterns.
- Remove ambiguous objects like "books", "wages", "vendors", "customers", "register", "data" and "the month".

The cost is some recognition: the one historical answer this batch would change only matches through a pattern (bank reconciliation, below).

### Found along the way (not about groups)

These come from today's word matching. They'll be tracked separately, and no fix is made here.
- **"I collect timesheets and send them to the payroll company"** gets **Supported** for "Payroll processing" today, because the requirement's word appears in "payroll company", which is someone else.
- **"I manage the budget for the office holiday party"** gets **Supported** for "Budgeting" today.
- **"I paid vendor invoices every week"** gets nothing for "Accounts payable". The boundary rule for work sent elsewhere reads "paid … vendor" as paying an outside vendor to do the work. That's legitimate experience missed, and approving the group can't help until that rule is fixed.

## The groups

### 1. bookkeeping

| | |
|---|---|
| **Requirement names** | bookkeeping · general ledger · ledger maintenance |
| **Exact phrases** | kept the ledgers · kept the ledger · kept the books · maintained the ledger · maintained ledgers · posted journal entries · posted entries to the ledger · posted to the ledger |
| **Patterns** | verbs keep / post / maintain, followed by objects ledger · ledgers · books · journal entries |
| **Related (Possible only)** | recorded receipts · filed invoices |
| **Source** | O\*NET 43-3031.00, "Transfer details from separate journals to general ledgers…" |

- **Should qualify:** "I post our daily sales to the general ledger and keep the books for two shops." Possible today, Supported if approved. ✓
- **Must not qualify:**
  - "I keep the books on the shelves in order at the library." **Supported if approved** ✗
  - "I maintain the ledger of tool checkouts in the shop." **Supported if approved** ✗
  - "Our accountant keeps the books; I file the receipts." Nothing either way ✓
- **Historical cases that would change:** none.
- **Risk:** "books" and "ledger" have ordinary meanings. "Kept the books" is an idiom, but it's also literal.
- **Recommendation: revise.**
  - Keep: maintained the ledger · maintained ledgers · posted journal entries · posted entries to the ledger · posted to the ledger.
  - Remove: "kept the books" and the patterns.
  - Restrict any pattern to the objects "general ledger" and "journal entries".

### 2. payroll

| | |
|---|---|
| **Requirement names** | payroll · payroll processing · process payroll · run payroll |
| **Exact phrases** | calculated wages · computed wages · prepared paychecks · processed paychecks · issued paychecks · cut paychecks · ran paychecks · ran payroll |
| **Patterns** | prepare / process / issue / calculate / compute / cut, followed by paychecks · wages |
| **Related** | collected / tracked / entered timesheets |
| **Source** | O\*NET 43-3051.00, "Process and issue employee paychecks…" |

- **Should qualify:** "Every other Friday I calculate wages from the timesheets and issue paychecks for 40 people." Possible today, Supported if approved. ✓
- **Must not qualify:** "I calculate wages for our labor cost forecast each quarter." **Supported if approved** ✗. That's analysis, not payroll.
- **Historical cases that would change:** none.
- **Risk:** "wages" fits forecasting and budgeting work.
- **Recommendation: revise.**
  - Keep the paycheck phrases and "ran payroll".
  - Move "calculated wages" and "computed wages" to *related* (Possible).
  - Drop the patterns, or keep them with the object "paychecks" only.

### 3. accountspayable

| | |
|---|---|
| **Requirement names** | accounts payable |
| **Exact phrases** | paid vendor invoices · paid supplier invoices · processed vendor invoices · processed supplier invoices · paid vendors · ran payment batches · matched invoices to purchase orders |
| **Patterns** | pay / process, followed by vendor invoices · supplier invoices · vendors |
| **Related** | filed invoices |
| **Source** | O\*NET 43-3031.00, "Match order forms with invoices, and record the necessary information." |

- **Should qualify:**
  - "I match invoices to purchase orders and pay vendors twice a week." Possible, then Supported. ✓
  - "I paid vendor invoices every week at my last job." **Nothing, even if approved.** The boundary issue above.
- **Must not qualify:** "I process vendors' onboarding forms for procurement." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Recommendation: revise.**
  - Keep the invoice phrases, "ran payment batches", and "matched invoices to purchase orders".
  - Remove "paid vendors", and the object "vendors" from the patterns.
  - Separately, the "paid … vendor" boundary rule needs a fix, or this group's main phrase never counts.

### 4. accountsreceivable

| | |
|---|---|
| **Requirement names** | accounts receivable · a/r |
| **Exact phrases** | billed customers · sent customer invoices · issued customer invoices · collected overdue accounts · collected overdue payments · chased overdue invoices · posted customer payments |
| **Patterns** | bill / invoice / collect / chase, followed by customers · overdue accounts · overdue invoices · overdue payments |
| **Related** | answered billing questions |
| **Source** | O\*NET 43-3011.00, "Locate and monitor overdue accounts…" |

- **Should qualify:** "I bill customers at month-end and chase overdue invoices." Possible, then Supported. ✓
- **Must not qualify:**
  - "I collect customers' coats at the front desk." **Supported if approved** ✗
  - "I chase customers who leave without paying for gas." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Recommendation: revise.**
  - Keep the exact phrases.
  - Remove the object "customers" from the patterns. Keep the patterns for the "overdue …" objects.

### 5. bankreconciliation

| | |
|---|---|
| **Requirement names** | bank reconciliation · bank reconciliations |
| **Exact phrases** | reconciled bank statements · reconciled the bank statements · reconciled accounts to the bank · reconciled accounts to the bank statements · matched bank statements |
| **Patterns** | reconcile / match, followed by bank statement(s) · statement activity |
| **Source** | O\*NET 43-3021.00, "Compare previously prepared bank statements with canceled checks and reconcile discrepancies." |

- **Should qualify:** "Each month I reconcile the operating account to the bank statements." Possible, then Supported. ✓
- **Must not qualify:** "I match bank statements to the right folders before filing them." **Supported if approved** ✗
- **Historical case that would change** (1, unlabeled): "Each month I matched the statement activity for our six checking accounts line by line to the ledger and cleared outstanding deposits and uncashed checks." Possible, then **Supported**. This is genuine reconciliation work, and it matches only through the "match … statement activity" pattern.
- **Recommendation: revise.**
  - Keep the "reconcile" phrases and patterns.
  - Remove "matched bank statements" and the verb "match". That would lose the historical case above, which stays Possible.
  - Alternative: keep "match" with the object "statement activity" only.

### 6. monthendclose

| | |
|---|---|
| **Requirement names** | month-end close · month end close · managing the month-end close |
| **Exact phrases** | closed the books · closed the month · ran the month-end close |
| **Patterns** | close / run, followed by the books · the month · month-end |
| **Source** | O\*NET 13-2011.00, "Prepare, examine, or analyze accounting records…" |

- **Should qualify:** "I close the books every month: accruals, reconciliations and the trial balance." Possible, then Supported. ✓
- **Must not qualify:**
  - "I ran the month-end inventory count in the warehouse." **Supported if approved** ✗
  - "I close the month's schedule in the staffing app." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Recommendation: revise.**
  - Keep "closed the books" and "ran the month-end close".
  - Remove "closed the month" and the patterns.

### 7. budgeting

| | |
|---|---|
| **Requirement names** | budgeting · budget preparation · prepare budgets · budget management |
| **Exact phrases** | prepared budgets · prepared the budget · built the budget · managed the budget · drew up the budget |
| **Patterns** | prepare / build / manage, followed by budget · budgets |
| **Related** | collected receipts |
| **Source** | O\*NET 13-2031.00, "Analyze monthly department budgeting…" |

- **Should qualify:** "I build the annual budget for our department and track spending against it." Already **Supported today** through the requirement's own word.
- **Must not qualify:** "I manage the budget for the office holiday party." Already **Supported today**. Approving changes nothing.
- **Historical cases that would change:** none.
- **What it adds:** almost nothing. Most budgeting answers contain "budget", which already counts through the word itself.
- **Recommendation: reject** as unnecessary. The real issue is word matching on trivial budgets, and that's tracked separately above.

### 8. cashhandling

| | |
|---|---|
| **Requirement names** | cash handling · handling cash |
| **Exact phrases** | balanced the register · balanced the till · counted the register · counted the till · handled cash · counted cash · reconciled the cash drawer |
| **Patterns** | balance / count / handle, followed by register · till · cash · cash drawer |
| **Source** | O\*NET 41-2011.00, "Receive payment by cash, check, credit cards…" |

- **Should qualify:** "I count the till at open and close and balance the register every shift." Possible, then Supported. ✓
- **Must not qualify:** "I balance the register tape rolls in the supply closet." **Supported if approved** ✗. The risk is small, because the phrasing is unusual.
- **Historical cases that would change:** none.
- **Recommendation: approve with one revision.** Remove "register" as a pattern object. Keep the exact phrases, and the till, cash and cash-drawer patterns.

### 9. dataentry

| | |
|---|---|
| **Requirement names** | data entry |
| **Exact phrases** | keyed records · keyed in records · entered records · typed records into · entered data into |
| **Patterns** | key / enter / type, followed by records · data |
| **Source** | O\*NET 43-9021.00, "Locate and correct data entry errors…" |

- **Should qualify:** "I enter patient records into Epic all day." Possible, then Supported. ✓
- **Must not qualify:**
  - "I enter the data center through the badge door every morning." **Supported if approved** ✗
  - "I type records of our team meetings now and then." **Supported if approved** ✗. That's occasional and minor.
- **Historical cases that would change:** none.
- **Recommendation: revise.**
  - Keep "keyed records", "keyed in records" and "entered data into".
  - Remove the patterns, "entered records", and "typed records into".

## Summary of recommendations

| Group | Recommendation | Main reason |
|---|---|---|
| bookkeeping | Revise | "books" and "ledger" match library and tool-log sentences |
| payroll | Revise | "wages" matches forecasting |
| accountspayable | Revise (and fix the boundary separately) | "vendors" matches onboarding forms. The main phrase is blocked by a boundary rule |
| accountsreceivable | Revise | "customers" matches coat checks and gas runs |
| bankreconciliation | Revise | "match … bank statements" matches filing |
| monthendclose | Revise | "the month" and "month-end" match schedules and inventory counts |
| budgeting | Reject | Adds nothing over the word itself |
| cashhandling | Approve with one revision | Only "register" is ambiguous |
| dataentry | Revise | "enter … data" matches "the data center" |

**Your decision for each group:** approve as written, approve my revision, a different revision, or reject.

When you decide:
1. I apply exactly what you approve, one commit per group or per batch.
2. I run the engine and reading comparisons, and the probes above become regression tests.
3. Only then does a group's status change to `owner_approved`.

**Still to come:**
- **Batch 2:** healthcare, 8 groups.
- **Batch 3:** trades and automotive, 11 groups.
- **Batch 4:** logistics, service, people and legal, 14 groups.
- **Batch 5:** the two **proposed** groups (pest-control treatment, inventory control), kept separate from the 42.
