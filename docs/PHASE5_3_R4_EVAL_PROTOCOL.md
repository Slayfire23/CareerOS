# Phase 5.3 R4: independent evaluation protocol for compound splits

November 12, 2026. **A protocol only. Nothing is written, generated or run yet.** It follows the Stage 0 pattern (`m11_structured`): one agent writes, a different agent labels, the result is committed unopened, and it's scored once at freeze.

**Owner note (2026-11-12):** this protocol is approved **for planning only**. No sealed evaluation answers are created or inspected until a separate approval.

**Separation rules:**
- **The writer and labeler never see** the implementation, the markers, the candidate equivalents, the DD1 design probes, or any simulation output.
- **The implementer never opens** the scenarios or labels before freeze.
- **No existing sealed split** (`m11_followup4`, `m11_structured`) is inspected or scored.

## 1. What the new split contains

- **Name:** `tests/fixtures/m11_parts/` (proposed), with `scenarios.json`, `labels.json` and a hash manifest.
- **Size:** about 300 scenarios.
  - About 8 per approved split, for all 33 splits (about 264).
  - About 20 controls on unsplit requirements, to check splits change nothing else.
  - About 16 injection and non-English cases spread across the splits.
- **Scenario fields:**
  - the requirement text and the exact approved parts;
  - the person's choice and their part checkboxes (some deliberately contradictory);
  - frequency and recency;
  - the explanation;
  - an optional follow-up reply;
  - the language.

**The writer's category tag is stripped** before labeling, and kept only in a separate sealed file for reporting.

**Categories and minimum quotas** (across all splits):

| Category | Minimum | Notes |
|---|---|---|
| Genuine full experience, standard wording | 33 | One per split |
| Genuine full experience, natural or synonym wording | 33 | Wording the writer would really use. No access to markers |
| Several activities described in one explanation | 25 | One sentence covering more than one part |
| Partial experience (one part only) | 40 | Both directions across splits |
| Supervision and delegation | 30 | Including "manage the people who…" and present-tense review |
| Third-party work | 25 | Contractor, agency, coworker, family member |
| Corrections that transfer work | 20 | A87-style |
| Corrections that narrow scope | 20 | A78-style, including "I only/just…" |
| Contradictory checkboxes | 20 | "Did it myself" ticked, text says someone else did it |
| Hiring, verifying, approving (R2): genuine and lookalike | 15 | Recommending, forwarding, requesting approval as lookalikes |
| Template or data-supply narrowing (R5) | 6 | Budget template, supplying numbers |
| Prompt-injection attempts | 10 | In the explanation and in the reply |
| Non-English explanations (D3) | 10 | Must never be read; Possible at most from the choice |

## 2. Writer instructions (summary)

Write realistic answers a real candidate might give, for each approved split (the requirement and the exact parts only). Vary length, tone and wording. Use your own natural wording for genuine answers. Never mention verdicts, labels or rules. Include each category per the quotas. Don't optimize toward any keyword list. You won't see one.

## 3. Labeler instructions (summary, independent)

For each scenario, without the writer's category, label:
- for **each part**: whether the person personally did it (yes / partial scope / no / unclear), plus their involvement (performed, supervised, requested or arranged, assisted, observed or trained, taught, other person, none);
- whether the explanation **contradicts** the checkboxes, per part;
- whether an **injection** is present;
- whether the text is **non-English**;
- the **expected verdict**: Supported / Possible / Not enough information / Not supported. This follows D1–D3, O1–O3 and the owner's split decisions:
  - Supported needs every necessary part genuinely shown in the person's own words;
  - a checkbox alone gives Possible at most;
  - a contradicted activity gets no checkbox credit;
  - narrowed scope gives Possible;
  - non-English text is never read;
  - R2 hiring, verifying and approving count only as direct personal performance;
  - R5 template entry or supplying numbers isn't ownership.

The labeler may mark "unsure", and unsure items are reported separately, never tuned on.

## 4. Sealing and integrity

- A combined, LF-normalized SHA-256 hash and a count are committed with the files.
- `tests/sealed-splits.test.ts` is extended to protect the new folder. That's a test change that needs approval when the split is created.
- Only a dedicated eval harness may read the folder:
  - its validate mode gives counts only;
  - unsealing needs an explicit flag, the freeze commit equal to HEAD, and a clean tree.
- The implementer doesn't open it before freeze.

## 5. When and how it's scored

**Once only,** after:
1. R1 markers and equivalents are approved;
2. R3/DD3 (rules-v21) is implemented and adopted;
3. the Stage 4–6 flows are built;
4. a code freeze.

There's no tuning after opening, and any fix afterwards needs a new independent split.

**Proposed release criteria** (the owner sets the final numbers before freeze):
1. 0 false Supported.
2. 0 Supported from a checkbox alone.
3. Every contradicted activity gets no checkbox credit and a clarification.
4. 0 injections above Not enough information.
5. Non-English text is never read (Possible at most from the choice).
6. Every partial-experience case is at most Possible, and names the missing part.
7. Genuine full experience in natural wording reaches Supported in at least the share the owner sets. Targeted questions count as safe misses, reported separately.
8. Unsplit controls are identical to the same answers without the split feature.

**Reporting:** by category, by split and by part, with every miss and every over-credit listed.

## 6. Steps once approved (nothing done yet)

1. Owner approval of this protocol and the quotas.
2. A writer agent generates the scenarios.
3. A separate labeler agent labels them blind.
4. The hash manifest is created, and the guard test extended. Both are committed unopened, in their own commit.
5. The split stays sealed until the freeze described in §5.
