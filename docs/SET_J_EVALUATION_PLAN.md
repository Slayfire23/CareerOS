# Set J evaluation plan

Committed before Set J exists, so nothing below can be shaped by its results.

## What's frozen

- **Rules and tables:** `src/lib/ai/rules/`, `src/lib/ai/skill-relations.ts`, `requirement-structure.ts`, `match-validation.ts`, `evidence.ts`, and `untrusted-text.ts`, at this commit (`rules-v10`, `terminology-v1`).
- **Runner:** `tests/eval/run-eval.eval.ts`, unchanged.
- **Labeling guide:** `docs/SET_J_LABELING_GUIDE.md`.
- **Metrics and criteria:** below.
- **After evaluation:** no rule, table, label, guide, or case changes against Set J. Failures are reported as they are. Any further tuning waits for the owner's approval.

## How Set J is made

1. **Author agent.** Told not to read the repository. Writes new fictional cases from the guide, across many occupations, and gives its own labels.
2. **Labeling agent.** Sees only the cases with labels removed, and labels them blind from the same guide.
3. **Reference labels** are the labeling agent's, and the author's are kept as `author_allowed`.
4. **Committed before any run.** Only the format and repeats of Sets G, H, and I are checked first. Exact and near-duplicate requirement text is reported, not removed.
5. **Run once**, in the modes below, in one sitting. A run that fails for an environment reason is reported, and rerun only if no result from it was read.

**Coverage asked of the author:** at least 130 cases, adding the audit's five risk classes: credential substitution, insufficient duration, unrelated skills, keyword collisions, and prompt injection.

## Known limits, stated in advance

- Both agents are AI models using a guide written by the engine's author, and "told not to read" is an instruction, not a sandbox. **No person labels Set J** unless the owner chooses to review it afterward.
- The guide reflects the owner's audit, but the engine wasn't tuned to it. **Expect some disagreement by design:** the engine gives Possible for a related technology and for most projects, where the guide now may say Not enough information or Supported. Those count as errors.
- I knew the failure types from Set I and the probe when fixing them, and the author prompt names the same classes without any of the fixes or wording.
- Set J tests the matching engine. It doesn't test the question workflow, which has its own unit, integration, and browser tests.
- Scores aren't directly comparable with Set I, because the guide changed.

## Modes

| Mode | Runs per case | What it checks |
|---|---|---|
| rules | 1 | Accuracy and safety |
| offline | 1 | Works with every network call blocked |
| closed_port | 1 | Works with the AI service unreachable |
| assisted | 3 | Local qwen3:8b doesn't change verdicts; suggestion quality; latency |

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

Every false Supported is also classified by hand into the audit's five risk classes, or "other", and reported case by case.

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

Meeting these would be evidence for a private Preview, not by itself a basis for production, since no person labels Set J.
