import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { requiredMonths, statedYears, unquantifiedTime, validateMatchResponse } from "@/lib/ai/match-validation";
import { RULES_VERSION, assessRequirements, rulesResponse } from "@/lib/ai/rules/engine";
import { rolePart } from "@/lib/ai/rules/profile-fields";
import { untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import { keywordDump, labelledList } from "@/lib/ai/skill-relations";

// Milestone 10 safety: general behaviors with new, invented wording. None of these come from a held-out
// set. Each group has honest neighbors, because a rule that only blocks is easy to write and useless.

const id = (kind: string, n: number) => `${kind}:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const skill = (name: string, n = 1): Evidence => ({ id: id("skill", n), kind: "skill", name, proficiency: null });
const role = (job_title: string, description: string | null = null, start_month = "2015-01", end_month: string | null = null, n = 1): Evidence =>
  ({ id: id("experience", n), kind: "experience", job_title, start_month, end_month, description });

type Category = "Skills" | "Experience" | "Education" | "Other";
const decide = (text: string, category: Category, evidence: Evidence[]) => {
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [{ index: 0, text, category, priority: "Required" }], evidence };
  validateMatchResponse(request, JSON.parse(JSON.stringify(rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }))), { provider: "rules", model: null });
  return assessRequirements(request)[0];
};

describe("durations in any common form", () => {
  it.each([
    ["3 yrs", 36], ["3yrs", 36], ["3 yr", 36], ["3 yr.", 36], ["3-yr", 36], ["5+ yrs", 60], ["5 + yrs", 60], ["three yrs", 36],
    ["1.5 yrs", 18], ["2 to 4 yrs", 24], ["2-4 yrs", 24], ["2–4 yrs", 24], ["2 - 4 years", 24],
    ["18 mos", 18], ["18mos", 18], ["18 mo", 18], ["18 mths", 18], ["18 mth", 18], ["6 mos.", 6], ["18 months", 18],
    ["2 yrs 6 mos", 30], ["2 years and 6 months", 30], ["2 years, 6 months", 30], ["1 yr 3 mo", 15],
    ["a year", 12], ["one year", 12], ["half a year", 6], ["a decade", 120], ["two decades", 240], ["half a decade", 60],
    ["one and a half years", 18], ["３ yrs", 36], ["a couple of years", 24], ["a couple years", 24],
    ["at least 4 yrs", 48], ["min. 4 yrs", 48], ["min 4 yrs exp", 48],
  ])("%s is %i months", (text, months) => {
    expect(requiredMonths(`${text} of welding`)).toBe(months);
  });

  it("offers the shortest of two separate amounts, not their sum", () => {
    expect(requiredMonths("2 years of welding or 6 months of brazing")).toBe(6);
  });

  it("doesn't read other things as time", () => {
    for (const text of ["Yr-end close", "MO licensed attorney", "Y2K remediation", "18 mobile apps", "3 yrsa", "Mo. Dept. of Revenue"]) {
      expect(requiredMonths(text), text).toBeNull();
    }
    expect(statedYears("Class 3 license")).toEqual([]);
  });

  it.each([
    "Several years of welding", "A few yrs of welding", "Multiple years of welding", "Many years in welding", "Years of welding experience",
    "Long tenure in welding", "Seasoned welder with significant tenure", "Some years of welding",
  ])("%s asks for time it doesn't state, so it never reaches Supported", text => {
    expect(unquantifiedTime(text)).toBe(true);
    const f = decide(text, "Experience", [role("Welder", null, "2026-09")]);
    expect(f.verdict).not.toBe("supported");
  });

  it.each(["Welding experience", "Year-end close", "Two-year college degree"])("%s doesn't ask for unstated time", text => {
    expect(unquantifiedTime(text)).toBe(false);
  });

  it.each([
    ["4 yrs welding"], ["4yrs welding"], ["4 to 6 yrs welding"], ["48 mos welding"], ["4 yrs exp in welding"], ["3 yrs 6 mos welding"], ["a decade of welding"],
  ])("%s is held to the time asked for", text => {
    const short = decide(text, "Experience", [role("Welder", null, "2025-01")]);
    expect(short.verdict).toBe("gap");
    const long = decide(text, "Experience", [role("Welder", null, "2010-01")]);
    expect(long.verdict).toBe("supported");
  });

  it("doesn't take a skill's listing as time with it, whichever way the time is written", () => {
    for (const text of ["5 yrs SQL", "60 mos SQL", "SQL (5 yrs)"]) {
      expect(decide(text, "Skills", [skill("SQL")]).verdict, text).toBe("possible");
    }
  });
});

describe("keyword lists aren't work", () => {
  it.each([
    "Keywords: Tableau Tableau Tableau admin Tableau administration Tableau.",
    "Keywords: Tableau administration",
    "KEYWORDS - Tableau administration.",
    "Keywords： Tableau administration",
    "Search terms: Tableau administration, Tableau support",
    "ATS keywords: Tableau administration",
    "SEO: Tableau administration",
    "Tags: Tableau administration, Tableau support",
    "Tableau Tableau Tableau Tableau administration",
    "Tableau administration Tableau administration Tableau administration",
    "Tableau administration, Tableau administration, Tableau administration",
    "Tableau, Tableau, Tableau, Tableau administration",
    "Administered Tableau Tableau Tableau Tableau",
    "Tableau administration | Looker administration | Qlik administration | Domo administration",
  ])("%s", text => {
    expect(keywordDump(text), "marked as a dump").toBe(true);
    const f = decide("Tableau administration", "Skills", [role("Cashier", text)]);
    expect(f.verdict).toBe("insufficient_information");
    expect(f.citations).toEqual([]);
  });

  it("only drops the dump: real work beside it still counts", () => {
    const text = "Keywords: Kafka Kafka Kafka. Built Looker dashboards for the sales team.";
    expect(decide("Kafka", "Skills", [role("Analyst", text)]).verdict).toBe("insufficient_information");
    expect(decide("Looker", "Skills", [role("Analyst", text)]).verdict).toBe("supported");
  });

  it("a labelled list of tools is a lead, not direct use", () => {
    expect(labelledList("Tools: Tableau, Excel, SQL")).toBe(true);
    expect(decide("Tableau", "Skills", [role("Analyst", "Tools: Tableau administration, Excel, SQL")]).verdict).toBe("possible");
    expect(decide("Tableau", "Skills", [role("Analyst", "Skills: Tableau administration")]).verdict).toBe("possible");
  });

  it("keeps honest short descriptions and honest repetition", () => {
    for (const [wanted, text] of [
      ["Kafka", "Built Kafka consumers, tuned Kafka brokers, and monitored Kafka lag."],
      ["Windows", "Windows support, Mac support, printer support."],
      ["Windows", "Windows support, password resets, ticket triage."],
      ["Tableau", "Administered Tableau for 300 users."],
      ["Tableau", "Tableau administration."],
    ]) {
      expect(keywordDump(text), text).toBe(false);
      expect(decide(wanted, "Skills", [role("Engineer", text)]).verdict, text).toBe("supported");
    }
  });

  it("a repeated title or skill name is never used", () => {
    expect(decide("Tableau", "Skills", [skill("Tableau Tableau Tableau")]).verdict).toBe("insufficient_information");
    expect(decide("Welding experience", "Experience", [role("Welder Welder Welder Welder")]).verdict).not.toBe("supported");
  });

  it("a dump can't turn the years of a role into time with a technology", () => {
    const f = decide("5 yrs of Tableau", "Experience", [role("Cashier", "Keywords: Tableau administration Tableau support", "2010-01")]);
    expect(f.verdict).not.toBe("supported");
  });

  it("marks the dump as a span that citations can't quote", () => {
    const text = "Keywords: Tableau administration. Ran the Friday close.";
    const spans = untrustedEvidenceSpans(text);
    expect(spans.some(([s, e]) => text.slice(s, e).includes("Keywords"))).toBe(true);
    expect(spans.some(([s, e]) => text.slice(s, e).includes("Friday"))).toBe(false);
  });
});

describe("a workplace's name isn't the role", () => {
  it.each([
    ["Kitchen Aide, Harbor View Nursing Home", "Kitchen Aide"],
    ["Kitchen Aide at Harbor View Nursing Home", "Kitchen Aide"],
    ["Kitchen Aide @ Harbor View Nursing Home", "Kitchen Aide"],
    ["Kitchen Aide - Harbor View Nursing Home", "Kitchen Aide"],
    ["Kitchen Aide — Harbor View Nursing Home", "Kitchen Aide"],
    ["Kitchen Aide | Harbor View Nursing Home", "Kitchen Aide"],
    ["Kitchen Aide (Harbor View Nursing Home)", "Kitchen Aide"],
    ["Nursing Home Kitchen Aide", "Kitchen Aide"],
    ["Groundskeeper, Lakeside Law Center", "Groundskeeper"],
    ["Driver for Summit Dental Group", "Driver"],
    ["Security Guard, First National Bank", "Security Guard"],
    ["Receptionist, Ridgeway Engineering Inc.", "Receptionist"],
    ["Night Porter at the Accounting Society", "Night Porter"],
  ])("%s is %s", (title, part) => {
    expect(rolePart(title)).toBe(part);
  });

  it.each([
    ["Manager, Accounting"], ["Director, Nursing"], ["Analyst, Risk Management"], ["Engineer, Data Platform"], ["Registered Nurse"], ["Nursing Assistant"], ["Hospital Pharmacist"],
    ["Bank Teller"], ["Senior Engineer - Payments"], ["Engineer (Payments)"],
  ])("%s stays whole", title => {
    expect(rolePart(title)).toBe(title);
  });

  it.each([
    ["Nursing experience", "Kitchen Aide, Harbor View Nursing Home"],
    ["3 years of nursing experience", "Kitchen Aide, Harbor View Nursing Home"],
    ["3 yrs nursing", "Kitchen Aide at Harbor View Nursing Home"],
    ["Nursing experience", "Nursing Home Kitchen Aide"],
    ["Legal experience", "Groundskeeper, Lakeside Legal Center"],
    ["Banking experience", "Security Guard, Northern Banking Group"],
    ["Dental experience", "Driver for Summit Dental Group"],
    ["3 years of engineering experience", "Receptionist, Ridgeway Engineering Inc."],
    ["Accounting experience", "Night Porter at the Accounting Society"],
  ])("%s isn't shown by %s", (text, title) => {
    const f = decide(text, "Experience", [role(title, null, "2015-01")]);
    expect(f.verdict).toBe("insufficient_information");
  });

  it.each([
    ["Nursing experience", "Registered Nurse, Harbor View Nursing Home"],
    ["3 yrs nursing", "Registered Nurse at Harbor View Nursing Home"],
    ["Accounting experience", "Manager, Accounting"],
    ["Accounting experience", "Staff Accountant, Ridgeway Inc."],
    ["3 years of welding", "Welder, Ridgeway Fabrication Inc."],
    ["Nursing experience", "Director, Nursing"],
  ])("%s is shown by the role in %s", (text, title) => {
    expect(decide(text, "Experience", [role(title, null, "2015-01")]).verdict).toBe("supported");
  });

  it("a requirement about the setting itself is met by the setting", () => {
    expect(decide("Nursing home experience", "Experience", [role("Kitchen Aide, Harbor View Nursing Home")]).verdict).toBe("possible");
    expect(decide("Hospital experience", "Experience", [role("Housekeeper, Mercy Hospital")]).verdict).toBe("possible");
  });
});

describe("wishes and other people's work aren't evidence", () => {
  it.each([
    ["Figma", "Would love to use Figma on a real product."],
    ["Figma", "I'd love to use Figma."],
    ["Figma", "Excited to learn Figma."],
    ["Figma", "Eager to try Figma."],
    ["Figma", "Hope to use Figma next year."],
    ["Figma", "Figma is on my list to learn."],
    ["Figma", "Dream of working with Figma."],
    ["Xero", "My colleague handled the Xero reconciliations."],
    ["Xero", "My manager ran Xero month-end."],
    ["Xero", "Our bookkeeper administered Xero."],
    ["Xero", "The accountant maintained Xero."],
    ["Xero", "Xero was run by the finance team."],
    ["Xero", "Xero was handled by an outside firm."],
  ])("%s, from: %s", (wanted, text) => {
    const f = decide(wanted, "Skills", [role("Clerk", text)]);
    expect(["insufficient_information", "gap"]).toContain(f.verdict);
  });

  it("the person's own work beside someone else's still counts", () => {
    expect(decide("Xero", "Skills", [role("Clerk", "My manager reviewed the books; I reconciled Xero daily.")]).verdict).toBe("supported");
    expect(decide("Figma", "Skills", [role("Designer", "Designed the new checkout in Figma with my colleague.")]).verdict).toBe("supported");
  });
});

describe("credentials that aren't held yet", () => {
  it.each(["CPA candidate", "CPA eligible", "Aspiring CPA", "Sitting for the CPA exam", "CPA (exam 2 of 4)"])("%s doesn't show the CPA", name => {
    expect(decide("CPA license", "Other", [skill(name)]).verdict).not.toBe("supported");
  });
});
