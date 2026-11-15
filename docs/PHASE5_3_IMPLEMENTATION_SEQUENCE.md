# Phase 5.3: proposed implementation sequence (rules-v21 and the R4 evaluation)

November 12, 2026. **A proposal for owner approval. Nothing here is started.** Each step ends with its gates and a report, and **stops for owner approval** before the next.

**The step tables below list only each step's own additions. These fixed points apply throughout:**
- D1–D3, O1–O7;
- X2 held;
- no Supported from checkboxes;
- feature flags off;
- no production migration, push, merge or deploy without approval;
- the sealed splits (`m11_followup4`, `m11_structured`) are never opened before Stage 7.

## Owner approval (2026-11-13)

The sequence is approved, with **explicit owner approval required after every stage**:

| Stage | Content |
|---|---|
| A | Create and seal R4 |
| B | rules-v21 as an opt-in, including F1–F9 and DD3 |
| C | Review the full regression results, then separately approve or reject local adoption of rules-v21 |
| D | The approved-split recognition module, inactive (the named-tool field included, inactive) |
| E | The Stage 4 questionnaire |
| F | Stages 5–6: persistence and follow-ups |
| G | Freeze and the independent sealed evaluation |

**Before Stage G**, a document must set out:
- the exact acceptance criteria;
- the baseline comparisons;
- the integrity checks;
- **what happens if the sealed evaluation fails**.

There's no tuning against opened sealed cases after evaluation. **Only Stage A is authorized now.**

## Progress

| Stage | Status |
|---|---|
| A | **Done** (a24caa0): `m11_parts` sealed, 312 scenarios, never opened |
| B | **Done under the owner-approved boundary** (2026-11-13). rules-v21 is opt-in (F1–F9, DD3, F6, the verdict-inert `bounded` field); v20 stays the default; the engine and follow-up behaviour are unchanged. Report: `docs/PHASE5_3_STAGE_B_REPORT.md` |
| C | **Done: rules-v21 adopted as the local matching default on 2026-11-14, with D2** (the save-time check follows it). Owner approval 2026-11-13. P1 fixed the gate-4 failure first. The engine output is identical apart from the version label; follow-up behaviour matches the simulated adoption. Report: `docs/PHASE5_3_STAGE_C_ADOPTION_REVIEW.md` §9 |
| D | **D.1 and D.2 done (2026-11-14): the inactive split-recognition module, `splits-v1.1`.** It covers the 33 approved splits verbatim, includes the A77 consumer of `bounded`, and (D.2) never counts delegated work ("have my clerk call…", "send plumbers out to…") as the person's own. `transferred` is informational. Parity 284 of 284; not wired. Reports: `docs/PHASE5_3_STAGE_D1_REPORT.md`, `docs/PHASE5_3_STAGE_D2_REPORT.md` |
| E | **Done (2026-11-14), local and flag-off:** the structured "your part" questionnaire (`STRUCTURED_OWNERSHIP_FORM_ENABLED`, which needs the review flag and is refused on Vercel). Splits are linked by exact wording (E1); a counting answer is never replaced (E2); recognition is never shown (E3); the wording is plain (E4). Structured answers are saved as formVersion 2 and **change no verdict** until Stage F. Report: `docs/PHASE5_3_STAGE_E_REPORT.md` |
| F | Design approved 2026-11-14 (`docs/PHASE5_3_STAGE_F_DESIGN.md`; F-4, F-6 and F-9 conditional). **F0 done (2026-11-14): rules-v22, opt-in** — the "directed at the person" reader correction; v21 stays the default; 0 changes on the opened corpus and parity. Report: `docs/PHASE5_3_STAGE_F0_REPORT.md`. **F1 done (2026-11-14), local:** the `recognitionVersion` audit migration (local databases only) and `experience:<id>` evidence ids for structured answers (masking, deletion); matching unchanged. Report: `docs/PHASE5_3_STAGE_F1_REPORT.md`. **F2 done (2026-11-14):** the pure structured-matching module (`matchStructuredAnswer`), not connected; existing matching unchanged. Report: `docs/PHASE5_3_STAGE_F2_REPORT.md` (§8 lists questions for F4). **F3 done (2026-11-14):** `candidate_choice` citations (`choice:<id>`, CareerOS wording, Possible at most) and their validation, masking and deletion; one approved page label; still disconnected. Report: `docs/PHASE5_3_STAGE_F3_REPORT.md` (§6 lists what F4 must respect). **F4 done (2026-11-14), local and flag-off:** structured matching behind `STRUCTURED_MATCHING_ENABLED` (off by default; needs the form and the review; never on Vercel); choice-only results withheld; flag-off masking of stored structured results (F-9); freshness only with the flag on (F-10). Report: `docs/PHASE5_3_STAGE_F4_REPORT.md` (§9 lists the blockers to enabling it). **F5 done (2026-11-14):** the match page for structured findings; choice-only Possible stored and shown with the flag on ("Your choice", self-reported); unsound choice citations withheld; flag-aware saved-answer wording. Report: `docs/PHASE5_3_STAGE_F5_REPORT.md`. F6 not started (needs approval) |
| G | Not started |

**V5 status:** 46 of 47 expectations are satisfied in the scratch simulation, with the Stage D consumer modeled. The remaining failure is the preserved historical failure-4 expectation (separate owner decision). The end-to-end recognition path doesn't exist yet and is unverified.

## Why R4 comes first

The independent evaluation is only independent if it's written and sealed **before** the implementation exists, as Stage 0 did for the structured split. The writer and labeler must not see the code, the markers, the equivalents, the design probes, or any simulation output.

## Steps

| # | Step | What happens | Gates before the next step |
|---|---|---|---|
| 1 | **R4: create the independent split** (`m11_parts`) | One agent writes about 300 scenarios for the 33 approved splits (by the R4 protocol and its quotas). A separate agent labels them blind. Hash manifest; the sealed guard is extended to protect the folder (a test change). Committed unopened, in its own commit | Count and hash recorded; guard test passes; nobody reads the content; owner approval of the quotas beforehand |
| 2 | **rules-v21 reader fixes (opt-in)**: R3 F1–F9 and DD3 | Shared-reader changes behind `textRules: "v21"`; v20 stays the default. F6 changes the Stage 2 rule table for contradicted activities, under the same opt-in | Full comparison (1,266 answers, 392 + 198 + all targeted probes, 320 replies, 4 follow-up sets, 2,121 engine rows). **0 new false Supported, 0 labeled-qualified losses, 0 good replies refused, the ICD-10 gain kept, the engine unchanged** unless a change is reported and approved. Every intentional reduction documented one by one. The **V5 failures 1–3 must pass**, with their controls. Suites, TypeScript, lint, schema; sealed hash guard only |
| 3 | **Adopt rules-v21** (a separate owner decision) | Switch the default, as with v20 | The same comparison rerun on the default path; owner approval |
| 4 | **Recognition module and approved-split data (inactive)** | The approved splits as reviewed data: parts, markers, equivalents, named tools, interpretations. Part attribution (DD1 §3), the Q4 guard, cross-clause named tools, A77 Q1. **Nothing calls it** from matching or the review queue (an isolation test, as in Stages 2–3) | Unit tests from every design and targeted probe, with expectations as approved. The four V5 failures and their controls are permanent tests. 0 false Supported; isolation test passes |
| 5 | **Stage 4: forms (DD2)** | One explanation field, unticked part checkboxes from the approved data, accessibility rules; flags off | Browser tests per the Stage 4 plan (keyboard, labels, 375 px, dark mode, every choice path, the contradiction prompt, no preselection) |
| 6 | **Stages 5–6: saving, supersession, follow-ups** | Per-part storage (Stage 1 schema), targeted follow-ups for unshown parts, never repeated | Integration tests per the plan; events hold choices, never words |
| 7 | **Freeze and evaluate once** | Code freeze. Open `m11_parts` (R4), `m11_structured` (Stage 0) and `m11_followup4` once each. No tuning after opening | The release criteria (O5 and R4 §5), final numbers set by the owner before freeze |

## Open items to settle before step 1 or step 2

1. **V5 failure 4:** P13 "I recommend candidates to the owner, who decides who we hire". The expected result was Possible; the result is Not enough information. Your decision on the intended result becomes the test (spec §12).
2. **R4 quotas:** confirm them, including the new categories from the review: named-tool cases, Q4 antecedents, and A77 analysis versus reading.
3. **The named-tool field** in the approved-split data: confirm it's part of step 4's data design.

## What this sequence doesn't change

- No step activates a split for matching. Splits are used only in the structured questionnaire (X1), and only after step 7 meets the release criteria.
- The engine and the free-text reader change only through rules-v21 (steps 2–3), each with its own approval.
