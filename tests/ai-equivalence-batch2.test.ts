import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import table from "@/lib/ai/rules/data/answer_equivalences.json";
import { groupsFor, readAnswer } from "@/lib/ai/rules/answer-review";
import { questionKey } from "@/lib/ai/rules/review-queue";

const approved: Record<string, [string[], string[]]> = {
  vitalsigns: [["vital signs","taking vitals"],["took vitals","took vital signs"]],
  woundcare: [["wound care"],["changed wound dressings","changed dressings on pressure sores","change dressings on pressure sores"]],
  ivmedications: [["iv medications","administering iv medications","intravenous medications"],["administered iv antibiotics","hung antibiotic piggybacks","hang antibiotic piggybacks"]],
  patientintake: [["patient check-in","patient registration"],["checked in patients for appointments","checked in patients for clinic visits"]],
  claimrejections: [["insurance claim rejections","resolving insurance claim rejections"],["appealed denied medical claims","resubmitted rejected pharmacy claims"]],
};
const read = (text: string, detail: string) =>
  readAnswer({index: 0, text, category: "Skills", priority: "Required"}, detail);

describe("Batch 2 owner decisions", () => {
  for (const [canonical, [asks, phrases]] of Object.entries(approved)) {
    it(canonical + " has exactly the approved scope", () => {
      expect(table.groups.find(g => g.canonical === canonical)).toMatchObject({
        asks, descriptions: phrases, status: "owner_approved", verbs: [], objects: []
      });
      for (const name of asks) expect(questionKey(name, "work_detail")).toBe(questionKey(asks[0], "work_detail"));
    });
    it.each(phrases)(canonical + " recognizes personal performance: %s", phrase => {
      expect(read(asks[0], "I " + phrase + " during my shifts at the clinic.")).toMatchObject({
        verdict: "supported", sourceId: "equivalence:" + canonical
      });
    });
    it(canonical + " does not credit watching someone else", () => {
      expect(read(asks[0], "My coworker " + phrases[0] + "; I just watched.").verdict).not.toBe("supported");
    });
  }
  it.each([
    ["Vital signs", "I measured blood pressure cuffs for a purchasing contract."],
    ["Vital signs", "I record vitals that the nurse calls out to me during rounds."],
    ["Wound care", "I change the dressings on the salads before service."],
    ["Wound care", "I clean the wounds on the training mannequins after each class."],
    ["IV medications", "I hang IV poles and restock the supply room."],
    ["IV medications", "I push IV carts between rooms for the nurses."],
    ["Patient registration", "I registered patients for parking passes at the garage booth."],
    ["Patient registration", "I roomed patients for the doctor but someone else registered them."],
    ["Resolving insurance claim rejections", "I fix the claims department's computers when they freeze."],
    ["Insurance claims", "I fixed rejected claims for our warranty department, mostly missing serial numbers."]
  ])("%s: misleading work must not be Supported (%s)", (q,a) => {
    expect(read(q,a).verdict).not.toBe("supported");
  });
  it.each(["Patient intake","Handle insurance claims","Insurance claims","Claim rejections","Phlebotomy","Medication administration","Crisis intervention"])("does not merge the excluded question: %s", q => {
    expect(groupsFor(q)).toEqual([]);
  });
  it("retains the phlebotomy hold and both rejections", () => {
    expect(table.groups.find(g=>g.canonical==="phlebotomy")?.status).toBe("source_checked");
    expect(table.groups.filter(g=>g.status==="owner_rejected").map(g=>g.canonical).sort()).toEqual(["budgeting","medicationadministration","mentalhealth"]);
    expect(table.groups.filter(g=>g.status==="owner_approved")).toHaveLength(13);
    expect(table.groups.filter(g=>g.status==="source_checked")).toHaveLength(26);
    expect(read("Phlebotomy","I drew blood from about 20 patients each morning using vacuum tubes.").verdict).toBe("possible");
  });
  it("retains the unlabeled PBM answer for later evaluation", () => {
    expect(read("Resolving insurance claim rejections","Fixed rejected claims by calling the PBM.").verdict).toBe("possible");
  });
});
