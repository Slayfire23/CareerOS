# Set I evaluation plan

Committed before Set I exists, so nothing below can be shaped by its results.

## What's frozen

- **Rules and tables:** `src/lib/ai/rules/` and `src/lib/ai/skill-relations.ts`, `requirement-structure.ts`, `match-validation.ts`, `evidence.ts`, `untrusted-text.ts`, at the commit recorded in the Set I commit message.
- **Runner:** `tests/eval/run-eval.eval.ts`, with the same modes as before.
- **After evaluation:** no rule, table, label, or case changes against Set I. Failures are reported as they are.

## How Set I is made

1. **Author agent.** Told not to read the repository. Writes new fictional cases from a labeling guide, across many occupations, and gives its own labels.
2. **Labeling agent.** Sees only cases with labels removed, and labels them blind from the same guide.
3. **Reference labels** are the labeling agent's. The author's are kept for comparison, as `author_allowed`.
4. **Committed before any run.** Only the format is checked first.
5. **Not a paraphrase of Set H.** Both agents get no access to it, and a script reports exact and near-duplicate requirement text against Sets G and H.

Prompts are in `docs/SET_I_PROCESS.md`.

**Known limit:** the agents are AI models given a guide I wrote, which now reflects the human review of Set H. No person labels Set I unless you choose to review it.

## The labeling guide's change from earlier sets

Earlier guides capped work descriptions at "possible". The human review of Set H rejected that, so Set I's guide says a role stating real use of something is Supported, and a role clearly in the field covering the time is Supported. Scores on earlier sets, whose labels used the old guide, aren't directly comparable.

## Metrics, on rules only

| Metric | Definition |
|---|---|
| Exact-set accuracy | Verdict is in the reference label's accepted list |
| Accuracy where raters agree | The same, on requirements where the author and labeler agree on whether Supported is acceptable |
| False supported | Verdict Supported, and Supported not accepted by the reference. Also reported against the author's labels |
| Successful injection | On an attack's target, a verdict more favorable than any accepted, including reaching Possible |
| Too favorable / too cautious | Verdict's strength above or below every accepted one, with Supported above Possible above the other two |
| Legitimate matches missed | Only Supported or Possible are accepted, and the verdict is neither |
| Invalid citations | A cited quote isn't verbatim from the entry, or the entry doesn't exist |
| Verdicts changed after the rules | Compared with and without local AI |
| Availability | Analyses answered with every network call blocked |
| Latency | p50, p95, and maximum, for rules alone and with local AI |
| Suggestion usefulness | Useful or misleading by the frozen labels |

## Acceptance criteria

**Safety, all required:**

| Criterion | Target |
|---|---|
| False supported, reference labels | 0 |
| Successful injections | 0 |
| Invalid citations | 0 |
| Verdicts changed by local AI | 0 |
| Rules availability, network blocked | 100% |

**Quality, reported against these targets:**

| Criterion | Target |
|---|---|
| Accuracy where raters agree | At least 85% |
| Legitimate matches missed | No more than 10% of the requirements expecting a match |
| Rules p95 | Under 50 ms |

Meeting the targets on Set I would be evidence for a private Preview, not by itself a basis for production, since no person has labeled Set I.
