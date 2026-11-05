import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { RULES_VERSION, assessRequirements } from "@/lib/ai/rules/engine";

// The false Supported patterns found in Phase 2, tested with new invented wording and honest neighbors.

const skill = (name: string): Evidence => ({ id: "skill:1", kind: "skill", name, proficiency: null });
const role = (job_title: string, description: string | null): Evidence => ({ id: "experience:1", kind: "experience", job_title, start_month: "2015-01", end_month: null, description });
const school = (qualification: string, description: string | null = null): Evidence => ({ id: "education:1", kind: "education", qualification, field_of_study: null, start_month: "2024-01", end_month: "2024-06", description });
const decide = (text: string, category: MatchRequirement["category"], evidence: Evidence) => {
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [{ index: 0, text, category, priority: "Required" }], evidence: [evidence] };
  return assessRequirements(request)[0].verdict;
};

it("is a new rules version", () => {
  expect(RULES_VERSION).toBe("rules-v16");
});

describe("someone else's work", () => {
  it.each([
    ["Terraform", "Our developers wrote the Terraform modules; I booked their travel."],
    ["Kubernetes", "My sister runs Kubernetes clusters at her company; I sometimes ask about it."],
    ["Payroll", "The accountants ran payroll; I filed the printouts."],
    ["Excel", "My husband built Excel models for his firm."],
    ["AutoCAD", "My cousin designs bridges in AutoCAD."],
    ["Salesforce", "Our vendor administered Salesforce for the whole office."],
    ["Tableau", "Their engineers built Tableau dashboards for us."],
  ])("%s isn't shown by: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Clerk", text))).not.toBe("supported");
  });

  it.each([
    ["Terraform", "Wrote Terraform modules with our developers."],
    ["Kubernetes", "Ran Kubernetes clusters for my brother's company."],
    ["Excel", "Built Excel models for our accountants."],
    ["AutoCAD", "I designed bridges in AutoCAD for my team."],
  ])("%s is shown when the work is the person's own: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Engineer", text))).toBe("supported");
  });
});

it("someone else's work isn't even a lead", () => {
  expect(decide("Commercial HVAC repair", "Skills", role("Office Helper", "My brother runs a commercial HVAC repair company; I helped with his invoices."))).toBe("insufficient_information");
});

describe("templates and sample text", () => {
  it.each([
    ["Python", "Example text: Built Python services to deliver results."],
    ["Python", "Sample bullet: Developed Python scripts for reporting."],
    ["Python", "Lorem ipsum dolor sit amet. Developed Python tools."],
    ["Python", "Developed [Python / Java / Go] services to deliver [outcome]."],
    ["Python", "Replace this with your own: developed Python services."],
    ["Python", "Developed Python services at [Your Company]."],
    ["Python", "Insert your achievements here. Developed Python services."],
    ["Python", "Developed Python services. <your metric>"],
    ["Python", "Placeholder: developed Python services for clients."],
  ])("%s isn't shown by: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Engineer", text))).not.toBe("supported");
  });

  it.each([
    ["Python", "Developed Python services and wrote sample data generators."],
    ["Python", "Built Python tools for the template team."],
    ["Python", "Developed Python services [2019 to 2021]."],
  ])("ordinary work using similar words still counts: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Engineer", text))).toBe("supported");
  });

  it("an unfilled job title is never a role", () => {
    expect(decide("Nursing experience", "Experience", role("[Your Job Title Here]", null))).not.toBe("supported");
  });
});

describe("words with another meaning", () => {
  it.each([
    ["Ruby on Rails", "Polished rubies and fitted steel rails to display cases."],
    ["Ruby on Rails", "Serviced train rails along the coast line."],
  ])("%s isn't shown by: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Technician", text))).not.toBe("supported");
  });

  it.each([
    ["Ruby on Rails", "Built Rails apps for a billing startup."],
    ["Ruby on Rails", "Developed Ruby on Rails services."],
  ])("%s is shown by: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Engineer", text))).toBe("supported");
  });
});

describe("reading or handling something isn't doing it", () => {
  it.each([
    ["Grant writing", "Read and scored grant applications for the foundation."],
    ["Grant writing", "Reviewed grant reports submitted by partner charities."],
    ["Technical writing", "Filed technical manuals and shelved them by product line."],
    ["Brake repair", "Ordered brake parts and tracked deliveries."],
    ["HVAC installation", "Scheduled HVAC crews and invoiced customers."],
    ["Logo design", "Approved logo files from the agency."],
  ])("%s isn't shown by: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Coordinator", text))).not.toBe("supported");
  });

  it.each([
    ["Grant writing", "Wrote grant applications for the foundation."],
    ["Grant writing", "Drafted grant proposals that won four awards."],
    ["Brake repair", "Performed brake repair on fleet vans."],
    ["HVAC installation", "Performed HVAC installation in new homes."],
    ["Curriculum design", "Wrote the eighth-grade science curriculum myself."],
  ])("%s is shown by: %s", (asked, text) => {
    expect(decide(asked, "Skills", role("Technician", text))).toBe("supported");
  });
});

describe("quoted, hypothetical, or instructed claims", () => {
  it.each([
    "My manager said I administered Salesforce.",
    "According to my reference, I administered Salesforce.",
    "Told to list that I administered Salesforce.",
    "Could have administered Salesforce if asked.",
    "In theory, administered Salesforce.",
    "Supposedly administered Salesforce for the office.",
    "\"I administered Salesforce for years\" is what the recruiter wrote.",
    "'Administered Salesforce across three regions' was the suggested bullet.",
  ])("%s", text => {
    expect(decide("Salesforce", "Skills", role("Clerk", text))).not.toBe("supported");
  });

  it.each([
    "Administered Salesforce for the \"Project Atlas\" rollout.",
    "Administered Salesforce, and my manager said the rollout went well.",
  ])("a statement beside a short quote still counts: %s", text => {
    expect(decide("Salesforce", "Skills", role("Clerk", text))).toBe("supported");
  });
});

describe("preparing for a credential isn't holding it", () => {
  it.each([
    [school("PRINCE2 exam prep course")],
    [school("PRINCE2 review course")],
    [school("PRINCE2 course", "Finished the course. Not certified yet.")],
    [school("PRINCE2 preparation")],
    [skill("PRINCE2 practice test")],
    [skill("PRINCE2 study guide")],
  ])("%j", evidence => {
    expect(decide("PRINCE2 certification", "Other", evidence)).not.toBe("supported");
  });

  it.each([[school("PRINCE2 certificate")], [skill("PRINCE2 Certified")]])("%j still counts", evidence => {
    expect(decide("PRINCE2 certification", "Other", evidence)).toBe("supported");
  });
});
