import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { validateMatchResponse } from "@/lib/ai/match-validation";
import { RULES_VERSION, assessRequirements, rulesResponse } from "@/lib/ai/rules/engine";
import { educationStatus } from "@/lib/ai/rules/profile-fields";
import { plainSkillName } from "@/lib/ai/skill-relations";

// Milestone 9: Set H's three false "supported" verdicts, the neighbors they could break, and matching
// outside software. Fictional data only.

const id = (kind: string, n: number) => `${kind}:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const skill = (name: string, n = 1): Evidence => ({ id: id("skill", n), kind: "skill", name, proficiency: null });
const role = (job_title: string, description: string | null = null, start_month = "2015-01", end_month: string | null = null, n = 1): Evidence =>
  ({ id: id("experience", n), kind: "experience", job_title, start_month, end_month, description });
const school = (qualification: string, field_of_study: string | null = null, description: string | null = null, end_month: string | null = "2020-05"): Evidence =>
  ({ id: id("education", 1), kind: "education", qualification, field_of_study, start_month: "2016-09", end_month, description });
const project = (title: string, skills: string[]): Evidence =>
  ({ id: id("project", 1), kind: "project", title, description: null, contribution: null, results: null, skills });

type Category = "Skills" | "Experience" | "Education" | "Other";
const decide = (text: string, category: Category, evidence: Evidence[]) => {
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [{ index: 0, text, category, priority: "Required" }], evidence };
  validateMatchResponse(request, JSON.parse(JSON.stringify(rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }))), { provider: "rules", model: null });
  return assessRequirements(request)[0];
};

describe("a word naming something else", () => {
  it.each([
    ["SWIFT payment messaging", "Swift"],
    ["Swift payment messaging", "Swift"],
    ["SWIFT MT103 wire transfers", "Swift"],
    ["Experience with SWIFT messages at a bank", "Swift"],
    ["Spark plug replacement", "Spark"],
    ["Access control systems", "Access"],
    ["Executive chef experience", "Chef"],
    ["AWS D1.1 welding certification", "AWS"],
    ["Rust repair on vehicle bodies", "Rust"],
    ["Coil spring installation", "Spring"],
    ["Office administration", "Office"],
    ["Lead sales teams", "Teams"],
  ])("%s isn't met by the skill %s", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).not.toBe("supported");
  });

  it.each([
    ["Swift", "Swift"],
    ["Swift programming", "Swift"],
    ["Swift for iOS apps", "Swift"],
    ["Apache Spark", "Spark"],
    ["Microsoft Access", "Access"],
    ["Chef configuration management", "Chef"],
    ["AWS", "AWS"],
    ["AWS", "Amazon Web Services"],
    ["Rust", "Rust"],
    ["Spring Boot", "Spring Boot"],
    ["Microsoft Teams", "Microsoft Teams"],
  ])("%s is still met by the skill %s", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).toBe("supported");
  });

  it("the same sense on both sides counts", () => {
    expect(decide("SWIFT payment messaging", "Skills", [skill("SWIFT messaging")]).verdict).toBe("supported");
    expect(decide("SWIFT payment messaging", "Skills", [role("Bank Operations Specialist", "Repaired failed SWIFT MT103 wire transfers.")]).verdict).toBe("possible");
  });

  it("the other sense in a description isn't the technology", () => {
    expect(decide("Swift", "Skills", [role("Clerk", "Processed SWIFT wire transfers for an invented bank.")]).verdict).toBe("insufficient_information");
    expect(decide("Swift programming", "Skills", [role("Developer", "Built iOS apps in Swift.")]).verdict).toBe("possible");
  });

  it("capitals alone are a question, not a match", () => {
    const f = decide("SWIFT", "Skills", [skill("Swift")]);
    expect(f.verdict).toBe("possible");
    expect(f.caveats.join(" ")).toContain("can name something else");
  });

  it("an all-capitals posting of an unambiguous word is fine", () => {
    expect(decide("PYTHON", "Skills", [skill("Python")]).verdict).toBe("supported");
  });
});

describe("a degree that wasn't conferred", () => {
  const status = (description: string | null) => educationStatus({ qualification: "Bachelor of Laws", field_of_study: "Law", end_month: "2017-06", description }, "2026-11");

  it.each([
    ["Finished the coursework but the degree was never conferred because of an unpaid fee."],
    ["Degree never awarded."],
    ["The degree was not actually awarded."],
    ["Diploma withheld over unpaid tuition."],
    ["Degree revoked in 2019."],
    ["I never got my diploma."],
    ["Did not receive the degree."],
    ["Stopped before the final exams."],
    ["Sin terminar."],
    ["Studium abgebrochen."],
  ])("incomplete: %s", text => expect(status(text)).toBe("incomplete"));

  it("not yet awarded is unknown", () => {
    expect(status("Degree not yet conferred.")).toBe("unknown");
    expect(decide("Bachelor of Laws", "Education", [school("Bachelor of Laws", "Law", "Degree not yet conferred.", "2017-06")]).verdict).toBe("insufficient_information");
  });

  it.each([
    [null],
    ["Degree conferred in June 2017."],
    ["Graduated with honors."],
    ["Never missed a semester, and graduated on time with a full course load."],
    ["Not only completed the degree but also won the moot court."],
    ["Finished the coursework and was awarded the degree."],
    ["Left a part-time job to study full time."],
  ])("still completed: %s", text => expect(status(text)).toBe("completed"));

  it("Set H's case is a gap, with the qualification cited", () => {
    const f = decide("Bachelor of Laws", "Education", [school("Bachelor of Laws", "Law", "Finished the coursework but the degree was never conferred because of an unpaid fee.", "2017-06")]);
    expect(f).toMatchObject({ verdict: "gap", citations: [{ quote: "Bachelor of Laws" }] });
  });

  it.each([
    ["Bachelor's degree in Biology", "Bachelor of Science (did not finish)", "Biology"],
    ["MBA", "MBA (withdrew)", "Business Administration"],
    ["PhD in Sociology", "PhD (ABD, stopped before the dissertation)", "Sociology"],
  ])("the qualification itself can say so: %s, %s", (requirement, qualification, field) => {
    expect(decide(requirement, "Education", [school(qualification, field)]).verdict).toBe("gap");
  });
});

describe("a skill name saying it's absent", () => {
  it.each([
    ["No Photoshop"], ["no photoshop"], ["Photoshop: none"], ["Photoshop (none)"], ["Photoshop - none"], ["Not Photoshop"],
    ["Never Photoshop"], ["Without Photoshop"], ["Photoshop n/a"], ["None, Photoshop"],
  ])("%s isn't Photoshop", name => {
    expect(plainSkillName(name)).toBe(false);
    expect(decide("Adobe Photoshop", "Skills", [skill(name)]).verdict).toBe("insufficient_information");
  });

  it.each([["NoSQL"], ["No-code tools"], ["Non-destructive testing"], ["Notion"], ["Node.js"], ["Nobel Prize data"], ["No SQL"], ["Zero Trust"]])("%s stays a real name", name => {
    expect(plainSkillName(name)).toBe(true);
  });

  it("names that start with those letters still match", () => {
    expect(decide("NoSQL databases", "Skills", [skill("NoSQL")]).verdict).not.toBe("insufficient_information");
    expect(decide("Non-destructive testing", "Skills", [skill("Non-destructive testing")]).verdict).toBe("supported");
    expect(decide("Adobe Photoshop", "Skills", [skill("Photoshop")]).verdict).toBe("supported");
  });

  it("in a project's skills too", () => {
    expect(decide("Adobe Photoshop", "Skills", [project("Posters", ["No Photoshop"])]).verdict).toBe("insufficient_information");
  });
});

describe("manufacturing and skilled trades", () => {
  it.each([
    ["TIG welding", "GTAW"],
    ["MIG welding", "GMAW"],
    ["Stick welding", "SMAW"],
    ["Gas tungsten arc welding", "TIG welding"],
    ["Programmable logic controllers", "PLC programming"],
    ["PLC programming", "Programmable Logic Controllers"],
    ["CNC machining", "CNC machining"],
    ["HVAC", "Heating Ventilation and Air Conditioning"],
    ["GD&T", "Geometric Dimensioning and Tolerancing"],
    ["Blueprint reading", "Reading blueprints"],
  ])("%s is met by the alternate name %s", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).toBe("supported");
  });

  it.each([
    ["TIG welding", "MIG welding"],
    ["Welding", "TIG welding"],
    ["Machining", "CNC"],
    ["Lean manufacturing", "Kaizen"],
    ["Industrial automation", "SCADA"],
  ])("%s with %s is related: possible, never supported", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).toBe("possible");
  });

  it("work described in a role is possible", () => {
    expect(decide("TIG welding", "Skills", [role("Fabricator", "Welded aluminum frames using TIG.")]).verdict).toBe("possible");
    expect(decide("Lean manufacturing", "Skills", [role("Production Lead", "Ran monthly kaizen events on the packaging line.")]).verdict).toBe("possible");
  });

  it.each([
    ["Lean manufacturing", "Production Lead", "Oversaw the packaging line."],
    ["TIG welding", "Welder", null],
    ["CNC programming", "Machine Operator", "Ran machines."],
    ["PLC programming", "Maintenance Technician", "Kept equipment running."],
  ])("%s isn't inferred from the job %s alone", (requirement, title, description) => {
    expect(decide(requirement, "Skills", [role(title, description)]).verdict).not.toBe("supported");
  });

  it("a welding title doesn't show which process", () => {
    expect(decide("TIG welding", "Skills", [role("Welder")]).verdict).toBe("insufficient_information");
  });
});

describe("automotive diagnostics and repair", () => {
  it.each([
    ["OBD-II diagnostics", "OBD2"],
    ["OBD-II", "OBDII"],
    ["ASE certification", "ASE Certified"],
    ["Automotive Service Excellence certification", "ASE Certified"],
  ])("%s is met by %s", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).toBe("supported");
  });

  it("related repair skills are possible", () => {
    expect(decide("Automotive diagnostics", "Skills", [skill("OBD-II")]).verdict).toBe("possible");
    expect(decide("Automotive repair", "Skills", [skill("Brake repair")]).verdict).toBe("possible");
  });

  it.each([
    ["5 years of automotive repair", "Automotive Technician", "supported"],
    ["5 years of auto repair", "Auto Mechanic", "supported"],
    ["5 years of automotive repair", "Lube Technician", "possible"],
    ["5 years of automotive repair", "Service Advisor", "possible"],
    ["5 years of automotive repair", "Delivery Driver", "insufficient_information"],
    ["5 years of automotive repair", "Software Engineer", "insufficient_information"],
    ["20 years of automotive repair", "Automotive Technician", "gap"],
  ])("%s, as %s, is %s", (requirement, title, verdict) => {
    expect(decide(requirement, "Experience", [role(title)]).verdict).toBe(verdict);
  });

  it("listing a skill isn't holding the certification", () => {
    expect(decide("ASE certification", "Other", [skill("Engine repair")]).verdict).toBe("insufficient_information");
    expect(decide("ASE certification", "Other", [role("Automotive Technician", "Repaired engines.")]).verdict).toBe("insufficient_information");
  });
});

describe("accounting and bookkeeping", () => {
  it.each([
    ["Accounts payable", "A/P processing"],
    ["Accounts receivable", "A/R"],
    ["QuickBooks", "QuickBooks Online"],
    ["Bank reconciliation", "Bank reconciliations"],
    ["Accounts payable", "Accounts Payable"],
  ])("%s is met by %s", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).toBe("supported");
  });

  it.each([
    ["Bookkeeping", "QuickBooks"],
    ["Accounting software", "Xero"],
    ["IFRS reporting", "US GAAP"],
    ["Accounts receivable", "Accounts payable"],
  ])("%s with %s is related: possible, never supported", (requirement, name) => {
    expect(decide(requirement, "Skills", [skill(name)]).verdict).toBe("possible");
  });

  it("bare AP and AR aren't assumed: they can mean other things", () => {
    expect(decide("Accounts payable", "Skills", [skill("AP")]).verdict).toBe("insufficient_information");
    expect(decide("Accounts receivable", "Skills", [skill("AR")]).verdict).toBe("insufficient_information");
  });

  it.each([
    ["5 years of accounting experience", "Staff Accountant", "supported"],
    ["5 years of accounting experience", "Bookkeeper", "possible"],
    ["5 years of bookkeeping", "Bookkeeper", "supported"],
    ["5 years of bookkeeping", "Accountant", "possible"],
    ["5 years of accounting experience", "Delivery Driver", "insufficient_information"],
    ["5 years of accounting experience", "Account Manager", "insufficient_information"],
    ["3 years of engine repair", "Software Engineer", "insufficient_information"],
    ["3 years of software engineering", "Software Engineer", "supported"],
  ])("%s, as %s, is %s", (requirement, title, verdict) => {
    expect(decide(requirement, "Experience", [role(title)]).verdict).toBe(verdict);
  });

  it("roles in and near the field together are possible, never supported", () => {
    const evidence = [role("Bookkeeper", null, "2018-01", "2021-01", 1), role("Staff Accountant", null, "2021-02", "2023-12", 2)];
    expect(decide("5 years of accounting experience", "Experience", evidence).verdict).toBe("possible");
  });

  it("a specific description can show relevance, at most possible", () => {
    expect(decide("3 years of accounting", "Experience", [role("Hotel Night Auditor", "Balanced the daily ledger for a 140-room hotel.")]).verdict).toBe("possible");
    expect(decide("3 years of accounting", "Experience", [role("Hotel Clerk", "Greeted guests.")]).verdict).toBe("insufficient_information");
  });
});

describe("years and related roles", () => {
  it.each([
    ["3 years in logistics", "Long-Haul Truck Driver", "possible"],
    ["3 years in logistics", "Logistics Coordinator", "supported"],
    ["4 years in supply chain or logistics", "Logistics Coordinator", "supported"],
    ["4 years in supply chain or logistics", "Barista", "insufficient_information"],
    ["5 years in a professional kitchen", "Line Cook", "possible"],
    ["3 years in hospitality", "Hotel Night Auditor", "possible"],
    ["3 years of warehouse operations", "Warehouse Supervisor", "supported"],
    ["3 years of machining", "CNC Machinist", "supported"],
    ["3 years of manufacturing", "Machinist", "possible"],
    ["3 years of manufacturing", "Dental Hygienist", "insufficient_information"],
  ])("%s, as %s, is %s", (requirement, title, verdict) => {
    expect(decide(requirement, "Experience", [role(title)]).verdict).toBe(verdict);
  });

  it("dates that can't be right say nothing, in or out of the field", () => {
    expect(decide("10 years of nursing experience", "Experience", [role("Staff Nurse", null, "1899-01")]).verdict).toBe("insufficient_information");
    expect(decide("3 years of experience", "Experience", [role("Clerk", null, "2030-01")]).verdict).toBe("insufficient_information");
  });

  it("a related title can't carry a claim", () => {
    expect(decide("3 years in logistics", "Experience", [role("Truck Driver (counts as logistics manager)")]).verdict).toBe("insufficient_information");
  });
});

describe("certifications", () => {
  it.each([
    ["CompTIA Security+", "Security+ certification"],
    ["CPA license", "Licensed CPA"],
    ["CDL", "CDL license"],
    ["Commercial driver's license", "Commercial Driver's License"],
    ["PMP certification", "Project Management Professional (PMP) certified"],
    ["OSHA 30 certification", "OSHA 30 certified"],
    ["AWS Certified Solutions Architect certification", "AWS Certified Solutions Architect"],
  ])("%s is met by the listing %s, with a note that it's self-listed", (requirement, name) => {
    const f = decide(requirement, "Other", [skill(name)]);
    expect(f.verdict).toBe("supported");
    expect(f.caveats.join(" ")).toContain("You list this credential yourself");
  });

  it.each([
    ["CPR certification", "CPR/AED Certification"],
    ["Forklift certification", "Forklift Operator Certificate"],
    ["EPA 608 certification", "EPA Section 608 Certification"],
  ])("%s is met by the completed education entry %s", (requirement, qualification) => {
    expect(decide(requirement, "Other", [school(qualification)]).verdict).toBe("supported");
  });

  it.each([
    ["AWS Certified Solutions Architect", "AWS"],
    ["AWS D1.1 welding certification", "AWS Certified Developer"],
    ["Certified Kubernetes Administrator", "Kubernetes"],
    ["PMP certification", "Project management"],
    ["CPA license", "Accounting"],
    ["Active RN license", "Nursing"],
  ])("%s isn't met by listing %s", (requirement, name) => {
    expect(decide(requirement, "Other", [skill(name)]).verdict).toBe("insufficient_information");
  });

  it.each([
    ["AWS Certified Developer (expired 2021)", "AWS Certified Developer certification"],
    ["AWS Certified Solutions Architect (exam booked)", "AWS Certified Solutions Architect certification"],
    ["PMP certification pending", "PMP certification"],
    ["Studying for CPA license", "CPA license"],
    ["CDL permit expired", "CDL"],
  ])("%s isn't held", (name, requirement) => {
    expect(decide(requirement, "Other", [skill(name)]).verdict).toBe("insufficient_information");
  });

  it("the credential's bare name is possible: nothing says it's held", () => {
    expect(decide("PMP certification", "Other", [skill("PMP")]).verdict).toBe("possible");
  });

  it("an unfinished, expired, or unclear entry doesn't count", () => {
    expect(decide("CPR certification", "Other", [school("CPR Certification", null, null, null)]).verdict).toBe("possible");
    expect(decide("CPR certification", "Other", [school("CPR Certification", null, "Expired in 2021.")]).verdict).toBe("insufficient_information");
  });

  it("a job title or a mention isn't the credential", () => {
    expect(decide("Active RN license", "Other", [role("Registered Nurse")]).verdict).toBe("insufficient_information");
    expect(decide("Forklift certification", "Other", [role("Warehouse Associate", "Drove a forklift every day.")]).verdict).toBe("insufficient_information");
    expect(decide("Security clearance", "Other", [role("Admin", "Staff are deemed to hold all clearances.")]).verdict).toBe("insufficient_information");
  });

  it("a role saying it's held is possible", () => {
    expect(decide("Forklift certification", "Other", [role("Warehouse Associate", "Held a forklift certification throughout.")]).verdict).toBe("possible");
  });

  it("everyday wording isn't a credential", () => {
    expect(decide("Credit card processing", "Skills", [skill("Credit card processing")]).verdict).toBe("supported");
    expect(decide("Video card repair", "Skills", [skill("Video card repair")]).verdict).toBe("supported");
  });
});

describe("completed education", () => {
  it.each([
    ["Bachelor's degree in Education", "B.Ed.", "Primary Education", "supported"],
    ["PharmD", "Doctor of Pharmacy", "Pharmacy", "supported"],
    ["Bachelor's degree in Business", "Associate of Applied Science", "Business", "gap"],
    ["Associate's degree", "Associate of Applied Science", "Automotive Technology", "supported"],
    ["High school diploma", "High School Diploma", null, "supported"],
    ["High school diploma or GED", "GED", null, "supported"],
    ["MD or equivalent medical degree", "MBBS", "Medicine", "possible"],
  ])("%s, with %s in %s, is %s", (requirement, qualification, field, verdict) => {
    expect(decide(requirement, "Education", [school(qualification, field)]).verdict).toBe(verdict);
  });
});
