# Milestone 3: AI Engineering plan (proposal for approval)

Status: **proposal, not approved, nothing implemented.** Branch: `milestone-3-ai-matching` (created from `main` at `3fd846a`, no commits yet).

This plan aligns with PRD.md Milestone 3 ("analyze pasted job descriptions, explain qualifications and blockers … without fabricating claims") and its product principles. It does not change PRD.md or TASKS.md; proposed edits to those files are listed in §9.

---

## 1. Assessment of the current architecture (verified in code)

**What exists and can be reused**

| Area | What the code actually does | Reuse for matching |
|---|---|---|
| Identity | Supabase Auth; every page and server action calls `supabase.auth.getUser()` on the server | Next.js stays the only place that knows who the user is |
| Authorization | Prisma queries filter by `user: { supabaseAuthId }`. Updates use owner-scoped `updateMany`/`deleteMany`. RLS is enabled with no client policies | Gather evidence and save results through the same owner-scoped pattern |
| Profile data | `getCurrentProfile()` returns skills (name, optional proficiency), experience (title, company, `YYYY-MM` dates, description), education (qualification, institution, field, dates, details), projects (title, description, contribution, results, skills, links), and preferences. **Every entry has a stable UUID** | Every finding can cite exact entries by type and ID |
| Saved jobs | `SavedJob` stores the description, `requirements` JSON (`text`, `category`, `priority`, `source` excerpt), `reviewedDescription`, and `reviewVersion` (optimistic concurrency) | Input is limited to **user-confirmed** requirements, and staleness reuses `reviewVersion` |
| Manual requirement review | Rule-based suggestions; the user selects, edits, and confirms; the review is flagged stale when the description changes | Stays fully independent. AI only reads its saved output |
| Resumes | PDFs in a private Storage bucket; no structured resume table. `extractResumeText` reads text on demand, and reviewed suggestions add name, headline, and skills to the profile | Raw resume text is **unconfirmed**, so it is excluded in the first increment. Skills the user already imported from a resume are included, because they are confirmed profile entries |
| Validation style | Hand-written parsers with length limits; no schema library | Keep that style on the Next side; use Pydantic on the Python side |
| Testing | 229 unit, 25 integration (local Docker Postgres), 27 Playwright tests (local Supabase only, with a guard), and a clean no-env production build | Extend each layer |
| Deployment | Vercel (Next.js). Previews build without credentials. Production migrations are a separate, approved step | Add a separately hosted Python service |

**No AI code exists today:** no provider SDKs and no Python files. Python 3.14 is installed locally; `uv` and Ollama are not. Docker is available.

**Gaps that matter for AI**
- No rate limiting anywhere, which matters once a paid model is called.
- Projects and employment are separate tables. That makes "never treat projects as employment" enforceable in code, not just in a prompt.
- Experience durations are stored as `YYYY-MM` strings, so lengths can be computed deterministically instead of being estimated by a model.

---

## 2. Recommended integration design

**Principle: Next.js is the security boundary. The Python service is a stateless "AI compute" service.**

```
Browser ──(session cookie)──▶ Next.js on Vercel (server action)
                               1. getUser()                      ← existing auth
                               2. load OWN job + profile         ← existing owner-scoped Prisma
                               3. build minimal "evidence pack"  (IDs + text, no email/salary/location)
                               4. POST /v1/match  ──HTTPS + HMAC──▶ FastAPI (separate host)
                                                                    validate (Pydantic)
                                                                    deterministic pre-match
                                                                    LLM provider (optional)
                                                                    post-validate citations
                               5. re-validate the response ◀──────── findings JSON
                               6. save JobMatchAnalysis (owner-scoped) and render
```

- **The Python service has no database or Supabase credentials and never sees user identity.** It only processes the evidence pack Next.js sends. A bug in the Python service therefore can't read another user's data, because it has none. All cross-account protection stays in the Next.js code that is already tested.
- **Service-to-service authentication:** an HMAC-SHA256 signature over `timestamp + body`, with a shared secret held only in server-side environment variables (never `NEXT_PUBLIC_*`). FastAPI rejects:
  - a missing or bad signature
  - a timestamp more than 5 minutes old (replay protection)
  - bodies over a size limit

  HTTPS is required in production.
- **Model credentials** (for example the Anthropic API key) live only on the Python host. Neither the browser nor Vercel ever sees them.
- **Double validation:**
  - FastAPI validates its input and its model output with Pydantic.
  - Next.js independently checks that every cited evidence ID was in the pack it sent, and that every requirement index exists, before saving anything.
- **Later options, not now:** if a future feature needs the Python side to read stored data (RAG over saved jobs), we can verify the user's Supabase JWT in FastAPI, or keep pushing data from Next.js. That decision waits for a real use case.

**Deployment shape:** Vercel keeps hosting Next.js. FastAPI runs as a small container on a separate host (§7). Next.js calls it through `AI_SERVICE_URL` and `AI_SERVICE_SECRET` server variables. Previews keep no secrets, so the AI feature shows "unavailable" there.

**Timeouts and errors:**
- **Timeouts:** Next.js gives the call **45s** and FastAPI gives the provider **40s**. FastAPI retries a 429/5xx from the provider once.
- **On failure:** the user sees a clear message, nothing is saved, and the manual review is unaffected.
- **Function duration:** Vercel's maximum function duration must cover the call. This needs checking against the current plan's limit before deployment.

**Logging:** request ID, duration, provider, model, token usage, and outcome. **No profile or job text in logs.**

---

## 3. Provider choice: build a hybrid interface, start with deterministic rules plus one cloud provider

The provider interface is one small Python protocol (`generate_structured(prompt, schema) -> validated object`) with interchangeable implementations chosen by `AI_PROVIDER`:

| Provider | Role | Pros | Cons |
|---|---|---|---|
| `rules` (deterministic) | Baseline, offline, tests, fallback | Free, explainable, never hallucinates | Exact and keyword matches only (e.g. it misses "Python" ≈ "Django experience") |
| `fake` | Tests only | Repeatable end-to-end tests | Not useful for real users |
| `anthropic` (cloud) | **First real provider** | Strong reasoning; **structured outputs guarantee the JSON schema**; no hardware needed; production-ready | Paid per use; sends profile and job text to a third party |
| `ollama` (local) | Second real provider, for learning and offline use | Free, private, good hands-on learning | Needs local RAM/GPU; weaker structured-output reliability; not practical to host for production on a small budget |

**Recommendation:**
1. Build the interface plus the `rules` and `fake` providers first.
2. Add **Claude** as the first real provider. The default would be `claude-opus-5-5` ($4 / $20 per 1M input/output tokens). Cheaper options are `claude-sonnet-5-5` ($2 / $10) or `claude-haiku-5-5` ($0.10 / $0.50). **Model choice is your decision.**
3. Add Ollama afterwards for local experimentation, comparing it against the same evaluation set.

This order gives a production-quality feature first, while you still write all the Python yourself.

---

## 4. Smallest useful first AI feature: Explainable Requirement Matching (no score)

**Input:**
- The job's **saved, up-to-date, user-confirmed** requirements. Analysis is refused if the review is missing or stale.
- The evidence pack: skills, experience (with deterministically computed months per role), education, and projects. Each entry is tagged with its type and ID.

**Output per requirement:**
- `verdict`, one of:
  - `supported`: cited evidence directly satisfies it
  - `possible`: related evidence, but not clearly sufficient
  - `gap`: the relevant profile area has entries, but none satisfy it
  - `insufficient_information`: the profile has nothing relevant to judge with
- `explanation` (plain language)
- `evidence[]`: `{evidence_id, type, quote}`, where the quote must be an exact substring of that entry's text
- `caveats[]`

**Rules enforced in code, not only in the prompt** (in `validate.py`, re-checked in Next.js):
1. `supported` and `possible` need at least one cited evidence ID from the pack, and every quote must match the entry text exactly. Otherwise the finding is downgraded to `insufficient_information`.
2. **Projects never count as employment.** For an Experience-category requirement whose only evidence is projects, the verdict is capped at `possible` with the caveat "project work, not employment".
3. **Years of experience** come from the computed durations only. If the model states a different number, the finding is rejected and downgraded.
4. An empty profile area returns `insufficient_information`, never `gap`.
5. Unknown IDs, invalid categories, or malformed output reject the whole response. A failure means no result, never a guessed one.

**User review and correction:** each finding has **Agree / Disagree** and an optional note. Corrections are stored with the analysis and shown alongside it; the original output is never overwritten. The analysis is marked **out of date** when the job's `reviewVersion` or the profile fingerprint changes.

**UI:** a new page `/dashboard/jobs/[id]/match` (highlighted as "Job analysis"). It is linked from the requirement review and the Job analysis list, and labelled as an AI or rules-based assessment that may be wrong. A summary shows **counts by verdict** (e.g. "4 supported, 2 gaps"). This is descriptive, not a score; see decision D6.

**Out of scope for the first increment:** numeric scores, resume recommendations, raw resume text, RAG, agents, MCP, and automatic job import.

---

## 5. Proposed folder structure and endpoints

```
web/                                  (repo root; unchanged Next.js app)
├─ ai-service/                        NEW: Python 3.13, managed with uv
│  ├─ pyproject.toml, uv.lock, Dockerfile, README.md
│  ├─ app/
│  │  ├─ main.py           FastAPI app factory, routers, error handlers
│  │  ├─ config.py         pydantic-settings (AI_PROVIDER, secrets, timeouts, limits)
│  │  ├─ security.py       HMAC + timestamp verification dependency
│  │  ├─ schemas.py        Pydantic request/response models (shared contract)
│  │  ├─ matching/
│  │  │  ├─ evidence.py    normalization, duration maths
│  │  │  ├─ rules.py       deterministic matcher
│  │  │  ├─ validate.py    the rules in §4, citation and quote checks
│  │  │  └─ service.py     orchestrates pre-match → provider → validation
│  │  ├─ providers/        base.py (protocol), fake.py, rules.py, anthropic_provider.py, ollama_provider.py (later)
│  │  └─ prompts/match_v1.md   versioned prompt (version stored with each result)
│  └─ tests/  unit/  api/  evals/ (fixtures; real-model runs are manual and approved)
├─ contracts/match/          NEW: JSON example fixtures checked by both pytest and Vitest
├─ src/lib/ai/               NEW (server-only)
│  ├─ evidence.ts            build the evidence pack from the owned profile and job, plus fingerprint
│  ├─ client.ts              signed fetch with timeout, typed errors
│  └─ match-validation.ts    validate the response, cross-check IDs against the pack sent
├─ src/app/jobs/match-actions.ts           runJobMatch(jobId), saveMatchCorrection(...)
├─ src/app/dashboard/jobs/[id]/match/page.tsx
├─ src/components/job-match.tsx
└─ prisma/migrations/…_job_match_analysis  NEW table (local first)
```

**FastAPI endpoints**
- `GET /health`: liveness only, no details.
- `POST /v1/match`: requires HMAC. Takes `{requestId, requirements[], evidence[], options}` and returns `{findings[], provider, model, promptVersion, usage}`.

**New table** `JobMatchAnalysis`:
- `id`; `userId` and `savedJobId` (both cascade on delete, unique per job)
- `requirementsVersion`, `profileFingerprint`
- `provider`, `model`, `promptVersion`
- `findings` (Json), `corrections` (Json)
- `createdAt`, `updatedAt`

RLS is enabled with no client policies, the same as the other tables.

---

## 6. Security and testing approach

**Security**
- Owner-scoped reads and writes in Next.js only; the Python service holds no data access. A foreign `jobId` is rejected exactly like the existing requirement review.
- **Data minimization:** the pack excludes email, display name, salary, location, and links. Only text needed for matching is sent.
- **Job descriptions are untrusted text (prompt injection):** they are sent as data, the output is schema-constrained, no tools are given to the model, and code validation stops injected text from creating evidence.
- **Limits:**
  - at most 50 requirements and about 200 evidence entries
  - capped field lengths
  - **a per-user rate limit**, for example 20 analyses a day (D9)
- **Secrets:** server-only environment variables on each host, with distinct values for local and production.
- **Consent:** a one-time notice before the first cloud analysis explaining which text is sent to the provider (D2).
- The existing security follow-ups stay listed in TASKS.md.

**Testing**

| Layer | What |
|---|---|
| Python unit (pytest) | Rules matcher, duration maths, every rule in §4, schema validation, HMAC accept/reject/replay |
| Python API (FastAPI TestClient) | Auth failures, size limits, malformed input, provider timeout → clean error |
| Provider adapters | Mocked HTTP, refusal and timeout handling; no network in CI |
| Contract | Shared JSON fixtures validated by both Pydantic and the TypeScript validator |
| Next unit (Vitest) | The evidence builder excludes PII and other users' data; the response validator rejects foreign IDs, bad quotes, and project-as-employment |
| Integration (local Postgres) | The analysis is owner-scoped; foreign jobs are rejected; stale detection; corrections can't change another user's analysis |
| E2E (Playwright, local Supabase + FastAPI on the `fake` provider) | Run an analysis, see citations, correct a finding, see it go stale after editing the job. **With the AI service down, the manual review still works and the error is friendly** |
| Model evaluation (manual, approved spend) | About 10 fictional profile/job pairs. Pass requires: 0 fabricated citations, 0 projects counted as employment, 0 invented durations, and `insufficient_information` for an empty profile |

---

## 7. New infrastructure and estimated costs (estimates; verify before choosing)

| Item | Estimate | Notes |
|---|---|---|
| Claude API | One analysis is about 3–6K input and 1–3K output tokens. **Opus 5.5 ≈ $0.04–0.09, Sonnet 5.5 ≈ $0.02–0.05, Haiku 5.5 < $0.01** per analysis | Two users at about 50 analyses a month is under $10/month even on Opus. To be measured during Phase 3 |
| FastAPI hosting | About $0–7/month for a small container | Candidates: Google Cloud Run (scales to zero, pay per request), Render, Railway, Fly.io. Free tiers often sleep and cold-start in seconds. **Current prices need checking at selection time** |
| Ollama | $0 locally | Production GPU hosting isn't recommended at this scale |
| Vercel | No change expected | Check the plan's maximum function duration for a ~45s call |
| Tooling | `uv` (free), Python 3.13 | 3.13 rather than the installed 3.14, for wider library compatibility |

No vector database, queue, Redis, agent framework, or MCP server.

---

## 8. Phased roadmap and completion criteria

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Approve** | This plan plus your decisions (§9) | You approve. TASKS.md and PRD.md get the agreed edits |
| **1. Python service skeleton** (hands-on Python) | `ai-service/` with FastAPI, config, HMAC, Pydantic schemas, `rules` and `fake` providers, validators, Dockerfile, pytest | `uv run pytest` passes; the service runs locally; auth rejects bad and replayed requests; no LLM yet |
| **2. Next.js integration (rules engine)** | Evidence builder, signed client, response validator, `JobMatchAnalysis` migration (**local only**), match page, corrections, staleness, rate limit | All existing tests still pass; new unit, integration, and E2E tests pass; manual review works with the AI service stopped; clean no-env build |
| **3. Cloud provider** | `anthropic` provider with structured outputs, prompt v1, refusal and timeout handling, usage logging, feature flag | The evaluation set meets every pass criterion in §6 (approved spend); measured cost per analysis is reported |
| **4. Deploy** (each step needs approval) | Host FastAPI, set secrets, **production migration**, consent notice, enable for your account first | Verified in production by you; the manual review is unaffected; logs show no user text |
| **5. Ollama provider** | Local provider for learning and offline use | Same evaluation set run and compared with the cloud results |
| Later, only with a demonstrated need | Confirmed resume-derived evidence, resume recommendations (rest of Milestone 3), transparent scoring (only with an agreed method), RAG, agents and MCP | A separate plan for each |

---

## 9. Decisions that need your approval

| # | Decision | My recommendation |
|---|---|---|
| D1 | First real provider and model | Claude first (`claude-opus-5-5` by default; Sonnet or Haiku 5.5 if you prefer lower cost), Ollama second |
| D2 | Sending job and profile text to a cloud provider | Yes, with a one-time per-user notice; the rules engine stays available without it |
| D3 | FastAPI host | Pick after a price check; Cloud Run or Render are likely |
| D4 | New `JobMatchAnalysis` table (local now, production migration later) | Yes; one current analysis per job, with corrections kept |
| D5 | Exclude raw resume text in the first increment | Yes; only confirmed profile entries count as evidence |
| D6 | Verdict counts shown as a summary, with no score | Yes; counts are descriptive, not a fit score |
| D7 | Python tooling | `uv`, Python 3.13, FastAPI, Pydantic v2, pytest, ruff |
| D8 | Analysis page | Separate `/dashboard/jobs/[id]/match`, keeping the manual review untouched |
| D9 | Per-user rate limit | 20 analyses per day to start |
| D10 | CI | Optional: a GitHub Actions workflow for pytest, Vitest, and the type check (no secrets) |
| D11 | Docs | When approved, update TASKS.md (Milestone 3 checklist; security follow-ups stay visible) and PRD.md (note the matching design and the "no score" rule). Add an ARCHITECTURE.md section and `ai-service/README.md` |

Nothing will be implemented, pushed, deployed, or migrated until you approve.
