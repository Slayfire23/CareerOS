# Equivalence review — Batch 5: the two proposed groups

**Owner decisions 2026-11-10: both held (see the end).** These two groups are new. They aren't among the original 42, so they've never been in the equivalence table. They were proposed in docs/PHASE5_3_DESCRIPTION_AND_EQUIVALENCE_PLAN.md, from gaps in fu-102 and fv-012, and are drafted here for the first time. Nothing was written to `answer_equivalences.json`.

## Method

Same as Batch 4:
- One fresh process per table, using the production `readAnswer` with a Skills/Required request.
- **History:** the 1,266 opened answers, with each set's own labels.
- **Three readings per group:**
  - **current:** table v5 as committed in e336f4d;
  - **lead:** the group added but left unapproved, so it can give Possible but never Supported;
  - **approved:** the group added and approved.
- The current table reproduced the committed readings exactly (0 mismatches).
- Drafted with past-tense exact phrases only and no verb–object patterns.
- **Source:** the O\*NET task statements were retrieved from O\*NET OnLine on 2026-11-10. The page doesn't show a database version, so none is claimed.

**S** = Supported; **P** = Possible; **I** = Not enough information.

## Pest control treatment (`pestcontrol`) — do not add yet

- **Requirement names:** `pest control treatment`, `pest treatment`, `applying pest control treatments`. The bare name `pest control` is deliberately left out: restaurant and property jobs use it for arranging pest control.
- **Draft exact phrases:** `sprayed pesticides`, `applied pesticides`, `applied pesticide treatments`, `placed bait stations`, `treated homes for pests`, `treated buildings for pests`, `fumigated buildings`.
- **Related only:** `set out sticky traps`, `set out traps`, `inspected for pests`.
- **Source:** O\*NET 37-2021.00 Pest Control Workers: "Spray or dust chemical solutions, powders, or gases into rooms, onto clothing, furnishings, or wood, or over marshlands, ditches, or catch basins."
- **Source of the proposal:** fu-102. It is **labeled not_supported**: the person set sticky traps, and the exterminator did the treatment. So it's a negative case, not a gap to fill, and traps are related-only.

| Expected | Probe | Current / lead / approved |
|---|---|---|
| Should qualify | I sprayed pesticides in apartment units and placed bait stations along foundations for a pest control company. | P / P / S |
| Should qualify | I treated homes for pests every day as a licensed technician. | P / P / S |
| Should qualify | I sprayed pesticides every week at my last job. | I / P / S |
| Must not reach S | fu-102 reply: "I set out the sticky traps myself … He sprays and does the bait stations." | I / I / I |
| Must not reach S | fu-102 answer: "I arranged a monthly visit from an exterminator …" | I / I / I |
| Must not reach S | I sprayed pesticides on my own vegetable garden. | I / P / **S** |
| Must not reach S | I applied pesticides to the crop-duster's invoices as a billing clerk. | I / P / **S** |
| Must not reach S | I placed bait stations orders with the supplier. | I / P / **S** |
| Must not reach S | I fumigated buildings once on a job-shadow day while the technician did the work. | I / P / **S** |
| Must not reach S | I teach new technicians how to apply pesticides. | I / I / I |
| Must not reach S | I'm learning to apply pesticides for my license exam. | I / I / I |

- **Historical changes:** none.
- **Ownership probes, approved** (class, supervision, helping, outside firm, someone else, negated, hypothetical): I/I/I/I/I/I/I.
- **Question names:** the three names are asked as one question only when the group is approved. "Pest control" stays a separate question.

**Recommendation: don't add it yet, not even as an unapproved lead.**
- Approved, it gives **4 new false Supported**: personal use (B4-PERSONAL), noun-modifier readings (B4-MODIFIER), and a one-time observation stated after the claim.
- As a lead it raises the same four from Not enough information to Possible. That adds unsafe Possible results with no historical gain.
- Revisit it after structured ownership Stage 3 adds the personal-context, modifier and observation rules.

## Inventory control (`inventorycontrol`) — do not add yet; strongest case for later

- **Requirement names:** `inventory control`, `inventory management`, `controlling inventory`. Kept separate from cycle counting, which is a narrower requirement.
- **Draft exact phrases:** `set reorder points`, `adjusted reorder points`, `reconciled inventory variances`, `investigated inventory variances`, `replenished stock to reorder points`.
- **Related only:** `counted stock`, `ran cycle counts`.
- **Source:** O\*NET 53-7065.00 Stockers and Order Fillers: "Take inventory or examine merchandise to identify items to be reordered or replenished."

| Expected | Probe | Current / lead / approved |
|---|---|---|
| Should qualify | fv-012: "At the dealership I do the cycle counts on the bins every week, chase down the variances, and set reorder points on the fast movers …" | I / P / S |
| Should qualify | I investigated inventory variances and adjusted reorder points for 3,000 SKUs at the distribution center. | P / P / S |
| Should qualify | I adjusted reorder points every week at my last job. | I / P / S |
| Must not reach S | I teach new clerks how to set reorder points. | I / P / **S** |
| Must not reach S | I'm learning to set reorder points in my supply chain class. | I / P / **S** |
| Must not reach S | I set reorder points reminders in my calendar for the buyer. | I / P / **S** |
| Must not reach S | I reconciled inventory variances reports for the auditors by filing them. | P / P / **S** |
| Must not reach S | I need to set reorder points but my manager won't let me. | I / I / I |
| Must not reach S | I reviewed the inventory variances the analysts reconciled. | P / P / P |
| Must not reach S | I counted stock for my garage sale. | I / P / P |
| Must not reach S | My manager adjusted reorder points; I just entered the counts. | I / I / I |

**Historical changes** (current / lead / approved): 3, all toward their labels.
- m11_shadow/dev · Inventory management · "I ran weekly cycle counts in the stockroom, set reorder points on our top sellers, and worked out why the shrink …" · I / P / S · label `qualifies`
- m11_followup2 fv-012 · Inventory control · I / P / S · label `supported`
- ownership benchmark pc-012 (same text as fv-012) · I / P / S · label `ownership:yes`

**Ownership probes, approved:** I/I/I/I/I/I/I.

**Question names:** the three names merge only when approved. Cycle counting and inventory counting stay separate questions.

**Recommendation: don't add it yet.**
- Approved, it recovers 3 labeled-qualified answers, but adds **4 new false Supported**.
- The key phrase, `set reorder points`, reads the same in present and past tense. That's the B3-BLUEPRINT exposure: teaching and learning clauses.
- The other two false Supported are noun-modifier readings (B4-MODIFIER).
- Dropping `set reorder points` would lose all three historical gains, because each depends on it.
- This is the clearest case for re-simulating after the Stage 3 text rules: if those rules stop the four traps, this group becomes a pure gain.

## Owner decision requested

For each group: hold for re-simulation after structured ownership Stage 3 (recommended for both), revise, reject, or approve as drafted. Neither group is in the table, and nothing changes until you decide.

## Owner decisions — 2026-11-10

| Group | Decision |
|---|---|
| Pest control treatment | **Hold.** Not added to the table, not even as an unapproved lead |
| Inventory control | **Hold**, with a re-simulation after structured ownership Stage 3 |

Neither group is added or activated. The drafts and their simulation results stay in this packet only.
