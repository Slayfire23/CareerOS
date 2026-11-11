# Clarification answers: what's kept, and what deletion removes

Covers both workflows: the question flow that runs with `CLARIFICATION_REVIEW_ENABLED` off, and the exception review behind that flag, which is off by default. This describes the local implementation. **It needs a review of real obligations before any production use. I'm not a lawyer.**

## What each action does

| Action | Effect on matching | Answer's words |
|---|---|---|
| **Edit** | The new words are read from scratch at once | Review: old version kept, marked superseded, until deleted. Question flow: replaced |
| **Revoke** (review only) | Stops counting at once, for every job. Stored results citing it are masked until rerun, with the flag on or off | Kept, hidden, until deleted |
| **Delete permanently** (both) | Stops counting at once | Removed, see below |

An answer is never read as ordinary role text, and no external AI provider receives it. The one exception is local shadow testing, below. Every analysis reads active answers again from scratch, so one saved under older rules has no standing.

## What permanent deletion removes

- The answer, and every earlier version under the same question
- The education entry a credential answer created
- Citations quoting it in every stored analysis. Those findings are reset to Not enough information, with a note
- Local AI suggestions citing it
- From its audit events: the requirement text, question key, verdicts, and job link

Follow-up replies (behind `FOLLOW_UP_WORKFLOW_ENABLED`, off by default) go with their answer: deleting the answer or its role removes them and their copies. A reply can also be deleted alone, which removes its words and copies; the question's record stays, without words, so it isn't asked again. A follow-up record holds offsets into the answer, never a copy of its words.

Removing a role does all of this for every answer about that role. Account deletion removes everything, through database cascades.

## What stays, and why

| Kept | Why | Contains the answer's words? |
|---|---|---|
| After deletion, audit events: action, time, rules version, and an id that no longer points at anything | Daily limits that deleting can't reset | **No.** Answer text is never written there. Before deletion they also hold the requirement text and verdicts, which deletion clears. A kept action can still say that someone answered No to something, without saying what |
| `profileFingerprint` on old analyses | Detects a changed profile | A one-way hash of the profile. Not readable, though it was derived from the text |
| The job's requirement text | It's job data, not the answer | No |

## What deletion can't reach

Checked November 4, 2026, from published documentation. **The project's own settings weren't checked: the Supabase dashboard needs the owner's sign-in, so its plan, backups, and log settings below are unverified.**

| Location | What the provider publishes | Status for this project |
|---|---|---|
| Supabase database backups | Pro: daily backups, 7 days. Team: 14 days. Enterprise: up to 30 days. Point-in-time recovery is a paid add-on with 7, 14, or 28 days. The docs say Free plan projects should export their own backups | **Unverified.** Notes from October 2026 say the project is on the Free tier. If so, there may be no Supabase backups to expire, but any manual export would keep copies indefinitely. Any restore could bring deleted answers back |
| Supabase logs | Pro: 7 days. Team: 28 days. Postgres logs can record statements if statement logging is configured | **Unverified.** Whether statement logging is on, and what the Free plan keeps, must be confirmed. Prisma sends values as parameters, but that doesn't prove they stay out of every log |
| Vercel runtime logs | Hobby: 1 hour. Pro: 1 day. Pro with Observability Plus, 30 days | **Unverified** which plan applies. CareerOS doesn't log answer text (see below) |
| Local AI (Ollama) | Not applicable | Off by default. With `INTERPRETATION_SHADOW_ENABLED`, which is refused on Vercel, `qwen3:8b` on this machine reads saved answers. Model output isn't stored; only an outcome and a reason are, and permanent deletion removes them. Ollama doesn't store requests by default, though CareerOS doesn't enforce that. Answers don't reach local AI suggestions |
| Cloud AI | Not applicable | Disabled, and answers aren't sent to it, by code and by test |
| CareerOS's own logs | Not applicable | CareerOS doesn't log answer text, by design and by test. The one AI-related log line records only an error's name |
| Anything a person copied elsewhere | Not applicable | Out of scope |

**Before any production use:** the owner should confirm the plan, any manual exports, and statement logging, and decide how a restored backup would honor earlier deletions. None of that exists yet.
