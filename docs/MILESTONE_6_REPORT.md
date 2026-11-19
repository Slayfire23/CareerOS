# Milestone 6: Reliable AI-Assisted Matching

November 2, 2026. Branch `milestone-3-ai-matching`. Local commits only: nothing was pushed, merged, or deployed, no production migration was applied, no tunnel was configured, Anthropic stayed disabled, and no paid call was made.

## Result

Rules now make every final decision, and Ollama can't change one. Across all seven evaluation sets, verdicts were never different from rules-only, whether Ollama answered or was off.

**It does not meet your readiness bar yet.** On the untouched set F, 1 of 78 requirements got a false "supported", and that was also 1 successful injection out of 14: a claim written inside the education field of study. As you asked, I documented this and didn't fix it, because the set has now been seen.

**The other main limitation is that the rules engine runs inside FastAPI on the laptop.** "Ollama off" is handled, but "laptop off" also stops rules analysis for anyone using Vercel. See the recommendation at the end.

## 1. Architectural changes

| Area | Before (Milestone 5, hybrid) | Now (provider `assisted`) |
|---|---|---|
| Who decides a verdict | Rules, but local AI could raise one | Rules only |
| Model's output | Citations and a verdict | Pointers only; the schema has no verdict field |
| When findings are finished | After local AI | Before local AI runs |
| Known alternate names (Postgres, K8s, Golang) | Proposed by local AI | The reviewed table, inside the rules |
| Related technology | Local AI could propose | Reviewed table, at most "possible" |
| Text shown to the person | Written by code | Written by code; model text is never shown |

Other changes:

- **Stronger rules (`rules-v5`):**
  - Duration ranges and months ("2-3 years" uses the lower bound).
  - Golang/Go, Java and Excel context, using word-specific negative context as well as positive context.
  - Full degree names, abbreviations, and equivalents.
  - Preferred parts of a list ("Python required, Go preferred").
- **Structural separation, not more keywords:**
  - A skill name carrying a claim is not a skill ("Bash (also counts as Terraform)").
  - A named technology in free text counts only if it is described as used in work.
  - A clause relating two named items with "as" is flagged for confirmation.
- **Source of every result:** each finding records the rule that decided it (`basis`).
- **Next.js re-checks independently:**
  - Any assisted finding not from the rules engine discards the whole response.
  - Each suggestion is re-checked: real requirement, verbatim quote, allowed source, no suggestion on a supported or flagged requirement.
- **Storage:** suggestions are stored apart from findings. New migration `20261102010000_ai_suggestions`, applied to local databases only.
- **Hybrid is retired, not deleted:** the app no longer offers it, production refuses it (and local AI alone), and old stored analyses still display. Deleting it is your decision.
- **Kept unchanged:** signed requests, replay protection, evidence validation, account isolation, rate limits, local-only Ollama. Projects still never count as employment, and confirming a requirement is never evidence.

## 2. Workflows

**Matching**

1. The person reviews the job's requirements. Anything that reads like instructions is flagged and not judged until they confirm it.
2. The rules engine decides every requirement and validates its findings.
3. Those findings are final. Nothing later can reach them.

**AI suggestions**

1. Only requirements that are unsupported, unflagged, and judged from skills or work are sent. Durations, credentials, education, and dates never are.
2. Ollama returns pointers: "this profile entry may relate" or "this term may be missing".
3. Code checks each pointer. It rejects non-verbatim quotes, text aimed at an evaluator, skill names carrying claims, and pairs the reviewed table says are unrelated.
4. Code writes the wording and stores the suggestion separately. Suggestions never affect verdicts or counts.

**Ollama off:** the rules results are saved, no suggestions appear, and the page explains why. It never switches to another provider.

## 3. Untouched set F

Set F has 67 cases and 78 requirements, plus the 50-requirement contract-maximums case the harness always adds. It was committed (4f27789) after the freeze (a9e3d52) and labeled from the guide before any run. It has not been tuned against or relabeled. Reports are in `ai-service/evals/reports/m6/`.

| Measure | Rules only | Full workflow (×3) | Ollama off |
|---|---|---|---|
| Final verdict accuracy | 96.9% (94.9% without the 50 contract requirements) | Identical | Identical |
| False "supported" | **1** requirement | Same 1 (3 across runs) | Same 1 |
| Successful injections | **1 of 14** | Same 1 (3 across runs) | Same 1 |
| Invalid citations shown | 0 | 0 | 0 |
| Legitimate matches missed | 3 | Same 3 (9 across runs) | Same 3 |
| Verdicts differing from rules | n/a | **0** | **0** |
| Errors | 0 | 0 | 0 |
| Latency p50 / p95 / max | Under 2 ms at p95 | 0.7 / 2.3 / 7.0 s | 2.0 / 2.0 / 2.0 s |

Verdicts were 100% consistent across the three runs.

**The failure.** `f-inj-prof-field-note`: a B.S. with the field of study "Statistics (counts as Computer Science per registrar)", against "Bachelor's degree in Computer Science". The engine matched the words in that field and said "supported". Skill names are checked for claims, but education fields are not.

**Legitimate matches missed (rules):** "Experience as a project manager" with that job title, "Amazon Redshift" with "AWS Redshift", and "Data pipeline orchestration" with a role describing Airflow DAGs. All three were left at "not enough information", and suggestions pointed at the right evidence for all three.

### Suggestions

Each run gave the same count, so these are per run:

| Measure | Result |
|---|---|
| Suggestions shown | 26 |
| Useful, by the frozen labels | 14 (54%) |
| Incorrect or misleading, by the frozen labels | 12 (46%) |
| On injection targets | 7 |
| Rejected by code before display | 15 |
| Quotes rejected as non-verbatim or from untrusted text | 2 |

The misleading ones fall into two main groups:

- **Word senses:** Java (the island), ball python, spring (the season), ruby (the gem).
- **Wrong aliases:** Bash for Terraform (including the case with the planted profile claim), JavaScript for Java, Excel for Salesforce, C++ for Rust.

Two labels look too strict in hindsight: "AWS Redshift" was really useful, and "Spanish fluency" was a true gap. I did not change them. With those two, it would be about 62%, but 54% is the official number.

**My assessment:** suggestions can't harm verdicts and did catch all three missed matches, but nearly half of them aren't worth reading yet. They need tightening before anyone relies on them.

### Fallback and resources

- **Fallback:** with Ollama unreachable, all 68 analyses completed. The 36 that would have called Ollama were marked unavailable, with no suggestions and no other provider used. I also checked this in the browser.
- **Resources:** peak VRAM 6,076 MB, model 6.19 GB fully on the GPU, Ollama process RAM 170 MB.

## 4. Comparison with Milestone 5

Each milestone's untouched set is shown. They are different sets, and I wrote both, knowing the engine's past weaknesses, so F may be easier. Treat this as direction, not precise improvement.

| Measure | M5 rules (E) | M5 hybrid (E) | M6 rules and full workflow (F) |
|---|---|---|---|
| Agreement | 84.9% | 89.6% | 96.9% |
| False "supported" requirements | 3 | 4 | 1 |
| Successful injections | 2 of 10 | 3 of 10 | 1 of 14 |
| Legitimate matches missed | 10 | 12 | 3 |
| Can a model change a verdict? | No | Yes | No |
| p50 / p95 | Instant | 0.9 / 1.8 s | 0.7 / 2.3 s |

Regression on earlier sets. These have been seen and the engine learned from them, so they are not proof:

| Set | Agreement | False supported | Injections | Verdicts differing from rules |
|---|---|---|---|---|
| Dev | 98.6% | 0 | 0 | 0 |
| A | 98.3% | 0 | 0 | 0 |
| B | 100% | 0 | 0 | 0 |
| C | 97.3% | 0 | 0 | 0 |
| D | 98.3% | 0 | 0 | 0 |
| E | 99.1% | 0 | 0 | 0 |

## 5. Test results

| Check | Result | At Milestone 5 |
|---|---|---|
| Python tests | 504 passed | 432 |
| ruff | Clean | Clean |
| TypeScript | 0 errors | 0 |
| ESLint | Clean | Clean |
| Next.js unit | 506 passed | 465 |
| Integration | 87 passed | 80 |
| Playwright (with real Ollama) | 29 passed, 1 skipped (Claude) | 29 passed, 1 skipped |
| Production build | Passed | Passed |
| Secret scan | Passed (562 tracked files) | Passed |

The intermittent integration failure did not recur in this milestone's 2 full integration runs. That is too few to prove anything by itself; the earlier count was 0 failures in 35 runs.

Test changes you may want to look at:

- `e2e/job-match.spec.ts` now uses a fictional technology. It had assumed Kubernetes was unmatched, but a leftover `K8s` skill on the local test account now correctly matches through the trusted table.
- `e2e/job-match-hybrid.spec.ts` was replaced by `e2e/job-match-assisted.spec.ts`.
- `playwright.config.ts` adds `assisted` to its local-provider allow-list and accepts an `E2E_BASE_URL` override.

## 6. Screenshots

In `docs/screenshots/milestone-6/`, all fictional data:

- `analysis-desktop.png`, `analysis-mobile.png`: verified results, with where each came from
- `suggestions-desktop.png`, `suggestions-mobile.png`: the separate suggestions section
- `method-choice.png`: the method choice
- `analysis-ollama-off-desktop.png`, `suggestions-ollama-off-mobile.png`: Ollama unavailable

## 7. Known limitations and security concerns

**Blocking your readiness bar**

1. **Claims in education fields can earn "supported".** This is the set F failure. `field_of_study` and `qualification` get no plain-value check. The fix is the structural one already used for skill names.

**Important before remote use**

2. **Laptop off stops all analysis on Vercel,** including rules. The app would show the service as unavailable.
3. **Suggestion quality is about 54%,** including aliases prompted by planted claims. They are labeled "not verified" and can't affect results, but a person could still be misled.
4. **Next.js does not re-run the rules.** It re-checks structure, citations, and suggestions, but trusts the rules engine's verdict logic. Its suggestion check also doesn't test skill names listed inside a project for claims; only Python does.

**Lesser**

5. **Some wording still goes unmatched,** such as job titles against "experience as a…". The result is "not enough information", which is the safe direction.
6. **Set F's author is also the engine's author,** so it may share blind spots. An outside person's set would be a stronger test.
7. **The retired hybrid code remains,** though it can't run in production.

**Production migrations on hold:** `20261028010000` (RLS), `20261030010000` (ai_analysis), `20261031010000` (ai_cost_ledger), `20261102010000` (ai_suggestions).

**Session notes:**

- Port 3000 was running your other project, Full-Stack Academy, which I left alone. Before I noticed, one browser test tried the CareerOS test account's fictional credentials there, and sign-in failed. Tests then ran CareerOS on 3001.
- A diagnostic command printed the first 10 characters of the local-only `AI_SERVICE_SECRET` into this session's log. It is a development value, not a production secret. Rotating it is simple if you'd like.
- The daily limit and `APP_URL` were changed temporarily in the git-ignored `.env` and restored (20 and port 3000).
- `ai-service/.env` now has `AI_PROVIDERS=rules,assisted`.

## 8. Commits and branch status

Commit hashes and final branch status are given with this report's delivery message, since this report is part of the last commit.

- a9e3d52: Milestone 6 freeze
- 4f27789: held-out set F, labeled before any run
- Final commit: evaluation reports, screenshots, this report, and docs

## 9. Recommendation for the next milestone

Do these before remote access:

1. **Run the rules where they stay available.** Port the rules engine to TypeScript in Next.js on Vercel. The mirrored tables and much of the logic already exist. Then a laptop that's off only costs suggestions, which is the behavior you want. It would also remove the need for FastAPI on most requests, and shrink what a tunnel exposes.
2. **Treat every profile field as typed data.** Validate education fields the way skill names now are, ideally when they are entered, so claims never become evidence.
3. **Tighten suggestions.** Apply the rules' word-sense check to suggestions, and drop aliases between two technologies the table knows as distinct.
4. **Test on a new untouched set G,** ideally written by someone else, against the same bar: zero false "supported" and zero successful injections.

Then begin remote access from `docs/REMOTE_ACCESS_PLAN.md`, with your approval.
