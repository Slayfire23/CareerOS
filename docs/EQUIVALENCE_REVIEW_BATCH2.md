# Equivalence Review — Batch 2 of 5: Healthcare (8 groups)

November 7, 2026. **Owner decision packet. All eight healthcare groups are source_checked; none is approved. No production file changed in this review.**

The method is the same as batch 1:
- the archived run used evaluation-only `assumeApproved` and attributed changes by source; this review repeated the comparison one group at a time, in memory;
- generic boundary probes;
- healthcare-specific risk probes, read with and without approval.

Results are in `ai-service/evals/reports/m11/equivalence/`.

## Findings for the whole batch

1. **The archived generic probes did not produce false Supported for these ownership cases. This is a sampled result.** Someone else doing the work, negations, hypotheticals, supervising and helping never get Supported. An introductory class stays Possible, never Supported.
2. **Approving these groups as written is unsafe; seven have verb–object patterns, while crisis intervention has exact phrases only**, as in batch 1:
   - "I change the dressings on the salads before service" counts as **wound care**;
   - "I hang IV poles and restock the supply room" counts as **IV medications**;
   - "I collected blood donation pledges at the company drive" counts as **phlebotomy**;
   - "I check blood pressure cuffs for damage in central supply" counts as **vital signs**.
3. **Some exact phrases are risky too:**
   - "hung iv" matches "I hung IV poles";
   - "registered patients" matches registering patients for parking passes;
   - "recorded vitals" fits a scribe writing down readings the nurse calls out;
   - "de-escalated clients" fits calming a client upset about a bill.
4. **Tense and context.** Some entries already include present tense. Do not expand tenses globally: an exact phrase can still occur inside an unrelated task. Only the explicit variants in each proposed revision below were simulated.

### Found along the way (not about groups)

These are recorded for later, and not fixed here.
- **"I passed medications to 30 residents on the evening shift"** (a real medication pass) **gets nothing, even with the group approved.** The reader takes "passed" as handing something over, which is helping.
- **"I give medications back to the pharmacy for disposal"** and **"I administer the medication reimbursement forms"** both get **Supported** for "Medication administration" **today**, from word matching alone. No group is involved.

## The groups

### 1. phlebotomy

| | |
|---|---|
| **Source** | O\*NET 31-9097.00, "Draw blood from veins by vacuum tube, syringe, or butterfly venipuncture methods." |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `phlebotomy`, `venipuncture`, `venepuncture`, `blood draws`, `drawing blood`
- Exact phrases: `drew blood`, `draw blood`, `draws blood`, `drawing blood`, `blood draws`, `drew samples of blood`
- Verbs: `draw`, `draws`, `drew`, `drawing`, `collect`, `collects`, `collected`, `collecting`
- Objects: `blood`
- Related only: `blood samples`, `labeled the tubes`

- **Should qualify:** "I drew blood from about 20 patients each morning using vacuum tubes." Possible, then Supported. ✓
- **Must not qualify:**
  - "I collect blood samples from the lab fridge and drive them to the hospital." **Supported if approved** ✗ (a courier)
  - "I collected blood donation pledges at the company drive." **Supported if approved** ✗
- **Historical cases that would change:** none.

**Owner recommendation: Revise.** Keep the five requirement names and the existing related-only entries. Use only `drew blood from patients`, `draw blood from patients`, and `performed venipuncture` for exact credit. Drop the verb–object patterns. Bare “blood draws” can name a procedure being scheduled; collecting a specimen does not establish who drew it.

**Recognition cost and revision simulation:** “I drew blood from patients each morning using vacuum tubes” becomes Supported. The equally genuine “drew blood from **about 20** patients” drops from Possible to insufficient under this narrow proposal. This is a real probe loss; there were no historical verdict changes. Prefer clarification to a wildcard between “from” and “patients”.

### 2. medicationadministration

| | |
|---|---|
| **Source** | O\*NET 29-1141.00, "Administer medications to patients and monitor patients for reactions or side effects." |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `medication administration`, `administer medications`, `administering medications`, `administer medication`, `medication passes`
- Exact phrases: `gave medications`, `gave medication`, `administered medications`, `administered medication`, `passed medications`, `gave injections`, `gave oral and injectable`
- Verbs: `give`, `gives`, `gave`, `administer`, `administers`, `administered`, `pass`, `passes`, `passed`
- Objects: `medication`, `medications`, `injections`, `meds`
- Related only: `ordered medications`

- **Should qualify:** "I passed medications to 30 residents on the evening shift." **Nothing, even if approved.** That's the boundary issue above.
- **Must not qualify:** "I give medications back to the pharmacy for disposal…" and "I administer the medication reimbursement forms…" are **Supported today**, from word matching. Approving changes nothing for them.
- **Historical cases that would change:** none.

**Owner recommendation: Reject as submitted.** Do not let this group grant or merge anything. The two wrong baseline Supported results (returning medication and administering reimbursement forms) remain Supported even when rejection is simulated. Record these as generic-reader failures, not failures introduced or fixed by approval.

**Recognition cost and revision simulation:** “I administered medications to patients during every nursing shift” already gets Supported. “I passed medications to 30 residents” should qualify for performing the task but stays insufficient in all three readings. Zero historical changes; rejecting the group does not solve the ownership error. No conclusion about professional authorization.

### 3. vitalsigns

| | |
|---|---|
| **Source** | O\*NET 31-9092.00, "…measure their vital signs, weight, and height." |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `vital signs`, `taking vitals`
- Exact phrases: `took vitals`, `took vital signs`, `recorded vitals`, `recorded vital signs`, `took blood pressure`, `measured blood pressure`, `checked blood pressure`
- Verbs: `take`, `takes`, `took`, `record`, `records`, `recorded`, `measure`, `measures`, `measured`, `check`, `checks`, `checked`
- Objects: `vitals`, `vital signs`, `blood pressure`
- Related only: none

- **Should qualify:** "I took vitals on every patient I roomed for two doctors." Possible, then Supported. ✓
- **Must not qualify:**
  - "I check blood pressure cuffs for damage in central supply." **Supported if approved** ✗
  - "I record vitals that the nurse calls out to me during rounds." **Supported if approved** ✗ (a scribe)
- **Historical cases that would change:** none.

**Owner recommendation: Revise.** Keep the two names; credit only `took vitals` and `took vital signs`. No verb–object patterns. Even the previously proposed exact phrase `measured blood pressure` grants false Supported to “I measured blood pressure cuffs for a purchasing contract”. Recording another clinician’s readings is not taking the measurements.

**Recognition cost and revision simulation:** Genuine “I took vitals on every patient I roomed” becomes Supported; the purchasing probe drops to insufficient and the scribe stays Possible. No historical verdict changes. A person who describes only measuring blood pressure may lose recognition; ask what they personally measured.

### 4. woundcare

| | |
|---|---|
| **Source** | O\*NET 29-2061.00, "…dressing wounds…" |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `wound care`
- Exact phrases: `dressed wounds`, `changed dressings`, `changed wound dressings`, `cleaned wounds`, `cleaned and dressed wounds`
- Verbs: `dress`, `dresses`, `dressed`, `change`, `changes`, `changed`, `clean`, `cleans`, `cleaned`
- Objects: `wounds`, `dressings`
- Related only: none

- **Should qualify:** "I changed dressings on pressure sores and cleaned wounds every shift." Possible, then Supported. ✓
- **Must not qualify:**
  - "I change the dressings on the salads before service." **Supported if approved** ✗
  - "I clean the wounds on the training mannequins after each class." **Supported if approved** ✗ (training)
- **Historical case that would change:** fu-042 (**labeled Supported**), "I change dressings on pressure sores and diabetic foot ulcers, measure them each visit and send pictures to the doctor." Possible, then **Supported**, but only through the "change … dressings" pattern.

**Owner recommendation: Revise.** Keep `wound care` as the name. Credit only `changed wound dressings`, `changed dressings on pressure sores`, and `change dressings on pressure sores`. No verb–object patterns; no general `change dressings` tense expansion. A reference to dressings alone does not distinguish a wound from a salad or a training prop.

**Recognition cost and revision simulation:** The proposed wording retains the one labeled historical gain (fu-042, Possible → Supported) and the genuine pressure-sore probe. The salad probe becomes insufficient; the mannequin probe still gets Possible, not Supported. Other genuine wound care described without these phrases may need clarification.

### 5. ivmedications

| | |
|---|---|
| **Source** | O\*NET 29-1141.03, "Administer medications intravenously…" |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `iv medications`, `administering iv medications`, `intravenous medications`
- Exact phrases: `started ivs`, `hung iv`
- Verbs: `hang`, `hangs`, `hung`, `start`, `starts`, `started`, `push`, `pushes`, `pushed`
- Objects: `ivs`, `piggybacks`, `iv`, `peripheral lines`
- Related only: none

- **Should qualify:** "I started IVs and hung piggybacks on a med-surg floor for two years." Possible, then Supported. ✓
- **Must not qualify:**
  - "I hang IV poles and restock the supply room." **Supported if approved** ✗
  - "I push IV carts between rooms for the nurses." **Supported if approved** ✗
- **Historical case that would change** (unlabeled): "I hang antibiotic piggybacks, push ordered drugs through patients' peripheral lines and PICCs, and program the pumps for each drip." Possible, then **Supported**, through the patterns.
- **Risk:** "hung iv" also matches "hung IV poles".

**Owner recommendation: Revise.** Keep the existing requirement names; credit only `administered iv antibiotics`, `hung antibiotic piggybacks`, and `hang antibiotic piggybacks`. Remove both original exact phrases and all patterns. Starting an IV demonstrates access, not administering medication; “hung IV” can describe poles.

**Recognition cost and revision simulation:** The historical antibiotic-piggyback answer rises Possible → Supported in both simulations; it has **no independent label**. The genuine med-surg probe mentioning “hung piggybacks” but not the medication stays Possible under the narrower revision. Poles and carts stay Possible rather than Supported.

### 6. patientintake

| | |
|---|---|
| **Source** | O\*NET 31-9092.00, "Interview patients to obtain medical information…" |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `patient intake`, `patient check-in`, `patient registration`
- Exact phrases: `checked in patients`, `registered patients`, `took patient histories`, `recorded patient histories`, `roomed patients`
- Verbs: `register`, `registers`, `registered`, `room`, `rooms`, `roomed`
- Objects: `patients`
- Related only: none

- **Should qualify:** "I checked in patients and roomed them for three doctors." Possible, then Supported. ✓
- **Must not qualify:** "I register patients for parking passes at the garage booth." **Supported if approved** ✗
- **Historical cases that would change:** none.

**Owner recommendation: Revise.** Restrict the group to **appointment check-in/registration**: names `patient check-in` and `patient registration`; exact descriptions `checked in patients for appointments` and `checked in patients for clinic visits`. No patterns. Remove the generic `patient intake` name: registration, taking histories and rooming are adjacent tasks, not interchangeable qualifications. Do not keep `registered patients` in any tense.

**Recognition cost and revision simulation:** For “Patient registration”, “registered patients for parking passes” and “roomed patients … someone else registered them” rise Possible → Supported with the original group; both stay Possible in the revision. Clinic appointment check-in becomes Supported. The genuine combined check-in/rooming probe for broader intake stays Possible; no historical row changes. **Residual baseline failure:** “I handled patient registration for parking permits at the garage” gets Supported with the group off, as written, and revised. This proposal is not a fix for that direct-word match.

### 7. mentalhealth (crisis intervention)

| | |
|---|---|
| **Source** | O\*NET 21-1014.00, "Perform crisis interventions to help ensure the safety of the patients and others." |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `crisis intervention`
- Exact phrases: `de-escalated patients`, `de-escalated clients`
- Verbs: none
- Objects: none
- Related only: none

- **Should qualify:** "I de-escalated patients in crisis on the psych unit several times a week." Possible, then Supported. ✓
- **Must not qualify:** "I de-escalated clients who were upset about their bills at the front desk." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Risk:** "crisis intervention" is a clinical specialty. De-escalating an upset customer isn't crisis intervention, and even de-escalating a patient is only part of it.

**Owner recommendation: Reject as submitted.** This group has **no patterns**. Both exact phrases overreach: calming either clients or patients about billing is not evidence of crisis intervention. Do not make a general de-escalation phrase an equivalence for a specialty.

**Recognition cost and revision simulation:** Genuine de-escalation of patients **in crisis** stays Possible under rejection (Supported if approved as written). Billing-dispute probes for both clients and patients become insufficient under rejection. No historical verdict changes. Defer the legitimate loss to an ownership/context question.

### 8. claimrejections

| | |
|---|---|
| **Source** | O\*NET 29-2052.00, "Prepare and process medical insurance claim forms and records." |

**Exact production inventory** (current lookup entries, not approved credit):
- Names: `insurance claim rejections`, `claim rejections`, `resolving insurance claim rejections`, `insurance claims`, `handle insurance claims`
- Exact phrases: `resubmitted claims`, `fixed rejected claims`, `appealed denied claims`
- Verbs: `fix`, `fixes`, `fixed`, `resubmit`, `resubmits`, `resubmitted`, `appeal`, `appeals`, `appealed`
- Objects: `claims`, `rejected claims`, `denied claims`
- Related only: none

- **Should qualify:** "I resubmitted claims and appealed denied claims for our clinic every week." Possible, then Supported. ✓
- **Must not qualify:**
  - "I fix the claims department's computers when they freeze." **Supported if approved** ✗
  - "I fixed rejected claims for our warranty department…", for "Insurance claims". **Supported if approved** ✗
- **Historical case that would change** (unlabeled): "Fixed rejected claims by calling the PBM." Possible, then **Supported**, by exact phrase. It's genuine.
- **Risk:** the requirement names "insurance claims" and "handle insurance claims" also cover property and casualty adjusting, which this group's phrases don't describe.

**Owner recommendation: Revise.** Keep `insurance claim rejections` and `resolving insurance claim rejections`. Remove bare `claim rejections`, `insurance claims`, and `handle insurance claims`. Credit only `appealed denied medical claims` and `resubmitted rejected pharmacy claims`; no patterns. A computer in the claims department, a warranty claim, or merely submitting an initial claim does not establish this task.

**Recognition cost and revision simulation:** The specific medical-appeal positive becomes Supported; the warranty and IT probes stay Possible. The original group promoted the unlabeled PBM answer to Supported, but the revision leaves it Possible. Likewise the credible clinic probe using only “resubmitted claims and appealed denied claims” stays Possible. Do not fit an exact phrase to that one PBM sentence.

## How to interpret the results

“Supported” here is an answer-reader verdict about self-reported work, not verification of a credential, employment or scope of practice. Exact phrases match within a statement; they are not whole-answer equality. Verb–object matching allows up to seven token positions. Generic word matching is independent of group approval. “No historical changes” describes this opened sample, not safety outside it.

**Reproduction.** Used the current TypeScript `readAnswer` from `src/lib/ai/rules/answer-review.ts`, a Skills/Required request as in the archived harness, and the 1,266 opened rows in `batch1-readings-after.json`. Current verdicts matched that snapshot in every row. For each group, reload the reader in an isolated module instance with a cloned table in memory: (1) unchanged production, (2) only that group hypothetically approved as written, (3) only that group's stated revision hypothetically approved, or the group excluded as rejected. For revisions, use exactly the named descriptions, empty verbs/objects, unchanged related entries and unchanged asks unless explicitly narrowed. Compare every row in all three conditions. Replayed the 22 archived healthcare probes plus 11 additional targeted questions/answers. No fixture, baseline, approval flag or production table was written. The sealed split was not used.

| Historical change vs current production | As written | Proposed decision | Label |
|---|---|---|---|
| Wound care, fu-042 | Possible → Supported | Possible → Supported | Supported |
| IV medications, antibiotic piggybacks | Possible → Supported | Possible → Supported | Unlabeled |
| Insurance claim rejections, PBM | Possible → Supported | No change (Possible) | Unlabeled |
| Other five groups | No change | No change | — |

**Prior checkpoint.** Batch 1 commit `a84d42b` applied eight revised groups and rejected budgeting. Before/after snapshots show one changed verdict across 1,266 rows: bank reconciliation lost Possible, not Supported. No Supported was gained or lost on those rows. The separate “kept the books” recognition loss is recorded in the checklist. The original Batch 2 draft and probes were already committed at `82bdc66`; its revisions had not been owner-approved.

## Owner checkpoint — direction only

The owner agrees with revising phlebotomy, vital signs, wound care, IV medications, patient intake/registration, and insurance claim rejections, and with rejecting medication administration and crisis intervention **as submitted**. No status change is authorized. Neither the six candidate phrase lists nor blanket tense changes are approved. The inventories above show current wording; in each proposed revision, the exact descriptions listed in its recommendation are the complete whitelist. All other existing descriptions and all verb–object combinations are excluded from **Supported via that group**. Generic reader results are independent.

### Matching-feature release blockers (must-not-Support regression specifications)

| Requirement and negative probe | Current reader | Unsafe proposal | Release condition |
|---|---|---|---|
| Medication administration: “I give medications back to the pharmacy for disposal at the end of each month.” | Supported | Still Supported even with group rejected | Disposal is not administration. No Supported from this answer. |
| Medication administration: “I administer the medication reimbursement forms for the union.” | Supported | Still Supported even with group rejected | Administering paperwork must not qualify as giving medication. |
| Vital signs: “I measured blood pressure cuffs for a purchasing contract.” | Possible | Supported with original group or exact `measured blood pressure`; insufficient with the proposed revision | Keep this negative test even if verb–object patterns are removed. |
| Patient registration: “I handled patient registration for parking permits at the garage.” | Supported | Still Supported after narrowing the group | A parking transaction must not qualify as clinical registration. Also test “I registered patients for parking passes” (Possible today, Supported with original group). |

These block release of the affected matching behavior. The medication and direct-word parking failures need a separate approved reader fix; the cuff failure is an experimentally reproduced promotion, **not** a current production Supported verdict.

### Recognition cases to preserve

- **Phlebotomy:** “I drew blood from about 20 patients each morning using vacuum tubes.” Legitimate personal performance: Possible today, Supported with the original group, insufficient under the proposed revision. Keep as a positive regression case; do not silently accept this loss or add a broad wildcard.
- **Medical claims:** “Fixed rejected claims by calling the PBM.” Credible historical answer, **unlabeled**: Possible today, Supported with the original group, Possible with the narrower revision. Retain for owner adjudication; do not manufacture a label or a phrase tailored to this sentence.

**Next decision:** review each proposed whitelist, exclusions, positive and negative probes, and historical changes above. Approve or amend exact wording separately by group. This checkpoint documents decisions only; no blocker is marked fixed, no engine test has been added, and no production group or baseline changes.
