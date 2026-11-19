# Phase 5.3 Gate A (continued): the opt-in free-text reader `v21a`

November 16, 2026. Approved by the owner as a continuation of Gate A. **Not** Gate B, C or D, and not rules-v22. Constraints held:
- **Default unchanged:** rules-v21 behaves exactly as before, and the production default is still rules-v21 (`RULES_VERSION` rules-v21).
- **Opt-in only:** `v21a` is selectable, and nothing in the application selects it.
- **Development data:** synthetic and opened only. R4 and the Stage G result are untouched.

## 1. Version boundary and code changes

| | |
|---|---|
| **Version** | `TextRules` gains `"v21a"`: **rules-v21 plus one rule** (explicit withdrawals). It is in the v21 family (`isV21Family`), so every v21 rule applies. The default stays `"v21"`. A test enforces that only the reader library names `"v21a"` and that no application code selects it |
| **One definition** | New `src/lib/ai/withdrawals.ts` (pure, no imports): `withdrawnClaims` / `withoutWithdrawn`. Structured matching v2's A3 guard and the `v21a` reader both read corrections through it. The Gate A rules moved here unchanged, and the structured verdicts on all 1,542 opened texts are identical to the Gate A commit |
| **Activity-specific** | When a corrected claim joins activities ("I operate the forklift **and** pack orders") and the correction names one ("Actually, my partner drove the forklift"), only that activity's part is withdrawn |
| **Reader (`evidence-boundary.ts`)** | Under `v21a` only, `answerStatements` also leaves out the claims `withdrawnClaims` finds, beside the v21 retractions |
| **Answer reading (`answer-review.ts`)** | `laterOwnDenial` moved here unchanged; structured v2 re-exports it. Under `v21a` only: a later own denial of the activity gives no credit (`withdrawn_by_own_denial`). Own work left on the activity right after its withdrawal is **Possible at most**, as structured v2 reads the same answer |
| Structured guard | `structured-ownership-guards.ts` imports the shared definitions; no behavior change |

Under `v21a`, these are withdrawals:
- **To someone else:** "Actually, that was my partner"; "it was Sam"; "…, but to be honest it was my brother who drove it"; "But to be honest, my brother did that"; "In fact, that was my lead, not me".
- **Denials:** "Actually, I never processed payroll", and a later own sentence denying the activity.

**Not withdrawals:** narrowing ("I only…"), adding ("I also…"), a change over time ("now", "these days", "no longer", "before"), and a denial first ("I never drove one before this job, but now…").

## 2. Synthetic controls (`tests/reader-v21a.test.ts`, 34 tests; Gate A's 75 still pass)

| Group | Result |
|---|---|
| **Withdrawals, both paths end to end** (free text: engine + `applyAnswers` + validator under `v21a`; structured: v2 pipeline). 12 cases: to someone else (cleft, after "but", "my brother did that", named, "not me", ×2 payroll, welding), correction to a denial, later denial ×2, multi-activity with the corrected activity asked | **12 of 12: no credit on both paths** |
| Partial withdrawal (own work on the activity left) | Possible at most on **both** paths, the same level |
| **Legitimate experience** (14), `v21a` identical to v21 on free text, with structured never "no credit" where free text keeps credit: multi-activity with the other activity asked; history then a change ×3; collaboration; shared duty; own work beside a coworker; an unrelated own task; narrowing; adding; narrowing the reader handles; negation first; negation of something else; "Actually" as emphasis | 14 of 14 |
| Activity-specific withdrawal | Only "I operate the forklift" is withdrawn; "Order packing" keeps its v21 reading |
| **D3** non-English | `v21a` reading equals v21 (`language_not_evaluated`); structured stays unread at Possible |
| Opt-in | Default rules-v21; under v21 the free-text bypass is unchanged (the test records it), which is what `v21a` closes once adopted |

## 3. Regression gates

| Gate | Result |
|---|---|
| Unit | **4,051 of 4,051** (4,017 + 34) |
| rules-v21 free text on every opened text (1,542) | `v21a` against v21: **0 changes**. None of the opened texts has the cleft or "but to be honest" pattern or a later own denial |
| Structured matching on every opened text | **0 changes** against the Gate A commit (`43e064d`) |
| splits-v1.1 parity | 284 of 284 |
| Engine basis (default) | **2,121 of 2,121 rows identical** to the `d2fff8c` baseline |
| Follow-up sets (default, 340 rows) | **0 of 340 differ**, totals identical |
| Integration (solo) | **226 of 226** |
| TypeScript / lint / prisma / build | Clean / 0 errors (1 existing warning) / valid / compiled, exit 0. On alternate runs, Next.js stops the build once with a security advisory recommending an upgrade, then passes on retry. That is not caused by this change and is reported separately |
| Sealed guard | 12 of 12 |
| Browser | `job-clarification` (free text, flags off) 1 / 1 / 0 / 0; `job-structured-matching` 1 / 1 / 0 / 0. The limits were at 5 and 4 of 30, with no bypass |

**No legitimate qualification loss and no new false Supported:** nothing changed on any opened text, and the synthetic negatives only lower credit.

## 4. Free text against structured: consistency

- **Explicit withdrawals the v21 reader misses** (the Gate A bypass): **the paths agree** once free text reads with `v21a`. Both give no credit, or Possible at most when own work on the activity is left. Tested end to end.
- **Under the current default (v21),** the bypass remains on the free-text path, as required ("do not change the production default"). **Closing it in the application needs your decision to adopt `v21a` as the free-text default.** Adoption would:
  - bump `RULES_VERSION`;
  - make stored analyses stale;
  - be re-measured on every regression set.

  Today that would change 0 opened texts.

## 5. The residuals (investigated; nothing beyond `v21a` implemented)

| Residual | Finding | Classification |
|---|---|---|
| "I greet patients and the scheduling is done by our office manager." (Patient scheduling) | Possible on **both** paths and on v20, from the person's own words (`part_of_what_is_asked`, quote "I greet patients"). The reader treats one shared term of a two-term requirement ("patient") as part of what's asked. The scheduling is correctly read as someone else's (passive), which caps it at Possible but doesn't remove the partial match | **A real over-credit, outside `v21a`'s scope.** It is the reader's activity-level relevance (object noun against activity), not a withdrawal. The paths agree. Belongs with Gate C (recognition and relevance) |
| fv-043 and fv-080 (labeled not done personally) | Free text gives **no credit** (v21 and `v21a`): the reader already takes the claim back. **Structured v2 gives Possible from the choice**: the "did it myself" tick survives a correction the reader handled. The two paths **disagree** | **A real safety gap, and a path disagreement on explicit withdrawals.** But the labels conflict on the same structure (below) |

**The class behind fv-043 and fv-080.** On the opened data, there are 14 answers where the reader takes back the person's own claim and structured gives Possible from the choice while free text gives nothing:
- **8 labeled not done personally / not_supported:** fu-016, fu-038, fu-084, fu-120, fv-004, fv-043, fv-080, fv-098.
- **6 labeled Possible or Supported:** fv-029 (reply, supported), fw-031 (supported), fw-052, fw-068, fw-086, fw-103 (possible).

**Decision needed (not implemented):**
- **Option 1.** Align structured with free text: a correction the reader handled, leaving no own work on the activity, contradicts the tick. This fixes the 8, but **6 lose credit their labels give**. These are legitimate losses, so they are blockers.
- **Option 2.** Keep the tick's Possible after such corrections. No loss, but the 8 over-credits and the path disagreement stay, as before Gate A.
- **Option 3.** After such a correction, read the narrowed part as its own involvement (assisting or observing) through the rule table, and ask. Some of the 8 would still get Possible (assisting or observing gives Possible for the work itself).

Free text gives nothing for fv-029 and fw-031 despite Supported labels. That is a free-text recognition question (Gate C), not changed here.

## 6. Is Gate A complete?

**Not yet.** A1 and A2 are complete. A3 is complete on the structured path and implemented, opt-in, on the free-text path. Two decisions remain:
1. Whether to adopt `v21a` as the free-text default. Until then, a free-text answer can still bypass A3 in the application.
2. Options 1–3 above for corrections the v21 reader already handles.
