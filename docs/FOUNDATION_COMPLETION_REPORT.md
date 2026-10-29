# CareerOS — Foundation Completion Report

Date: October 28, 2026. Branch: `foundation-verification` (from `main` at `638f14a`).
Scope: verify the existing foundation, focusing on the October 26 job-requirements milestone, before any Python, RAG, agent, or MCP work.

Evidence labels:

- **Executed**: run by the agent during this audit.
- **Recorded**: earlier result in TESTING.md (agent-run or owner-supplied output); not re-run here.
- **Owner-confirmed**: manual live check reported by the owner.
- **Observed**: read-only check of the live site or hosted database.

No production data was modified. No migration was applied, nothing was deployed, and nothing was merged.

## 1. Check results (executed October 28)

| Check | Result |
|---|---|
| `npm test` (Vitest) | 224 passed, 15 files |
| Integration tests (local Docker PostgreSQL, port 5433) | 24 passed |
| Local `prisma migrate status` | 10/10 migrations applied |
| `npm run typecheck` / `npm run lint` | Passed |
| `npm run build` | Passed; includes `/jobs/[id]/requirements` |
| `npm audit` and `npm audit --omit=dev` | 0 vulnerabilities after a non-forced fix (see §5) |
| Playwright, signed-out specs (`signed-out`, `recovery-pages`) | 6/6 passed against `next start` with `DATABASE_URL` set to the local test database |
| Playwright, the 16 signed-in specs | **Not run.** They sign in to the hosted Supabase project, and `resumes.spec.ts` uploads to its Storage. Latest recorded run: 22/22 on October 26 |
| Hosted `prisma migrate status` (read-only) | 10/10 applied, including `20261026010000_job_requirements` |
| Live site probe (read-only, signed out) | `/jobs/<uuid>/requirements` serves the route and redirects to `/login` |

## 2. Migration `20261026010000_job_requirements`

Additive only: `SavedJob` gains `requirements JSONB NOT NULL DEFAULT '[]'`, `reviewedDescription VARCHAR(30000) NULL`, and `reviewVersion INTEGER NOT NULL DEFAULT 0`. Existing rows keep their data and get safe defaults.

- Local test database: applied (executed).
- Hosted database: applied (observed). TASKS.md said this was pending; that entry was out of date and is now corrected.
- Deployment: the live route exists (observed), so the code is deployed.

## 3. Job-requirement review: verified behavior

I read [src/lib/job-requirements.ts](../src/lib/job-requirements.ts), [src/app/jobs/requirements-actions.ts](../src/app/jobs/requirements-actions.ts), [src/components/job-requirements-review.tsx](../src/components/job-requirements-review.tsx), and [src/app/jobs/[id]/requirements/page.tsx](../src/app/jobs/[id]/requirements/page.tsx), plus their tests.

| Behavior | Code | Automated evidence |
|---|---|---|
| Suggestions come from description lines only; nothing is saved until the user selects and confirms | Yes | Unit (executed), browser (recorded) |
| Edit text/category/priority; add manual rows; remove rows | Yes | Browser (recorded) |
| Save replaces the list with only the selected rows | Yes | Integration (executed), browser (recorded) |
| Clearing (save with none selected) | Yes | Integration (executed), browser (recorded) |
| Ownership: page uses `findFirst` scoped to the user; save uses `updateMany` scoped to the user | Yes | Integration: foreign-account save rejected (executed); browser 404 for account B (recorded) |
| Optimistic concurrency (stale `reviewVersion` rejected) and stale description rejected | Yes | Integration (executed) |
| Changed-description warning; saved rows start unselected | Yes | Browser (recorded) |
| Source excerpts must still appear in the current description | Yes | Unit and integration (executed) |
| Lost session and missing confirmation rejected | Yes | Unit and integration (executed) |
| **Live** review/save/edit/clear | — | **Not confirmed by the owner** |

I probed the suggestion heuristics directly (CRLF input, numbered lists, `Must have:` headings, inline headings, empty bullets, malformed rows). I found no correctness or security defect. These are known limitations, not blockers, and the UI already says suggestions may miss items:

- A heading ending in `:` that isn't on the allow-list (for example `Must have:` or `What you'll need:`) ends the section, so its bullets aren't suggested.
- Numbered prefixes (`1.`, `2)`) stay in the requirement text.
- After clearing a review, or when the description changes, automatic suggestions aren't shown again. The user can only re-add rows manually. **Recommended follow-up:** also offer fresh suggestions in that state.
- The submitted `baseDescription` must match the stored description byte for byte. Newline round-tripping is verified in Chromium only.

## 4. Feature status matrix

| Area | Implemented | Automated tests | Deployed | Live manual verification |
|---|---|---|---|---|
| Auth: signup, confirm, sign-in/out, recovery | Yes | Unit + browser | Yes | Owner-confirmed |
| Profile basics and preferences | Yes | Unit + integration + browser | Yes | Owner-confirmed |
| Technical skills, experience, location, salary | Yes | Unit + integration + browser | Yes | Owner-confirmed |
| Education | Yes | Unit + integration + browser | Yes (hosted migration applied) | **Not explicitly confirmed** (TASKS.md open item) |
| Projects/accomplishments | Yes | Unit + integration + browser | Yes | Owner-confirmed |
| Private resumes (Storage + RLS) | Yes | Unit (Storage mocked) + browser two-account RLS (recorded) | Yes | Owner-confirmed |
| Resume-assisted review | Yes | Unit + integration + browser | Yes | Owner-confirmed |
| Saved jobs | Yes | Unit + integration + browser | Yes | Owner-confirmed |
| Job-requirements review | Yes | Unit + integration (executed) + browser (recorded) | Yes (observed) | **Pending** |

## 5. Defects fixed in this audit (commit `ddc7f5d`)

1. **Corrupted characters in docs.** TASKS.md, TESTING.md, and ARCHITECTURE.md each contained a Windows-1252 em-dash byte (`0x97`), which showed as `�` on GitHub. Replaced with UTF-8 `—`. One byte per file; nothing else changed.
2. **Committed Chromium crash log.** `debug.log` was tracked. It is now untracked and ignored; the local file is kept.
3. **Dependency advisory.** A moderate `fast-uri` advisory, reached through `prisma` → `@prisma/dev` → `ajv`. Applied the non-forced `npm audit fix` (lockfile 3.1.8 → 3.1.9). Unit, integration, typecheck, and lint all re-ran green afterwards. The October 15 braces/ESLint advisory is no longer reported.

No application code needed changes.

## 6. Remaining blockers before the AI Engineering phase

| # | Blocker | Why it blocks | Acceptance criteria |
|---|---|---|---|
| B1 | **Dev/test data is not separated from the live Supabase project.** The local `.env` `DATABASE_URL` points at the live database. Browser tests sign in to live Auth, and the resume test writes to live Storage. | AI work adds schema (for example embeddings) and fixtures. TASKS.md already requires separation "before risky schema or fixture work". | A separate development Supabase project (or an equivalent isolated Auth/Storage/Postgres) exists. `.env` points at it by default. Browser tests run there. Hosted production credentials are used only for reviewed migrations and deploys. |
| B2 | **The full signed-in browser suite was not re-run in this audit.** | The suite is the regression gate for every profile feature that AI features will read. | All 22 Chromium tests pass on this branch against the isolated environment from B1 (or against the current setup, with your approval). |
| B3 | **Live job-requirements verification is pending.** | It is the newest deployed feature and the direct input to Milestone 3 analysis. | Owner confirms on the live site: review → select/edit → save → reload persists; manual add; edit the job description → stale warning; clear → empty list; another account gets a 404. |
| B4 | **Live education verification is pending.** | It is the only deployed profile section without live confirmation. | Owner confirms live add/edit/remove and persistence after refresh. |

## 7. Open security follow-ups (non-blocking for local AI prototyping; blocking for broader public use)

- Real access-token expiration, refresh success/failure, and revoked sessions. Clearing cookies is not equivalent.
- Crafted cross-account HTTP/server-action requests. Today, forged IDs are covered by calling server actions in integration tests, and ownership filters are present in every query reviewed. Raw HTTP requests are not tested.
- Real used or expired email-link rejection.
- Production RLS policy re-verification after the dev/prod split.
- Email delivery to each real recipient; custom SMTP before wider use.
- Resume uploads: malware scanning, quotas, and version grouping.

## 8. Recommendation

**NO-GO** for starting the AI Engineering phase today. The code itself is in good shape: every check that could run in this environment passed, and no application defects were found. The blockers are environment and verification gaps, not code quality.

Once B1–B4 are closed, the foundation meets its acceptance criteria and it is **GO**. B3 and B4 take a few minutes of manual checking. B2 follows from B1. B1, the dev/prod separation, is the one with real setup effort.
