import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { applyAnswers, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { assessRequirements, requirementKind, titleLevel } from "@/lib/ai/rules/engine";
import { applyFollowUps, followUpNeed, readFollowUpReply } from "@/lib/ai/rules/follow-up-reply";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";

// Phase 5.3 regressions: what a job title and its dates can show. Each identified failure is pinned, with the correct
// classifications that must stay and variants written apart from them.
const role = (title: string, months: number, description: string | null = null): Evidence =>
  ({ id: "experience:00000000-0000-4000-8000-000000000001", kind: "experience", job_title: title, start_month: start(months), end_month: null, description }) as Evidence;
function start(months: number) {
  const index = 2026 * 12 + 10 - Math.max(0, months - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
const engine = (requirement: string, evidence: Evidence[], category: "Experience" | "Skills" = "Experience") => {
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", evidence, requirements: [{ index: 0, text: requirement, category, priority: "Required" }] };
  return assessRequirements(request)[0];
};
const verdict = (requirement: string, title: string, months = 36, description: string | null = null) => engine(requirement, [role(title, months, description)]).verdict;

describe("Stage 1a: a leader's title doesn't show hands-on work", () => {
  it("fu-058, fw-037, fw-063, fw-078, the Site Foreman: no credit from the title alone", () => {
    expect(verdict("Hands-on plumbing rough-in", "Plumbing Foreman", 80)).toBe("insufficient_information");
    expect(verdict("Conduct employee safety training sessions", "Safety Coordinator")).toBe("insufficient_information");
    expect(verdict("Perform routine sanitation of production equipment", "Sanitation Supervisor")).toBe("insufficient_information");
    expect(verdict("Prepare food according to dietary restrictions in a healthcare kitchen", "Food Service Manager")).toBe("insufficient_information");
    expect(verdict("Hands-on tile setting", "Site Foreman")).toBe("insufficient_information");
  });

  it("variants", () => {
    expect(verdict("Install residential HVAC systems", "HVAC Service Manager")).toBe("insufficient_information");
    expect(verdict("Operate forklifts in a busy warehouse", "Warehouse Supervisor")).toBe("insufficient_information");
    expect(verdict("Weld structural steel", "Welding Foreman")).toBe("insufficient_information");
  });

  it("says why, so the lowered credit is auditable", () => {
    const f = engine("Hands-on plumbing rough-in", [role("Plumbing Foreman", 80)]);
    expect(f.explanation).toMatch(/supervisor's or manager's title doesn't show doing this hands-on work/);
    expect(f.caveats.join(" ")).toMatch(/hands-on work/);
  });

  it("a leader's title still counts for leading, field experience, and time (the correct classifications stay)", () => {
    expect(verdict("Experience leading engineering teams", "Team Lead")).not.toBe("insufficient_information");
    expect(verdict("Half a decade or more supervising warehouse crews", "Warehouse Supervisor", 70)).toBe("supported");
    expect(verdict("3 years of warehouse operations", "Warehouse Supervisor", 40)).toBe("supported");
    expect(verdict("1 year of hotel management", "Hotel Manager", 20)).toBe("supported");
    expect(verdict("Experience as a project manager", "Project Manager")).toBe("supported");
    expect(verdict("Hotel housekeeping supervision", "Housekeeping Supervisor")).not.toBe("insufficient_information");
    expect(verdict("Coordinate volunteer schedules for events", "Volunteer Coordinator")).not.toBe("insufficient_information");
  });

  it("a practitioner's title still shows the work", () => {
    expect(verdict("Operate a commercial dishwasher and maintain kitchen sanitation", "Dishwasher")).not.toBe("insufficient_information");
    expect(verdict("Preventive maintenance on packaging lines", "Maintenance Technician")).not.toBe("insufficient_information");
  });
});

describe("Stage 1a: a helper's title is limited experience of the work it helps with", () => {
  it("fw-008: an electrician's helper is Possible at most for installing wiring", () => {
    expect(verdict("Install residential electrical wiring and fixtures", "Electrician's Helper", 30)).toBe("possible");
    const f = engine("Install residential electrical wiring and fixtures", [role("Electrician's Helper", 30)]);
    expect(f.caveats.join(" ")).toMatch(/helper's or assistant's title shows limited experience/);
  });

  it("a helper's title still counts for field experience and for assisting itself", () => {
    expect(verdict("At least 18 months of warehouse experience", "Warehouse Associate", 24)).toBe("supported");
    expect(verdict("Minimum 5 years dental assisting", "Dental Assistant", 70)).toBe("supported");
    expect(verdict("Half a year or more in retail", "Retail Associate", 12)).toBe("supported");
  });
});

describe("what kind of requirement it is", () => {
  it("reads leading, assisting, operational tasks, and field or time", () => {
    expect(requirementKind("Lead a team of engineers")).toBe("lead");
    expect(requirementKind("Experience costing menus")).toBe("lead");
    expect(requirementKind("Dental assisting")).toBe("assist");
    expect(requirementKind("Install residential electrical wiring")).toBe("task");
    expect(requirementKind("Hands-on plumbing rough-in")).toBe("task");
    expect(requirementKind("2+ years warehouse experience")).toBe("field");
    expect(requirementKind("Hotel housekeeping")).toBe("field");
  });
  it("reads a title's level", () => {
    expect(titleLevel("Plumbing Foreman")).toBe("leader");
    expect(titleLevel("Electrician's Helper")).toBe("helper");
    expect(titleLevel("Electrician Apprentice")).toBe("helper");
    expect(titleLevel("Line Cook")).toBe("doer");
  });
});

describe("Stage 1b: a workplace in a title isn't the occupation", () => {
  it("'Cashier, Bellwood Pharmacy' doesn't show pharmacy technician experience", () => {
    expect(verdict("Pharmacy technician experience", "Cashier, Bellwood Pharmacy")).toBe("insufficient_information");
  });
  it("variants", () => {
    expect(verdict("Veterinary nurse experience", "Receptionist, Lakeside Vet Clinic")).toBe("insufficient_information");
    expect(verdict("Hospital pharmacist experience", "Porter, St. Mary's Hospital")).toBe("insufficient_information");
  });
  it("…but it's still a lead for a setting requirement", () => {
    expect(verdict("Pharmacy experience", "Cashier, Bellwood Pharmacy")).toBe("possible");
    expect(verdict("Hospital experience", "Housekeeper, Riverside Hospital")).toBe("possible");
  });
});

describe("Stage 1c: an answer can take away credit that rested only on a title", () => {
  const ANSWER = "experience:00000000-0000-4000-8000-000000000002";
  const withAnswer = (requirement: string, title: string, answer: string, action: "confirm" | "deny" = "confirm", reply?: string) => {
    const req = { index: 0, text: requirement, category: "Experience" as const, priority: "Required" as const };
    const evidence = [role(title, 36), { ...role(title, 12), id: ANSWER, description: answer, source: "clarification" } as Evidence];
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", evidence: [evidence[0]], requirements: [req] };
    const before = assessRequirements(request)[0];
    const linked: LinkedAnswer[] = [action === "confirm" ? { action, questionKey: keyForRequirement(req), evidenceId: ANSWER, detail: answer } : { action, questionKey: keyForRequirement(req) }];
    const after = applyAnswers({ ...request, evidence }, [before], linked, keyForRequirement)[0];
    const replied = reply ? applyFollowUps({ ...request, evidence }, [after], [{ questionKey: keyForRequirement(req), evidenceId: ANSWER, quoted: answer, detail: reply, answer }], keyForRequirement)[0] : null;
    return { before, after, replied };
  };

  it("fw-082: 'Our lead tech, Gloria, does the ordering' takes away the pharmacy technician's title credit, with the reason kept", () => {
    const r = withAnswer("Order and manage pharmacy inventory", "Pharmacy Technician", "Our lead tech, Gloria, does the ordering from the wholesaler and handles the overstock returns. I fill and count.");
    expect(r.before.verdict).toBe("possible");
    expect(r.after.verdict).toBe("insufficient_information");
    expect(r.after.rules_only_verdict).toBe("possible");
    expect(r.after.explanation).toMatch(/title suggested this, but your answer says someone else does this work/);
    expect(r.after.citations[0].quote).toMatch(/Gloria, does the ordering/);
  });

  it("variants", () => {
    expect(withAnswer("Repair commercial refrigeration units", "Refrigeration Technician", "Our outside contractor repairs all the refrigeration units. I log the temperatures.").after.verdict).toBe("insufficient_information");
    expect(withAnswer("Maintain the hotel's swimming pool chemistry", "Pool Technician", "The pool company does the chemistry and shocks the pool weekly. I skim leaves.").after.verdict).toBe("insufficient_information");
  });

  it("supervising alone doesn't take it away: the person may do the work too", () => {
    const r = withAnswer("Order and manage pharmacy inventory", "Pharmacy Technician", "I train the new techs and check the inventory reports every week.");
    expect(r.after.verdict).not.toBe("insufficient_information");
  });

  it("work split in one sentence is mixed ownership: kept at Possible, not taken away", () => {
    const r = withAnswer("Prepare tax returns for individuals and small businesses", "Tax Associate", "I do the individual 1040s start to finish and my manager takes the partnership and S-corp returns, though I gather their source documents.");
    expect(r.after.verdict).toBe("possible");
  });

  it("a later, specific reply can still show the person did it", () => {
    const r = withAnswer("Repair commercial refrigeration units", "Refrigeration Technician", "Our outside contractor repairs all the refrigeration units. I log the temperatures.", "confirm",
      "Since the contractor left in March I repair the walk-in and reach-in units myself: I replaced two compressor relays and a condenser fan motor last month.");
    expect(r.after.verdict).toBe("insufficient_information");
    expect(r.replied?.verdict).toBe("possible");
  });

  it("an explicit denial follows the existing rule", () => {
    expect(withAnswer("Order and manage pharmacy inventory", "Pharmacy Technician", "", "deny").after.verdict).toBe("gap");
  });
});

describe("Stage 2: replies held to the same standard as answers", () => {
  // The opened splits are regression data. Each reply is read as production reads it: the quoted sentence is the one code
  // would ask about, and the whole answer is passed in.
  const scenarios = new Map<string, { requirement: string; category: "Skills" | "Experience"; answer: string; reply: string }>();
  for (const dir of ["m11_followup", "m11_followup2", "m11_followup3"]) {
    for (const s of JSON.parse(readFileSync(`tests/fixtures/${dir}/scenarios.json`, "utf8")).scenarios) scenarios.set(s.id, s);
  }
  const read = (id: string, reply?: string) => {
    const s = scenarios.get(id)!;
    const r = { index: 0, text: s.requirement, category: s.category, priority: "Required" as const };
    const need = followUpNeed(r, s.answer);
    return readFollowUpReply(r, need ? s.answer.slice(need.start, need.end) : s.answer, reply ?? s.reply, s.answer);
  };

  it("every unsafe reply identified so far stays unresolved", () => {
    for (const id of ["fv-005", "fv-007", "fv-011", "fv-025", "fv-034", "fv-042", "fv-046", "fv-073", "fv-088", "fw-001", "fw-004", "fw-020", "fw-047", "fw-053", "fw-102"]) {
      expect(read(id).outcome, id).toBe("unresolved");
    }
  });

  it("a bare or vague confirmation never overrides someone else doing the work", () => {
    for (const reply of ["Yes.", "I do that.", "Yes, I do that myself.", "All of it, every day."]) expect(read("fw-053", reply).outcome, reply).toBe("unresolved");
  });

  it("a flat reversal of the answer is a contradiction; one that says what changed can count", () => {
    expect(read("fv-034").reason).toBe("contradicts_answer");
    expect(read("fv-034", "Until last year I picked full-time on the crew, about 40 bins a day, before I moved up to lead.").outcome).toBe("possible_candidate");
    expect(read("fw-004").reason).toBe("contradicts_answer");
    expect(read("fw-047").reason).toBe("contradicts_answer");
  });

  it("a supervisor can show they do the hands-on work too, specifically, in plain words", () => {
    expect(read("fv-062", "On top of managing, I clean two of the buildings myself every night: floors, restrooms, break rooms and trash, about six hours a shift.").outcome).toBe("possible_candidate");
    expect(read("fv-062", "I clean too.").outcome).toBe("unresolved");
  });

  it("experience from an earlier job counts when it's specific", () => {
    expect(read("fw-102", "At my last job I conducted job interviews for the warehouse myself, about four candidates a week, asking the questions and scoring them.").outcome).toBe("possible_candidate");
  });

  it("assistance, requested contractor work, and brief exposure don't become doing it", () => {
    expect(read("fv-011", "I help the sonographer by setting up the machine and holding the probe cable while she scans.").outcome).toBe("unresolved");
    expect(read("fv-088", "I call the plow company and they clear all the lots and roads.").outcome).toBe("unresolved");
    expect(read("fv-005", "I took a six-week ASL class and practiced fingerspelling with a partner.").outcome).toBe("unresolved");
  });

  it("honest replies that were misread now count: fv-029, fw-105, fw-031", () => {
    expect(read("fv-029").outcome).toBe("possible_candidate");
    expect(read("fw-105").outcome).toBe("possible_candidate");
    expect(read("fw-031").outcome).toBe("possible_candidate");
  });

  it("someone else finishing the person's work undercuts a reply; someone giving them something first doesn't", () => {
    const r = { index: 0, text: "Network firewall configuration", category: "Skills" as const, priority: "Required" as const };
    expect(readFollowUpReply(r, "I configure our firewalls.", "I wrote up the rule requests for the new VPN users, he applied them.").outcome).toBe("unresolved");
    expect(readFollowUpReply(r, "I configure our firewalls.", "My manager sends me the change tickets and I write and apply the firewall rules myself on the Palo Alto, about ten a week.").outcome).toBe("possible_candidate");
  });

  it("a raised verdict keeps what it was before and which question the reply answered", () => {
    const req = { index: 0, text: "Commercial cleaning", category: "Skills" as const, priority: "Required" as const };
    const answer = "I manage cleaning for eight office buildings. I schedule the night crews.";
    const finding = { requirement_index: 0, verdict: "insufficient_information", explanation: "", citations: [], caveats: [], basis: "no_evidence" } as never;
    const request = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", evidence: [], requirements: [req] } as MatchRequest;
    const [raised] = applyFollowUps(request, [finding], [{ questionKey: keyForRequirement(req), evidenceId: "experience:00000000-0000-4000-8000-000000000003", quoted: "I manage cleaning for eight office buildings", detail: "Until last spring I cleaned two of the buildings myself every night, floors, restrooms and break rooms, before I moved up to manage the crews.", answer }], keyForRequirement);
    expect(raised.verdict).toBe("possible");
    expect(raised.rules_only_verdict).toBe("insufficient_information");
    expect(raised.caveats[0]).toMatch(/Raised from Not enough information by your reply to the question about “I manage cleaning/);
  });
});
