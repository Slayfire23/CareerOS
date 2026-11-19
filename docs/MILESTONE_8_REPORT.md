# Milestone 8: Qualification Safety and Accuracy Hardening

November 2, 2026. Branch `milestone-3-ai-matching`. Local commits only: nothing was pushed, merged, or deployed, no tunnel was configured, no production database was touched, and no paid AI was used.

## Result

Every failure documented in Milestone 7 is fixed. On the new untouched Set H:

| Safety target | Result |
|---|---|
| Zero successful injections | **Met: 0 of 33, including none reaching "possible"** |
| Zero false "supported" | **Not met: 3 of 190 requirements** |

As you asked, I document the three failures and have not tuned against H. **Recommendation in brief:** ready for a private Preview that only you use, on isolated resources and only after the checks in section 6. Not ready for production or for anyone else.

## 1. What changed

| Failure from Milestone 7 | Now |
|---|---|
| Degree whose description says it wasn't completed | Status is **completed, in progress, incomplete, or unknown**. Incomplete is a gap, in progress at most possible, unknown is not enough information. Only an earned degree can support a requirement, and a description can only lower the status, never raise it |
| "I have never used Terraform" | Negation covers the clause to the end of the sentence, unless a contrast introduces other work, so "Never used Docker, but built Terraform modules" still counts for Terraform |
| Fake audits, scores, equivalence claims | Treated as untrusted in every profile free-text field, and titles and skill names holding them aren't evidence. Also removed before local AI sees the text |
| Delivery driver and nursing | Years count only in the field asked for. A role naming the field and covering the time is **supported**, a partial match at most possible, and unrelated work counts for nothing. A requirement naming no field still accepts any employment, at most possible |
| Foreign and differently named degrees | B.Tech, M.Tech, B.E., honors, and fields such as CSE or Informatik are recognized. Foreign degrees without an exact counterpart (Diplom, Licenciatura) are **at most possible, with a note that equivalence wasn't verified**. Below the level asked for, or unknown, is not enough information |

**Architecture is unchanged.** TypeScript remains authoritative, rules work without FastAPI or Ollama, Ollama only adds suggestions, and signed requests, isolation, rate limits, and citations are unchanged. The engine is now `rules-v7`.

## 2. Set G review (44 disagreements)

Full list: `ai-service/evals/set_g_label_review.json`. I did this review by reading each case against the guide. **I'm the AI that built the engine, so it isn't an independent review.** Set G's own labels weren't changed.

| Category | Count | Outcome |
|---|---|---|
| Incorrectly favorable | 7 | All 7 fixed |
| Incorrectly cautious | 22 | 18 fixed; 4 remain, and are defensible (2 held for confirmation, 2 "possible") |
| Ambiguous labels | 7 | The engine's answer is defensible; kept |
| Genuine missing qualifications | 8 | 3 now say gap; 5 say not enough information, which is equally honest |

Set G as regression, comparing Milestone 7 to now:

| | M7 | M8 |
|---|---|---|
| Accuracy | 71.2% | 89.5% |
| False "supported" | 1 | 0 |
| Successful injections | 3 | 0 |
| Too favorable | 7 | 0 |
| Too cautious | 24 | 6 |

G has now been seen, so this shows the fixes work, not how the engine performs on new cases.

**Evidence rules weren't loosened to gain accuracy.** Each new match rests on the person's own typed data plus the reviewed table. Every verdict that changed on the earlier sets is listed with its reason in `tests/ai-rules-parity.test.ts`. I reviewed all 15, found three bugs of my own that way, and fixed them.

## 3. Set H, untouched

**How it was prepared.** The implementation froze at `fdff413`. A separate agent, told not to read the code, tables, tests, or earlier sets, wrote and labeled 174 cases: 190 requirements, 33 injection cases, across many occupations. I checked only the format and committed it (`8503602`) before running it. A second agent then labeled the same cases blind.

**Limitation: no person prepared or reviewed these labels.** Both raters are AI models, and the two share a labeling guide I wrote, so they aren't fully independent of each other or of my assumptions. They never gave completely different answers on a requirement, but disagreed on whether "supported" was acceptable on 11 of 190. I'd welcome a person reviewing a sample: `ai-service/evals/holdout_h_cases.json` and `holdout_h_second_rater_labels.json`.

| Measure | Result |
|---|---|
| Overall accuracy | **76.8%** (146 of 190); 77.9% counting either rater |
| False "supported" | **3** (both raters agree on all 3) |
| Successful injections | **0 of 33**, including at "possible" |
| Too favorable, including those 3 | 5 |
| Incorrectly cautious | 28 |
| Legitimate matches missed | 25 |
| Invalid citations | 0 |
| Verdicts changed after the rules | 0 |
| Rules-only with network blocked | **174 of 174 answered**, same verdicts |
| With the AI service unreachable | 174 of 174 answered, 79 marked unavailable |
| Latency, rules only | p95 3 ms, max 13 ms |
| Latency, with suggestions | p95 1.2 s, max 2.0 s |
| Peak VRAM | 6,076 MB |

Bridge-unreachable timing was a refused local connection. Over the internet, an unreachable laptop could take up to the 40-second limit, only for someone who chose suggestions.

**AI suggestions** (per run): 52 shown, 44 useful and 8 misleading by the frozen labels (**85% useful**, up from 68%), and about 20 dropped by code before display.

### The three false "supported"

| Case | Requirement | Profile | Cause |
|---|---|---|---|
| `h-man-never-conferred` | Bachelor of Laws | Description: "the degree was never conferred because of an unpaid fee" | "Never conferred" isn't in the wording list |
| `h-neg-skill-no-photoshop` | Adobe Photoshop | A skill named "No Photoshop" | "No" plus a name isn't treated as negation in a skill name |
| `h-amb-swift-language-vs-bank` | SWIFT payment messaging | Skill: Swift, the programming language | A listed skill inside a longer requirement is accepted even when the other words change its meaning |

**The third is the one that matters most,** because it can happen with an honest profile and no manipulation. The first two need a profile that contradicts itself.

### The other two too favorable, both "possible"

- `h-cred-aws-skill`: listing AWS gives "possible" for an AWS certification.
- `h-mix-legal-assistant`: "Theory of relativity is my hobby" gives "possible" for Relativity e-discovery.

### Too cautious: where accuracy is lost

Most of the 28 share one cause: **the reviewed table is built around software.** GTAW for TIG welding, PLC for programmable logic controllers, a bookkeeper's years toward accounting, and a truck driver's toward logistics all come back as "not enough information". Other examples:

- "MBBS" for "MD or equivalent"
- A certificate listed as a skill
- 4 of 14 honest requirements with instruction-like wording, such as "use override controls on CNC machines"

This is the safe direction, but the tool is notably less useful outside software, and that is its largest accuracy gap.

### Two other limits this exposed

- **Word lists have an end.** Incomplete degrees worded unusually or in other languages are read as "not enough information" at best, and the false "supported" above shows how it can go worse. The invariant that "supported" needs a clean typed value limits the damage, but can't catch a contradiction it doesn't recognize.
- **Suggestions can still quote text in other languages.** In H, a French "note to the system" and a German "no experience with" were shown as suggestions. Neither changed a verdict; both are misleading to read.

### Regression on all earlier sets

| Set | Requirements | Accuracy | False supported | Injections | Verdicts changed |
|---|---|---|---|---|---|
| Dev | 19 | 94.7% | 0 | 0 | 0 |
| A | 70 | 98.6% | 0 | 0 | 0 |
| B | 36 | 100% | 0 | 0 | 0 |
| C | 61 | 95.1% | 0 | 0 | 0 |
| D | 68 | 98.5% | 0 | 0 | 0 |
| E | 56 | 98.2% | 0 | 0 | 0 |
| F | 78 | 98.7% | 0 | 0 | 0 |
| G | 153 | 89.5% | 0 | 0 | 0 |

## 4. Tests

| Check | Result | At M7 |
|---|---|---|
| Python | 497 passed | 497 |
| ruff, TypeScript, ESLint | Clean | Clean |
| Next.js unit | 992 passed | 901 |
| Integration | 92 passed | 92 |
| Playwright | 29 passed, 2 skipped | 29 passed, 2 skipped |
| Laptop-off browser test | Passed with the AI service stopped | Passed |
| Production build, clean clone, no credentials, no `ai-service/` | Passed | n/a |
| Secret scan | Passed | Passed |

The two skips are the Claude test and the laptop-off test, which runs on its own with the service stopped.

## 5. Secrets and migrations

**Secrets.**

- I compared 17 values from your five local env files against every unpushed commit and all tracked files. Six matched, and none is secret: the standard local database URL, a local Redis URL, public app URLs, and fictional test emails. No value was printed.
- The current `AI_SERVICE_SECRET` and your hosted production credentials are not in any tracked file or unpushed commit.
- All env files are git-ignored. The one tracked env-like file is `ai-service/.env.example`.
- Milestone 7's mistaken commit (`cd1e142`) isn't reachable from any branch and holds a value that no longer works. It stays in the local object store until git cleans it up, and a push doesn't send it.

**The four pending migrations, reviewed and not applied:**

| Migration | What it does | Risk |
|---|---|---|
| `20261028010000_enable_row_level_security` | Enables RLS on existing tables; adds no policies | Low. Idempotent, and its comment says production already has it |
| `20261030010000_ai_analysis` | New `AiAnalysisRun` and `JobMatchAnalysis` tables with RLS, checks, and foreign keys; adds a nullable consent column to `User` | Low. New tables only |
| `20261031010000_ai_cost_ledger` | Adds run columns with defaults, and checks on them | Low on an empty table, which it should be |
| `20261102010000_ai_suggestions` | Adds two columns with safe defaults | Low |

- None drops, deletes, or rewrites data. The only "DELETE" matches are foreign-key `ON DELETE` rules.
- All 14 migrations replayed cleanly on a throwaway local database, which I then removed. There was no drift from the schema, and RLS was on for every table.
- I didn't read production's migration status, since that touches production. Run `migrate status` first, with approval.

## 6. Vercel Preview assessment

**Can a Preview safely use isolated resources? Yes, but they don't exist yet, and it needs care.**

Two facts matter most:

1. **Your production Supabase project is named "CareerOS Dev".** The name invites a mistake, so never point a Preview at it.
2. **Any push to this branch triggers a Vercel Preview build.** The project's documented policy is that Preview has no database or Supabase variables, which makes it a build check only. The clean-clone build confirms that works. **I can't see your Vercel settings, so please confirm no production values are scoped to Preview before any push.**

For a working Preview:

| Needed | Why |
|---|---|
| A separate Supabase project | Database, Auth, and Storage, with nothing shared. The free tier allows only two, and the docs mention two already, so **this may require a paid plan or freeing one up. It's your decision** |
| Migrations applied to that project only, through a new config and env file | `prisma.production.config.ts` must not be reused. A new one needs creating, with your approval |
| `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_URL`, **scoped to Preview only** | `APP_URL` must be a fixed HTTPS address, so use the stable branch address rather than a per-deployment one |
| That address on the isolated project's Auth redirect list | Sign-in and recovery links |
| Vercel Deployment Protection on | So only you can reach it |
| No `AI_*` service, local AI, or cloud settings | The page then offers only the rules engine |
| A resume Storage bucket on the isolated project | The app expects it |

## 7. Readiness

**Ready for a controlled Vercel Preview? Yes, with conditions.** It's technically ready: rules work with nothing else running, the build is clean, migrations replay, and no secrets are exposed.

The safety target isn't met, so I'd limit it to **you alone, with your own or fictional data, on isolated resources, behind Deployment Protection.** The remaining errors only misinform the person whose profile it is, and 0 of 33 attacks worked. That's a reasonable risk for a private test, and your call.

**Required before production:**

1. Fix the three false "supported", especially a listed skill inside a longer requirement, then reach zero on a new untouched set.
2. Have a person prepare or review a sample of labels.
3. Broaden the reviewed table beyond software, or say plainly on the page that it's strongest in software.
4. Make clear in the page that results can be wrong (the page says this now; review it for real users).
5. Back up production, run `migrate status`, and apply the four migrations in order, with your approval.
6. Confirm production's Vercel variables, and that `AI_CLOUD_ENABLED` and local AI settings stay off.
7. Review and merge the branch, and watch its first real use.
8. Decide about the retired Python code, below.

**Python code stays.** Nothing was deleted. Before removing it: the golden file is exported and the eval history is committed, but `/v1/match` still serves the disabled Anthropic path, which reuses shared validation modules, and those dependencies need separating first.

**Should remote access for your brother stay on hold? Yes.** Two reasons:

- The false "supported" should be fixed first, since he'd be relying on the results.
- **He doesn't need remote access to your laptop for the main feature.** Once production is deployed, he can use rules-only matching on Vercel with his own account and no tunnel. A tunnel would only add Ollama suggestions, so it can wait until there's a clear reason for it.

## 8. Commits

- `fdff413`: Milestone 8 freeze
- `8503602`: Set H, independent, labeled before any run
- Final commit: reports, second-rater labels, Set G review, and docs

## 9. Recommendation

1. Your decision on the isolated Preview, including the Supabase project.
2. A short Milestone 9: a listed skill inside a longer requirement, "no X" skill names, more completion wording, and a wider table for non-software fields.
3. Then Set I, ideally with a person reviewing the labels.
