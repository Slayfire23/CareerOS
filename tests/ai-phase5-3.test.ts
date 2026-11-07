import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { assessRequirements, requirementKind, titleLevel } from "@/lib/ai/rules/engine";

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
