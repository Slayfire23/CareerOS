import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import table from "@/lib/ai/rules/data/answer_equivalences.json";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { groupsFor, readAnswer } from "@/lib/ai/rules/answer-review";
import { questionKey } from "@/lib/ai/rules/review-queue";

// Equivalence batch 3 (trades and automotive), as the owner decided on 2026-11-10: five groups approved with exact phrases
// only; oil changes, vehicle maintenance, conduit, non-conformance, ductwork and blueprint reading held. These are production readings; nothing uses assumeApproved.
const req = (text: string): MatchRequirement => ({ index: 0, text, category: "Skills", priority: "Required" });
const read = (requirement: string, answer: string) => readAnswer(req(requirement), answer);
const group = (name: string) => table.groups.find(g => g.canonical === name)!;

const APPROVED: Record<string, [string[], string[]]> = {
  drywallfinishing: [["drywall finishing"], ["taped drywall joints", "sanded and finished drywall"]],
  brakerepair: [["brake repair", "brake system repair", "brake service"], ["replaced brake pads", "replaced brake rotors", "rebuilt brake calipers"]],
  wheelalignment: [["wheel alignment", "wheel alignments"], ["performed wheel alignments", "aligned vehicle wheels"]],
  pipefitting: [["pipefitting", "pipe fitting"], ["cut and threaded pipe", "installed process piping"]],
  pretrip: [["pre-trip inspections", "pre trip inspections", "completing pre-trip inspections"], ["performed pre-trip vehicle inspections", "completed pre-trip safety inspections"]],
};
const HELD = ["oilchanges", "vehiclemaintenance", "conduit", "nonconformance", "ductwork", "blueprintreading"];

describe("batch 3: what the owner decided", () => {
  it.each(Object.entries(APPROVED))("%s has exactly the approved scope", (canonical, [asks, phrases]) => {
    expect(group(canonical)).toMatchObject({ asks, descriptions: phrases, verbs: [], objects: [], status: "owner_approved" });
    expect((group(canonical) as { review?: string }).review).toMatch(/owner decision 2026-11-10, equivalence batch 3/);
    for (const name of asks) expect(questionKey(name, "work_detail")).toBe(questionKey(asks[0], "work_detail"));
  });

  it("pre-trip no longer claims the broad name: a general vehicle inspection is its own question", () => {
    expect(group("pretrip").asks).not.toContain("vehicle inspections");
    expect(groupsFor("Vehicle inspections")).toEqual([]);
    expect(questionKey("Vehicle inspections", "work_detail")).not.toBe(questionKey("Pre-trip inspections", "work_detail"));
  });

  it("the six held groups stay unapproved and unchanged", () => {
    for (const name of HELD) expect(group(name).status, name).toBe("source_checked");
    expect(group("oilchanges").descriptions).toEqual(["changed oil", "changed the oil", "did oil changes", "performed oil changes"]);
    expect(group("vehiclemaintenance").descriptions).toEqual(["oil and filter"]);
    expect(group("conduit").descriptions).toEqual(["bent conduit", "ran conduit", "installed conduit", "bent emt", "shaped emt"]);
    expect(group("nonconformance").descriptions).toEqual(["wrote up defects", "quarantined parts", "quarantine the parts", "documented defects"]);
    // The revised present-tense phrases were evaluated and not activated.
    expect(group("ductwork").descriptions).toEqual(["installed ductwork", "hung ductwork", "ran ductwork"]);
    // Approved, then held (B3-BLUEPRINT): its present-tense phrase credited teaching, learning and intending.
    expect(group("blueprintreading").descriptions).toEqual(["read blueprints", "read drawings", "worked from blueprints", "worked from drawings"]);
    expect(group("blueprintreading").verbs).toEqual(["read", "reads", "follow", "follows", "followed"]);
  });

  it("held groups merge no questions: conduit bending and installation stay separate", () => {
    for (const q of ["Oil changes", "Routine vehicle maintenance", "Conduit bending", "Conduit installation", "Conduit bending and installation", "Ductwork installation", "Blueprint reading"]) expect(groupsFor(q), q).toEqual([]);
    expect(questionKey("Conduit bending", "work_detail")).not.toBe(questionKey("Conduit installation", "work_detail"));
  });
});

describe("batch 3: genuine experience qualifies, in the approved phrases", () => {
  const cases: [string, string, string][] = [
    ["Drywall finishing", "I taped drywall joints on apartment walls every week.", "drywallfinishing"],
    ["Brake repair", "I rebuilt brake calipers on customer vehicles.", "brakerepair"],
    ["Brake service", "I replaced brake pads and rotors on fleet trucks.", "brakerepair"],
    ["Wheel alignment", "I performed wheel alignments on customer cars using a calibrated rack.", "wheelalignment"],
    ["Pipefitting", "I cut and threaded pipe for the new boiler plant.", "pipefitting"],
    ["Pre-trip inspections", "I completed pre-trip safety inspections before driving the school bus.", "pretrip"],
  ];
  it.each(cases)("%s: %s", (requirement, answer, canonical) => {
    expect(read(requirement, answer)).toMatchObject({ verdict: "supported", sourceId: `equivalence:${canonical}` });
  });
});

describe("batch 3: the misleading wordings found in review don't get Supported", () => {
  const cases: [string, string][] = [
    ["Drywall finishing", "I taped joints on shipping cartons before dispatch."],
    ["Drywall finishing", "I hung drywall while the finishing crew taped the seams."],
    ["Brake repair", "I replaced the shelf labels for brake pads in our parts warehouse."],
    ["Brake repair", "I ordered brake parts and the mechanic installed them."],
    ["Brake repair", "I teach apprentices how to replace brake pads."],
    ["Wheel alignment", "I performed alignments on graphics for a print catalogue."],
    ["Wheel alignment", "I aligned wheels on display racks for photos."],
    ["Pipefitting", "I installed software for pipe inventory on warehouse tablets."],
    ["Pipefitting", "I fitted pipe insulation sleeves over existing plumbing."],
    ["Pre-trip inspections", "I walked around the rig to take advertising photos."],
    ["Pre-trip inspections", "I inspected the truck for cosmetic damage for an auction listing."],
    ["Vehicle inspections", "I inspected the truck for cosmetic damage for an auction listing."],
    ["Blueprint reading", "I worked from drawings of flowers for greeting cards."],
    ["Blueprint reading", "I read drawings at a gallery workshop."],
  ];
  it.each(cases)("%s: %s", (requirement, answer) => {
    expect(read(requirement, answer).verdict).not.toBe("supported");
  });
});

describe("batch 3: classes, supervising, helping, someone else, negations and hypotheticals stay without Supported", () => {
  const work: [string, string, string][] = [
    ["Drywall finishing", "taped drywall joints", "tape drywall joints"],
    ["Brake repair", "replaced brake pads", "replace brake pads"],
    ["Wheel alignment", "performed wheel alignments", "perform wheel alignments"],
    ["Pipefitting", "cut and threaded pipe", "cut and thread pipe"],
    ["Pre-trip inspections", "completed pre-trip safety inspections", "complete pre-trip safety inspections"],
  ];
  it.each(work)("%s (%s)", (requirement, past, base) => {
    const notSupported = [
      `I took a one-day class where the instructor ${past} and we watched.`,
      `I supervise the crew who ${past} and I sign off on their work.`,
      `I helped the technician who ${past}, mostly fetching tools.`,
      `We hired an outside contractor that ${past} for us.`,
      `My coworker ${past}; I just watched.`,
      `I have never ${past}.`,
      `I could ${base} if needed.`,
    ];
    for (const answer of notSupported) expect(read(requirement, answer).verdict, answer).not.toBe("supported");
  });
});

describe("batch 3: labeled legitimate answers in held groups are preserved", () => {
  // Each is labeled qualified in m11_review/train (Supported is the acceptable reading). Holding the group keeps today's
  // Possible; the narrower candidates and the conduit rejection would each have dropped it to Not enough information.
  const cases: [string, string][] = [
    ["Performing routine vehicle maintenance", "All day I drain and refill oil, swap filters, rotate tires, and top off fluids on customers' cars."],
    ["Installing residential ductwork", "I hang sheet metal trunks and flex runs in attics, seal the joints with mastic, and cut in the registers on new houses."],
    ["Conduit bending and installation", "I shaped EMT with a hand bender, mostly offsets and saddles, and strapped the runs along block walls between the boxes."],
    ["Writing non-conformance reports", "When a lot fails, I tag and quarantine the parts, write up what's wrong against the drawing and send the paperwork to engineering for disposition."],
  ];
  it.each(cases)("%s stays Possible", (requirement, answer) => {
    expect(read(requirement, answer).verdict).toBe("possible");
  });
});

describe("batch 3: blueprint reading is held, so its present-tense false Supported cases stay below Supported (B3-BLUEPRINT)", () => {
  const cases = [
    "I teach apprentices how to read blueprints.",
    "I sell the books people use to read blueprints.",
    "I'll read blueprints once I start my apprenticeship.",
    "I am learning to read blueprints in night school.",
    "I train new hires to read blueprints.",
    "I need to learn to read blueprints.",
    "I worked from blueprints of my house that the architect explained to me.",
    "I read blueprints of famous buildings as a hobby.",
  ];
  it.each(cases)("%s", answer => {
    expect(read("Blueprint reading", answer).verdict).not.toBe("supported");
  });
});
