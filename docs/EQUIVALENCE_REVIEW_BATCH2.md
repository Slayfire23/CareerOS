# Equivalence Review — Batch 2 of 5: Healthcare (8 groups)

November 7, 2026. **For your decisions. Nothing is approved, and no file has changed.**

The method is the same as batch 1:
- each group simulated as approved (evaluation-only `assumeApproved`) over the same 1,266 historical answers;
- generic boundary probes;
- healthcare-specific risk probes, read with and without approval.

Results are in `ai-service/evals/reports/m11/equivalence/`.

## Findings for the whole batch

1. **The shared boundary holds in all 8 groups.** Someone else doing the work, negations, hypotheticals, supervising and helping never get Supported. An introductory class stays Possible, never Supported.
2. **Verb–object patterns create false Supported in all 8 groups**, as in batch 1:
   - "I change the dressings on the salads before service" counts as **wound care**;
   - "I hang IV poles and restock the supply room" counts as **IV medications**;
   - "I collected blood donation pledges at the company drive" counts as **phlebotomy**;
   - "I check blood pressure cuffs for damage in central supply" counts as **vital signs**.
3. **Some exact phrases are risky too:**
   - "hung iv" matches "I hung IV poles";
   - "registered patients" matches registering patients for parking passes;
   - "recorded vitals" fits a scribe writing down readings the nurse calls out;
   - "de-escalated clients" fits calming a client upset about a bill.
4. **Tense.** Every exact phrase is past tense ("changed dressings"), while many answers are present tense ("I change dressings"). Without patterns, those genuine answers aren't matched. The historical wound-care answer below is one.

   **An option for you:** add the present-tense form of each *exact* phrase ("change dressings", "changes dressings"). It stays specific word for word, and isn't a pattern. I haven't added these to any group.

### Found along the way (not about groups)

These are recorded for later, and not fixed here.
- **"I passed medications to 30 residents on the evening shift"** (a real medication pass) **gets nothing, even with the group approved.** The reader takes "passed" as handing something over, which is helping.
- **"I give medications back to the pharmacy for disposal"** and **"I administer the medication reimbursement forms"** both get **Supported** for "Medication administration" **today**, from word matching alone. No group is involved.

## The groups

### 1. phlebotomy

| | |
|---|---|
| **Requirement names** | phlebotomy · venipuncture · venepuncture · blood draws · drawing blood |
| **Exact phrases** | drew blood · draw blood · draws blood · drawing blood · blood draws · drew samples of blood |
| **Patterns** | draw / collect, followed by blood |
| **Related** | blood samples · labeled the tubes |
| **Source** | O\*NET 31-9097.00, "Draw blood from veins by vacuum tube, syringe, or butterfly venipuncture methods." |

- **Should qualify:** "I drew blood from about 20 patients each morning using vacuum tubes." Possible, then Supported. ✓
- **Must not qualify:**
  - "I collect blood samples from the lab fridge and drive them to the hospital." **Supported if approved** ✗ (a courier)
  - "I collected blood donation pledges at the company drive." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Recommendation: revise.**
  - Keep all six exact phrases. They already include the present tense.
  - Remove the patterns. "collect … blood" is the risk.

### 2. medicationadministration

| | |
|---|---|
| **Requirement names** | medication administration · administer medication(s) · administering medications · medication passes |
| **Exact phrases** | gave medications · gave medication · administered medications · administered medication · passed medications · gave injections · gave oral and injectable |
| **Patterns** | give / administer / pass, followed by medication(s) · injections · meds |
| **Related** | ordered medications |
| **Source** | O\*NET 29-1141.00, "Administer medications to patients and monitor patients for reactions or side effects." |

- **Should qualify:** "I passed medications to 30 residents on the evening shift." **Nothing, even if approved.** That's the boundary issue above.
- **Must not qualify:** "I give medications back to the pharmacy for disposal…" and "I administer the medication reimbursement forms…" are **Supported today**, from word matching. Approving changes nothing for them.
- **Historical cases that would change:** none.
- **Risk:** low from the group, but this requirement already has false credit today.
- **Recommendation: revise.**
  - Keep the exact phrases.
  - Remove the patterns, since "give medications back", "pass meds to the nurse" and "administer … forms" are all ambiguous.
  - Fixing the "passed" boundary issue and the word-matching issue belongs to the reader-issues list.

### 3. vitalsigns

| | |
|---|---|
| **Requirement names** | vital signs · taking vitals |
| **Exact phrases** | took vitals · took vital signs · recorded vitals · recorded vital signs · took blood pressure · measured blood pressure · checked blood pressure |
| **Patterns** | take / record / measure / check, followed by vitals · vital signs · blood pressure |
| **Source** | O\*NET 31-9092.00, "…measure their vital signs, weight, and height." |

- **Should qualify:** "I took vitals on every patient I roomed for two doctors." Possible, then Supported. ✓
- **Must not qualify:**
  - "I check blood pressure cuffs for damage in central supply." **Supported if approved** ✗
  - "I record vitals that the nurse calls out to me during rounds." **Supported if approved** ✗ (a scribe)
- **Historical cases that would change:** none.
- **Recommendation: revise.**
  - Keep: took vitals · took vital signs · took blood pressure · measured blood pressure.
  - Remove: recorded vitals · recorded vital signs (scribing) · checked blood pressure (equipment checks), and the patterns.

### 4. woundcare

| | |
|---|---|
| **Requirement names** | wound care |
| **Exact phrases** | dressed wounds · changed dressings · changed wound dressings · cleaned wounds · cleaned and dressed wounds |
| **Patterns** | dress / change / clean, followed by wounds · dressings |
| **Source** | O\*NET 29-2061.00, "…dressing wounds…" |

- **Should qualify:** "I changed dressings on pressure sores and cleaned wounds every shift." Possible, then Supported. ✓
- **Must not qualify:**
  - "I change the dressings on the salads before service." **Supported if approved** ✗
  - "I clean the wounds on the training mannequins after each class." **Supported if approved** ✗ (training)
- **Historical case that would change:** fu-042 (**labeled Supported**), "I change dressings on pressure sores and diabetic foot ulcers, measure them each visit and send pictures to the doctor." Possible, then **Supported**, but only through the "change … dressings" pattern.
- **Recommendation: revise.**
  - Keep the exact phrases, and remove the patterns.
  - **If you approve the present-tense option,** add "change dressings" and "changes dressings". That keeps fu-042's genuine Supported without a pattern. The salad sentence says "the dressings", so it still wouldn't match.

### 5. ivmedications

| | |
|---|---|
| **Requirement names** | iv medications · administering iv medications · intravenous medications |
| **Exact phrases** | started ivs · hung iv |
| **Patterns** | hang / start / push, followed by ivs · piggybacks · iv · peripheral lines |
| **Source** | O\*NET 29-1141.03, "Administer medications intravenously…" |

- **Should qualify:** "I started IVs and hung piggybacks on a med-surg floor for two years." Possible, then Supported. ✓
- **Must not qualify:**
  - "I hang IV poles and restock the supply room." **Supported if approved** ✗
  - "I push IV carts between rooms for the nurses." **Supported if approved** ✗
- **Historical case that would change** (unlabeled): "I hang antibiotic piggybacks, push ordered drugs through patients' peripheral lines and PICCs, and program the pumps for each drip." Possible, then **Supported**, through the patterns.
- **Risk:** "hung iv" also matches "hung IV poles".
- **Recommendation: revise.**
  - Keep "started ivs".
  - Replace "hung iv" with **"hung iv antibiotics" · "hung piggybacks" · "hung iv medications"**. These are new exact phrases, for your approval.
  - Remove the patterns. The historical answer above then stays Possible, unless the present-tense option adds "hang piggybacks".

### 6. patientintake

| | |
|---|---|
| **Requirement names** | patient intake · patient check-in · patient registration |
| **Exact phrases** | checked in patients · registered patients · took patient histories · recorded patient histories · roomed patients |
| **Patterns** | register / room, followed by patients |
| **Source** | O\*NET 31-9092.00, "Interview patients to obtain medical information…" |

- **Should qualify:** "I checked in patients and roomed them for three doctors." Possible, then Supported. ✓
- **Must not qualify:** "I register patients for parking passes at the garage booth." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Recommendation: revise.** Keep the exact phrases, and remove the patterns. "registered patients" keeps a small risk in the past tense ("registered patients for parking"). I'd keep it, because registration *is* intake in a clinic.

### 7. mentalhealth (crisis intervention)

| | |
|---|---|
| **Requirement names** | crisis intervention |
| **Exact phrases** | de-escalated patients · de-escalated clients |
| **Patterns** | none |
| **Source** | O\*NET 21-1014.00, "Perform crisis interventions to help ensure the safety of the patients and others." |

- **Should qualify:** "I de-escalated patients in crisis on the psych unit several times a week." Possible, then Supported. ✓
- **Must not qualify:** "I de-escalated clients who were upset about their bills at the front desk." **Supported if approved** ✗
- **Historical cases that would change:** none.
- **Risk:** "crisis intervention" is a clinical specialty. De-escalating an upset customer isn't crisis intervention, and even de-escalating a patient is only part of it.
- **Recommendation: revise.** Remove "de-escalated clients", and keep "de-escalated patients".
  - **Alternative:** reject the group, leaving crisis intervention to the requirement's own words and structured ownership.

### 8. claimrejections

| | |
|---|---|
| **Requirement names** | insurance claim rejections · claim rejections · resolving insurance claim rejections · **insurance claims · handle insurance claims** |
| **Exact phrases** | resubmitted claims · fixed rejected claims · appealed denied claims |
| **Patterns** | fix / resubmit / appeal, followed by claims · rejected claims · denied claims |
| **Source** | O\*NET 29-2052.00, "Prepare and process medical insurance claim forms and records." |

- **Should qualify:** "I resubmitted claims and appealed denied claims for our clinic every week." Possible, then Supported. ✓
- **Must not qualify:**
  - "I fix the claims department's computers when they freeze." **Supported if approved** ✗
  - "I fixed rejected claims for our warranty department…", for "Insurance claims". **Supported if approved** ✗
- **Historical case that would change** (unlabeled): "Fixed rejected claims by calling the PBM." Possible, then **Supported**, by exact phrase. It's genuine.
- **Risk:** the requirement names "insurance claims" and "handle insurance claims" also cover property and casualty adjusting, which this group's phrases don't describe.
- **Recommendation: revise.**
  - Remove the requirement names "insurance claims" and "handle insurance claims".
  - Remove the patterns, and keep the three exact phrases.

## Summary

| Group | Recommendation | Main reason |
|---|---|---|
| phlebotomy | Revise | "collect … blood" matches couriers and blood-drive pledges |
| medicationadministration | Revise | The patterns are ambiguous. Today's word matching and the "passed" boundary issue are logged separately |
| vitalsigns | Revise | Equipment checks and scribing |
| woundcare | Revise (+ present-tense option) | Salad dressings, mannequins. Present tense keeps fu-042 |
| ivmedications | Revise (new exact phrases) | IV poles and carts |
| patientintake | Revise | Parking-pass registration |
| mentalhealth | Revise, or reject | Upset customers aren't crisis intervention |
| claimrejections | Revise (narrow the names) | Warranty claims, and the claims department's computers |

**Your decisions:**
1. For each group: approve as written, approve my revision, a different revision, or reject.
2. Whether to add the **present-tense forms of exact phrases** to the groups you approve. That's a word-for-word change, not a pattern. If yes, I'd apply it to the batch 1 groups too, only with your approval.

After your decisions, I'll apply them with the same tests and comparisons as batch 1.
