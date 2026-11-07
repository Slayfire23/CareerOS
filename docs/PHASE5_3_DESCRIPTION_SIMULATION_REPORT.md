# Phase 5.3: Role-Description Matching — Simulation Report

November 7, 2026. **Simulation only. The matching engine wasn't changed.**

- **What ran:** the unchanged rules-v19 engine, over the 2,121-requirement baseline.
- **What was tested:** each candidate rule, on every credit whose citation quotes a role description.
- **Where the data is:** the per-credit results are in `ai-service/evals/reports/m11/engine/description-simulation-v19.json`, with the simulation code beside it.
- **Not touched:** the sealed split `m11_followup4` and your locked labels.

## Result: I don't recommend any of the three rules as they stand

| Option | Above-label credits fixed (of 59) | Still above their label | Correct credits lost |
|---|---|---|---|
| **A.** Credit only through the person's own clause, plus a strong match (the proposed rule) | 27 | 32 | **59** (8 Supported, 51 Possible) |
| **C.** A description alone gives Possible at most (never Supported) | **9: every false Supported** | 50 | 29 Supported **lowered** to Possible. None removed |
| **D.** C, plus removing credit from clauses about someone else | 13 | 46 | 38 (30 Supported) |

**Option A fails your condition.** It discards a large amount of correct evidence. The reason is that it reuses the answer reader on role descriptions, and descriptions are written differently from answers.

**Résumé phrasings read as negatives or as someone else's work:**
- "Zero lost-time injuries in ten seasons operating 60-ton mobile cranes"
- "Never missed a SAP close"
- "No downtime on Kubernetes"
- "R&R'd automatic transmissions and transfer cases"
- "Brake-formed and seamed rectangular ductwork"

**Non-English descriptions aren't read at all:** "Mantenimiento de ascensores", "Rédaction de contrats".

**Its sense check also missed the collisions it was meant for:** "bug", "bar", "kernel", "cells", "statements" and "Go" all passed.

## What the 59 above-label credits are

The causes below come from the simulation's own reading and are consistent with a review of each case.

| Cause | Count | Examples |
|---|---|---|
| **A word used in another sense** | about 21 | A dentist's "bridges" → bridge design; a pest technician's "bug" → bug tracking; "bar", "cells", "springs", "kernel", "unit", "code", "cycle", "guest", "mobile", "statements", "injection", "mechanical"; "Go"; "load testing" (beams); "continuous delivery" (a pipeline welder) |
| **Not a statement of the person doing it** | 14 | A description listing what a unit handled, or a tool named without anyone using it |
| **Negated or hypothetical** | 6 | "didn't just build Tableau dashboards"; "couldn't get Terraform approved"; "not ServSafe certified"; "not permitted to administer IV medications" |
| **Someone else's work** | 5 | "sat next to the insights team who built our Tableau dashboards"; "colleagues modeled parts in SolidWorks" |
| **Helping or supervising** | 5 | A sterile-processing helper; a foreman for pipe welding |
| **Plain single words** | 8 | "corporate", "customer", "heights", "calipers" |

**9 of the 59 are false Supported:**

| Case | Credited for |
|---|---|
| "didn't just" | Tableau |
| "couldn't" | Terraform |
| A Rust credit for someone else's group | Rust |
| A different sense of "SWIFT" | SWIFT payments |
| "Go" | Go |
| A teacher's mention | Google Classroom |
| A mention | gRPC |
| A suggestion | scheduling |
| A suggestion | contract review |

Option C fixes all 9.

## Checked against the independent benchmark

The ownership benchmark has 80 role descriptions with independent word-sense and ownership labels. Only 20 of them get credit from description words. On those 20:

| | rules-v19 | Option A | Option C |
|---|---|---|---|
| Credit where the label says no ownership | 16 | **4** | 16 |
| A different word sense credited | 7 | 4 | 7 |
| Legitimate credit lost | — | 2 | 0 |
| Correct Supported lowered | — | 2 | 3 |

Option A looks much better here than on the held-out sets. The two label sets test different things. The held-out sets' allowed verdicts were written to test exactly the résumé phrasings above, like "never missed" and "zero downtime", which option A misreads. The benchmark labels judged ownership in general. With only 20 relevant items, it isn't enough evidence to adopt option A.

## What I recommend

1. **Don't change the description rules now.** No option here improves safety without a large loss of legitimate recognition. That's the condition you set.
2. **Your decision: option C as a narrow safety step.** It's easy to explain: "a description you wrote can show you've done something, Possible; it can't on its own show Supported".
   - **What it fixes:** all 9 false Supported from descriptions.
   - **What it costs:** 29 correct Supported become Possible.
   - **What it doesn't do:** remove any credit, or touch any Possible.
3. **Let structured ownership resolve description leads.** In that design, a description-based Possible would be stated as **"Your role description mentions *bridges*. What was your part in *design highway bridges*?"** The structured choice then settles it:
   - "I haven't done this" fixes a wrong sense;
   - "I supervised it" fixes supervision;
   - "I did this myself" confirms real work.

   That handles word sense, negation and someone else's work by asking the person, not by guessing. It's the same reason structured ownership was chosen.
4. **Not recommended:** a hand-made list of ambiguous words built from these failures. It would only fix the words on it, which is the regex growth you asked me to stop. The existing ambiguous-word table covers technology names ("go", "spring", "rails"), not ordinary words, and growing it here would overfit to the spent sets.

## Decisions needed

1. **Option C:** apply it now (rules-v20, its own commit and comparisons), or leave description credit unchanged until structured ownership exists?
2. **Agree to route description-based Possible credits into a structured question** once Stage 4A is built.

**Next, per your order:** the equivalence review packet (42 groups, with the two proposed groups kept separate), then the structured-ownership stages.
