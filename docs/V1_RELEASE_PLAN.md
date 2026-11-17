# CareerOS V1: release plan (D1 approved; D2–D6 recommended, not authorized)

November 16, 2026. Planning only: nothing implemented; R4 and the Stage G FAIL untouched; no hosted access; PR #4 open.

**Target:** a reliable, user-reviewed V1. Verdicts come from the deterministic rules engine, AI costs nothing, and the user approves the final assessment.

## 1. D1: APPROVED. Option B: rules-first production, $0 paid AI

- **Production verdicts** come from the existing rules engine (`provider: "rules"`), which already decides every verdict today.
- **No paid AI:** no cloud AI calls, subscriptions or paid infrastructure. Cloud stays off: `AI_CLOUD_ENABLED` is unset in production, and the cloud provider fails closed without it.
- **Local AI** suggestions (assisted, qwen3:8b) stay available on supported development machines. They are refused on Vercel by design, so production never needs them.
- **The whole workflow works without any AI service.** Rules analysis, answers, rechecks and staleness are all in-process.
- **Compatible with optional cloud AI later:** the cloud provider (consent, allowlist, redaction, cost ledger) stays in the code, off.
- **Labeling:** production results show the method as **"Rules engine (rules-vN)"** (`methodLabel`). V1 copy must never call rules analysis "AI analysis"; that's checked in Stage 2.

## 2. The V1 workflow, mapped to existing code

| Step | Existing | V1 change |
|---|---|---|
| 1. Add a job posting | `saveJob` (job form) | None |
| 2. Extract requirements | `suggestRequirements` (rules), plus the review page to include, edit or add rows | None required. Optional small fallback for postings without headings (Stage 2) |
| 3. Automatic analysis against the profile, résumé, projects and experience | Rules analysis of skills, roles, education, projects and answers. **Résumé content enters through résumé review**: suggestions the user applies to the profile. Raw résumé text is deliberately never used (data minimization) | **Start the rules analysis automatically** after reviewed requirements are saved, instead of a manual "Run analysis" click (Stage 2) |
| 4. One review page: every requirement, verdict, evidence, uncertainty | The match page lists every requirement with its verdict (Supported, Possible, Not enough information, Not supported), explanation, cited evidence, "Self-reported" labels and stale notices. Review mode adds the queue of open questions | A clear per-requirement decision state and "review your assessment" copy (Stage 3) |
| 5. Confirm, correct, reject, add | Agree/Disagree plus a note (`saveMatchFeedback`); review actions to confirm (detail or entry), correct, deny, skip, revoke and delete; the profile pages | Record **"Not claimed"** (reject) per requirement for the approval snapshot. No verdict rule changes (Stages 3–4) |
| 6. Recalculate | Saving an answer triggers a free rules recheck. Supported needs the person's specific words read by the rules. Gate A protections (instructions, someone else's work, corrections). Staleness | A visible "Recalculate" using the same recheck path (Stage 4) |
| 7. Final approval | — | **New** (Stage 5) |
| 8. Save with an audit trail | Analyses and runs are already persisted | **New** `AssessmentApproval` record (Stage 5) |

**Invariant, tested in Stages 4–6:** user confirmation never turns a finding into Supported. Supported comes only from the rules reading the person's specific words or profile evidence. "Agree" records agreement; "Not claimed" can only lower what's recorded as claimed. Ownership, contradiction, correction and evidence safeguards stay exactly as they are.

## 3. D2–D6: recommendations (not authorized)

| # | Recommendation | Dependencies | Risks | Exact consequences |
|---|---|---|---|---|
| **D2: adopt `v21a`** | **Adopt.** It closes the free-text correction bypass. The prerequisites are done: save-time v21-family check, rules-version staleness, the correction browser test | None (Stage 1) | Measured effect on opened data: 0 of 1,542 texts, 0 of 284 parity rows, 0 of 320 replies. Only explicit corrections change. The known same-sentence limitation is unchanged | <ul><li>`DEFAULT_TEXT_RULES` becomes `"v21a"`; `RULES_VERSION` follows (`rules-v21a`).</li><li>The local test switch is generalized so tests can still select `"v21"` (rollback testing).</li><li>Update the allowlist and version tests (`ai-rules-v20/21/22`, `structured-audit`, `reader-v21a`, `test-reader`, `adoption-readiness`).</li><li>Any stored local analysis shows "the matching rules have been updated" until re-run.</li><li>**Production has no stored analyses yet:** `main` predates the analysis tables, so nobody there sees a stale notice.</li><li>Rollback: flip the default back.</li></ul> |
| **D3: review mode in production** | **Enable** (`CLARIFICATION_REVIEW_ENABLED=true`). One queue for every open requirement; the confirm, correct, deny and skip actions V1 needs already exist there | Stage 3 builds on it. The `clarification_review` migration must be applied in production | Review mode has been tested locally only. Its answer limit (30 events per day per user) may frustrate heavy users | <ul><li>The basic "Question about requirement N" flow is replaced by the review queue in production.</li><li>The structured "your part" form stays off (refused on Vercel).</li><li>The follow-up workflow stays off (it needs a local model).</li><li>`job-review.spec.ts` becomes a release spec; `job-clarification.spec.ts` stays for flags-off coverage.</li></ul> |
| **D4: approval table** | **Approve one additive migration**: `AssessmentApproval` | Stage 5. Rehearsed in CI (the existing migration replay and drift check) | Low: a new table only; no change to existing tables | <ul><li>Columns: `id`, `userId`, `savedJobId`, `analysisId` (unique), `approvedAt`, `methodVersion`, `requirementsVersion`, `profileFingerprint`, `decisions` (JSON, one per requirement: CareerOS verdict, user decision, note, evidence ids), optional `note`.</li><li>Composite FKs to the same user's job and analysis; cascade on job delete; RLS enabled like every table.</li><li>Pending migrations for production become **10**.</li></ul> |
| **D5: Next.js patch** | **Patch** `next` 16.4.1 → **16.4.5 or a later 16.4.x**. GHSA-mfr8-8qww-v76h is moderate, and the affected API (`'use cache'` via `unstable_cache`) isn't used | Needs your approval to **download the package** from npm (and update the lockfile) | Low. A patch release; full gates re-run. Also removes the build-time agent nudge | Changes `package.json` and `package-lock.json` only; no code change expected |
| **D6: release path** | **Rehearse, then migrate, then merge** (below) | D2–D5 done; Stage 6 green; you run every hosted step | **(1)** Production's migration state is unknown to me (no access by design). **(2)** Commit `3d7deeb` *edited* the RLS migration `20261028010000_enable_row_level_security`, which is already on `main` and probably already applied in production. Prisma may report a checksum mismatch at deploy. **(3)** Vercel deploys `main` automatically, and its build doesn't run migrations, so merging before migrating would break production | See §3.1 |

### 3.1 D6 release path (every hosted step is run by you)

1. **Release candidate.** After Stage 6, PR #4 (`milestone-3-ai-matching` → `main`) is the release PR. The branch is a strict superset of `main` (0 commits on `main` that aren't on the branch), so it merges without conflicts.
2. **Confirm production's state.** In Supabase SQL, list `_prisma_migrations`. Expected: through `20261028010000_enable_row_level_security`. I can give you the read-only query. **Expected pending:** `ai_analysis`, `ai_cost_ledger`, `ai_suggestions`, `candidate_clarifications`, `clarification_review`, `clarification_follow_up`, `structured_ownership`, `structured_matching_audit`, plus the new approval migration.
3. **Resolve the edited RLS migration before any deploy.** Rehearse `prisma migrate deploy` against a copy whose `_prisma_migrations` has the original checksum.
   - If Prisma refuses: either restore the original file and move the guard into a new idempotent migration, or mark it with `prisma migrate resolve`. Your decision.
   - Recommended: restore the original file, and add the shadow-replay guard as a new migration.
4. **Staging rehearsal at $0.** Use a second free Supabase project, restored from a schema-only dump of production (you take it), plus a Vercel **preview** deployment of the release branch with the production environment: review mode on, AI unset, the daily limit set. Run the V1 smoke browser tests against the preview.
5. **Production.**
   - (a) Back up: a manual `pg_dump` (the free tier has no point-in-time recovery).
   - (b) Run `prisma migrate deploy` from your machine against production. Every migration is additive, so the current `main` code keeps working.
   - (c) Set the Vercel production environment variables.
   - (d) Merge PR #4, which deploys.
   - (e) Smoke test with a disposable account.
6. **Rollback.** Code: Vercel's instant rollback to the previous deployment. Database: the additive migrations stay harmless to old code; restore from the dump only if necessary.

## 4. Shortest safe critical path

| Stage | Scope | Days | Depends on | Can run in parallel with |
|---|---|---|---|---|
| **1. Release baseline** | D5 (Next.js patch) + D2 (`v21a` default) | **1** | D2, D5 approvals | 2, 5 |
| **2. Automatic analysis and honest labels** | Run rules analysis automatically after reviewed requirements are saved (same limits and run audit); land on the review page; audit the copy so nothing calls rules "AI"; optional heading-less extraction fallback | **1** | — | 1, 5 |
| **3. One review page** | A per-requirement decision state (Agree, Not claimed, answer or add experience, Skip) on top of the existing findings and review queue (D3); uncertainty shown with plain reasons; no verdict-logic change | **1.5** | D3 | 5 (once the decision shape is fixed) |
| **4. Corrections and recalculation** | Wire the decisions into the existing review actions; "Recalculate" uses the free recheck; record Not claimed | **1** | 3 | — |
| **5. Approval and audit trail** | The `AssessmentApproval` migration, the `approveAssessment` action, its guards (owner, latest, current, every requirement decided), the snapshot, and the read-only approved view with history | **2** | D4 | 1, 2, 3 (backend first; UI hook after 3) |
| **6. Release candidate** | Full gates, every release browser spec, accessibility, a security review of the new action, README and limitations | **1** | 1–5 | — |
| **7. Release** | §3.1 steps 2–6 | **1** + your time | 6, D6 | — |

**Critical path:** 1 → 3 → 4 → 6 → 7, with 2 and 5 alongside. **About 8.5 working days**, or about 7 with stages 2 and 5 developed in parallel in separate worktrees (never link `node_modules`). This fits the 7–9-day target **if** the D6 rehearsal finds no migration surprises.

**Needs your explicit approval:**
- D2–D6;
- the npm download for D5;
- the approval migration;
- any production environment change;
- the production dump, the backup and running migrations;
- merging PR #4 (which deploys);
- the production smoke-test account.

## 5. Required tests and release blockers

**Per stage:** unit, integration (solo), TypeScript, lint, prisma validate, build, the sealed guard (12 of 12), and engine and follow-up parity where reading code is touched.

**Release browser specs** (paced to the answer limits):
- `job-requirements`, `job-match`, `job-review` (review mode), `job-corrections` (default server after D2), `account-isolation`, `job-clarification` (flags-off coverage);
- **a new V1 flow spec:** add posting → automatic analysis → review → confirm, correct, reject and add → recalculate → approve → reload and see the approved record → it can't be approved when stale or undecided → another account can't see it.

**Release blockers:**
1. D2–D6 approvals.
2. Production migration state confirmed, and the edited RLS migration resolved in rehearsal.
3. The Next.js patch.
4. A green staging rehearsal.
5. A production backup taken.
6. The CI workflow (`app.yml`: secrets, prisma, TypeScript, lint, unit, build, migration replay and drift, integration) green on the release PR.

## 6. A complete, portfolio-ready V1

1. A live URL where the 8-step workflow works end to end with **no AI service and $0 AI cost**.
2. **Honest labels throughout:** "Rules engine", "Self-reported", "CareerOS hasn't independently verified it"; never "AI analysis" for rules results.
3. **Approved assessments are stored, read-only, auditable** (method version, requirement version, profile fingerprint, decisions, time) and viewable after reload.
4. Privacy and safety intact: account isolation, RLS, data minimization, save-time validation, Gate A correction safeguards, rate limits.
5. CI green; release browser specs green; known limitations published:
   - the same-sentence correction loss;
   - relevance over-credit ("greet patients");
   - heuristic requirement extraction;
   - Stage G FAIL (structured matching isn't part of V1).
6. A README with architecture, the rules-first rationale, screenshots and limitations.

## 7. Recurring costs, free-tier limits and production constraints

Verify the current terms on each provider's pricing page before release.

| Item | Cost | Limit or constraint that matters for V1 |
|---|---|---|
| AI | **$0** | Cloud off. Local AI is development only |
| Vercel (Hobby, assumed: the plan in use is unverified) | $0 | Hobby is for personal, non-commercial use, which suits a portfolio. Serverless function time limits apply. Runtime logs are kept briefly (CareerOS doesn't log answer text) |
| Supabase (free tier) | $0 | **Inactive free projects are paused** (about a week without activity); a portfolio demo may need a wake-up visit. Database and storage size caps (résumé files count). **No point-in-time recovery:** take manual dumps. Built-in auth email is heavily rate-limited (see `AUTH_EMAIL_SETUP.md`). Up to two free projects (one can be staging) |
| GitHub Actions | $0 within free minutes | The integration job uses a Postgres service. Minutes count on private repositories |
| Domain | Optional (about $10–15 a year) | The `vercel.app` URL is fine for a portfolio |
| Application limits | — | Analyses: `AI_ANALYSIS_DAILY_LIMIT` (default 20 per day per user). Answers: 30 per day per user in each answer flow |

## 8. Deferred until after V1

- Structured "your part" form and structured matching.
- The follow-up workflow and interpretation shadow.
- Cloud AI (kept, off).
- The narrowing-correction rule R0–R5, PE1/PE2 and the PE2 component list; `v21b`.
- The same-sentence correction fix.
- Gates B, C and D.
- AI requirement extraction.
- A new sealed evaluation.
- Advanced matching rules.
