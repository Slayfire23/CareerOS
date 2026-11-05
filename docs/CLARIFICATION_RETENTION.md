# Clarification answers: what's kept, and what deletion removes

For the exception review behind `CLARIFICATION_REVIEW_ENABLED`, which is off by default. This describes the local implementation. **It needs a review of real obligations before any production use. I'm not a lawyer.**

## What each action does

| Action | Effect on matching | Answer's words |
|---|---|---|
| **Edit** | The new words replace the old at once | Old version kept, marked superseded |
| **Revoke** | Stops counting at once, for every job. Stored results citing it are masked until rerun | Kept, hidden, until deleted |
| **Delete permanently** | The same as revoking | Removed, see below |

## What permanent deletion removes

- The answer, and every earlier version under the same question
- The education entry a credential answer created
- Citations quoting it in every stored analysis. Those findings are reset to Not enough information, with a note
- Local AI suggestions citing it

## What stays, and why

| Kept | Why | Contains the answer's words? |
|---|---|---|
| Audit events: action, time, question key, requirement text, verdicts, rules version | The audit trail you asked for, and rate limits that deleting can't reset | **No.** Never written there |
| `profileFingerprint` on old analyses | Detects a changed profile | A one-way hash of the profile. Not readable, though it was derived from the text |
| The job's requirement text | It's job data, not the answer | No |

Account deletion removes all of it, through database cascades.

## What deletion can't reach

| Location | Status |
|---|---|
| Database backups | Local Supabase: none configured. **Hosted backups would keep copies until they expire.** The hosted retention period must be confirmed and documented before production |
| Local AI (Ollama) | Answers can reach it as role text with AI suggestions on. It doesn't store requests by default, but that isn't enforced by CareerOS |
| Cloud AI | Disabled. If it were ever enabled, the provider's own retention terms would apply |
| Logs | CareerOS doesn't log answer text, by design and by test |
| Anything a person copied elsewhere | Out of scope |
