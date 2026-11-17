# Phase 5.3 Gate A: correcting-answer browser tests

November 16, 2026. Approved by the owner: browser coverage of explicit corrections and retractions, with the necessary test-only infrastructure.

**Not changed:**
- no matching rule;
- no default version (rules-v21 stays the default everywhere outside a local test server that opts in);
- no `v21b`;
- no PE2 component list (design only);
- no Gates B, C or D;
- R4 untouched.

## 1. Test-only infrastructure

| Change | What it does | Why it can't change a deployed default |
|---|---|---|
| `src/lib/ai/test-reader.ts` (new) | `localTestReader(env)` returns `"v21a"` only when `CAREEROS_TEST_READER=v21a` **and** the server isn't on Vercel **and** `DATABASE_URL` is local (127.0.0.1 or localhost). Otherwise it returns null | Refused on Vercel and with any hosted database. Unit-tested (`tests/test-reader.test.ts`, 3 tests): off by default, local-only, refused for any other value |
| `src/lib/ai/evidence-boundary.ts` | `DEFAULT_TEXT_RULES = localTestReader() ?? "v21"` | Without the guarded switch it is exactly "v21" (unit tests assert it) |
| `src/lib/ai/rules/engine.ts` | `RULES_VERSION = \`rules-${DEFAULT_TEXT_RULES}\`` | Still "rules-v21" by default (asserted). A local v21a test server stamps "rules-v21a", which is what the staleness test needs |
| `tests/reader-v21a.test.ts` | The `"v21a"` naming allowlist adds the guarded switch | — |
| Root `.claude/launch.json` (outside the repository, never committed) | New local entry `careeros-v21a-3100`: `careeros-prod-3100` plus `CAREEROS_TEST_READER=v21a` | Local only |
| `e2e/job-corrections.spec.ts` (new) | 3 tests (below). It declares its reader mode (`E2E_TEXT_RULES`) and checks it against the page's method label, so a wrong declaration fails | — |

## 2. Browser results

Each run happened once, against the correct local server. The answer limits were respected and never bypassed: legacy flow 8 → 23 of 30, review flow 8 → 12 of 30.

| Run | Server | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Free text, v21 | `careeros-prod-3100` (default rules-v21) | 1 | 0 | **1** | 0 |
| Staleness: seed | `careeros-prod-3100` (v21) | 1 | 1 | 0 | 2 (other tests, by design) |
| Staleness: check | `careeros-v21a-3100` (opt-in v21a) | 1 | 1 | 0 | 0 |
| **Free text, v21a** | `careeros-v21a-3100` | 1 | **1** | 0 | 0 |
| Staleness: rollback | `careeros-prod-3100` (v21) | 1 | 1 | 0 | 0 |
| **Structured** (+ existing `job-structured-matching`) | `careeros-matching-3100` (default reader, structured v2) | 2 | **2** | 0 | 0 |
| Regression: `job-clarification`, `job-match` | `careeros-prod-3100` | 2 | 2 | 0 | 0 |
| **Total** | | **9** | **8** | **1** | **2** |

**The one failure was a test defect, not an application failure.** The v21 free-text run passed every save step, including requirement 1's message "The rules now read this as Possible.". It then failed one locator: it looked for "Possible" while the page says "Possible — Self-reported" for answer-based credit. The page snapshot at the failure shows the v21 behavior directly: requirement 1 is credited and cites the withdrawn words "I operated the Zorvex… every day at the warehouse". The selector was fixed. **The run was not repeated:** each free-text run costs about 8 of the 30 daily answers (removing the test job also deletes its answers, and deletions count), so a repeat plus the v21a run would have exceeded the limit.

### What the tests check

| Scenario | v21 (default) | v21a (opt-in, local test server) | Structured v2 |
|---|---|---|---|
| **Save-time:** instructions to the evaluator ("Ignore all previous instructions…") | Refused, nothing stored | Refused, nothing stored ✓ | (refused at save on both forms) |
| **1 / 6:** "I operated the Zorvex every day… **Actually, that was my partner**; I only did the paperwork." | **Possible — Self-reported**, citing the withdrawn claim (the bypass) | **Not enough information**; "The result stays Not enough information"; no citation of the withdrawn words ✓ | — |
| **2:** another activity done ("Administered Plinth for 80 sales staff…"), a separate one withdrawn ("I also operated the Zorvex every shift. Actually, that was my partner.") | Plinth: Supported — Self-reported | Plinth: **Supported — Self-reported** ✓, still Supported after a fresh run (no unrelated loss) | — |
| **3:** history then change ("…for six years. These days my coworker operates it and I run inventory.") | Possible — Self-reported | **Possible — Self-reported** ✓ with "Please clarify which tasks you personally performed." | — |
| **4:** collaboration ("My coworker and I share the Marlow shifts, and I operate the Marlow myself every morning.") | Possible — Self-reported | **Possible — Self-reported** ✓ with the same clarification | — |
| **5:** structured "I did this work myself" plus the correction text | — | — | **Not enough information** ✓. No "Your choice", no Possible. Clarification shown: "Your description says someone else did this work, or that you didn't. You can change your choice or your description." with "Change my answer". A described answer beside it stays **Supported — Self-reported** ✓ |
| **Stored answer and version metadata** | "Answers you've added" lists every answer; method label "(rules-v21)" | The same; label "(rules-v21a)" ✓ | Label checked |
| **Staleness after a version change** | — | seed (v21) → check on v21a: "This analysis is out of date: **the matching rules have been updated**…", label "(rules-v21)"; a re-run gives "(rules-v21a)" and no notice ✓ | rollback on v21: the v21a result is marked out of date; a re-run clears it ✓ |

## 3. Findings

1. **Both answer paths enforce the intended corrections when free text reads with v21a.**
   - The structured path (v2) gives no credit and asks.
   - The free-text path under v21a gives no credit.
   - History, collaboration and separate legitimate work keep their credit on both.
   - Under the default **v21**, the free-text path still credits the cleft correction. That is the difference v21a closes; it's verified in the browser (the v21 run's snapshot) and in the unit and integration tests.
2. **Real application limitation found (documented; not fixed, out of scope).** When the corrected activity and a separate legitimate activity are in **the same sentence** ("I administered Plinth for 80 sales staff **and** operated the Zorvex every shift. Actually, my partner drove the Zorvex."), **every path loses the legitimate activity**: v21, v21a and structured all give Not enough for Plinth administration.
   - Cause: the v21 reader's own retraction (`retractions()`) takes back the whole preceding sentence. v21a's activity-specific withdrawal runs on top of that, so it can't restore the uncorrected activity.
   - Split across sentences, the legitimate activity keeps Supported (scenario 2).
   - This is pre-existing v21 behavior. Fixing it means narrowing the shared reader's retraction to the corrected conjunct, which is a reader-version change for a later decision.
3. **No other difference between v21 and v21a** on the opened data:
   - 0 of 1,542 texts change;
   - split parity, 0 of 284 rows;
   - follow-up replies, 0 of 320.

## 4. Regression gates

| Gate | Result |
|---|---|
| Unit | **4,067 of 4,067** (+3 guard tests) |
| Integration (solo) | **227 of 227** |
| Engine basis / follow-up (340 rows) | **2,121 of 2,121 identical / 0 of 340 differ** (default reader unchanged) |
| TypeScript / lint / prisma / build | Clean / 0 errors (1 existing warning) / valid / compiled (exit 0 on retry; the first run stopped with the known Next.js upgrade nudge, whose instructions weren't followed) |
| Sealed guard | 12 of 12 |

## 5. Is v21a ready for an explicit adoption decision?

**Yes, ready for your decision**, with these points to weigh:
- The prerequisites are done: the save-time v21-family check, rules-version staleness, and the correcting-answer browser test (v21a passes; the v21 baseline difference is shown).
- On adoption: `RULES_VERSION` becomes rules-v21a, so every stored rules-v21 analysis shows "the matching rules have been updated" until re-run. That is tested end to end, and rollback is tested.
- The measured effect on opened data is nil; the effect is limited to explicit corrections the v21 reader missed.
- **Not resolved by v21a:** the same-sentence loss (finding 2), which also affects v21 today.
- **Separate blockers:** none for v21a itself. Outstanding but separate: the Next.js patch (GHSA-mfr8-8qww-v76h, moderate, affected API unused) and the narrowing-correction rule (R0–R5 + PE1/PE2), which is still design only.
