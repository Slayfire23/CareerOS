import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import equivalences from "@/lib/ai/rules/data/answer_equivalences.json";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { groupsFor, readAnswer } from "@/lib/ai/rules/answer-review";
import { questionKey } from "@/lib/ai/rules/review-queue";

// Equivalence batch 1 (finance and office), as the owner decided on 2026-11-07. Positive cases are genuine experience in the
// group's own phrases; negative cases are the misleading wordings found in review. Nothing here uses assumeApproved: these are
// the production readings.
const req = (text: string): MatchRequirement => ({ index: 0, text, category: "Skills", priority: "Required" });
const read = (requirement: string, answer: string) => readAnswer(req(requirement), answer);
const APPROVED = ["accountspayable", "accountsreceivable", "bankreconciliation", "bookkeeping", "cashhandling", "dataentry", "monthendclose", "payroll"];

describe("batch 1: what the owner decided", () => {
  it("eight Batch 1 approvals and the budgeting rejection remain intact", () => {
    expect(equivalences.version).toBe("answer-equivalences-v3");
    const batch1 = equivalences.groups.filter(g => [...APPROVED, "budgeting"].includes(g.canonical));
    expect(batch1.filter(g => g.status === "owner_approved").map(g => g.canonical).sort()).toEqual(APPROVED);
    expect(batch1.filter(g => g.status === "owner_rejected").map(g => g.canonical)).toEqual(["budgeting"]);
    for (const g of batch1) expect((g as { review?: string }).review, g.canonical).toMatch(/owner decision 2026-11-07, equivalence batch 1/);
  });

  it("the revisions are exactly the documented ones", () => {
    const g = (name: string) => equivalences.groups.find(x => x.canonical === name)!;
    expect(g("bookkeeping").descriptions).not.toContain("kept the books");
    expect(g("bookkeeping").objects).toEqual(["general ledger", "journal entries"]);
    expect(g("payroll").objects).toEqual(["paychecks"]);
    expect(g("payroll").descriptions).not.toContain("calculated wages");
    expect(g("payroll").related).toContain("calculated wages");
    expect(g("accountspayable").descriptions).not.toContain("paid vendors");
    expect(g("accountspayable").objects).not.toContain("vendors");
    expect(g("accountsreceivable").objects).not.toContain("customers");
    expect(g("bankreconciliation").verbs).toEqual(["reconcile", "reconciles", "reconciled"]);
    expect(g("bankreconciliation").descriptions).not.toContain("matched bank statements");
    expect(g("monthendclose").descriptions).toEqual(["closed the books", "ran the month-end close"]);
    expect(g("monthendclose").verbs).toEqual([]);
    expect(g("cashhandling").objects).not.toContain("register");
    expect(g("dataentry").descriptions).toEqual(["keyed records", "keyed in records", "entered data into"]);
    expect(g("dataentry").verbs).toEqual([]);
  });

  it("an approved group answers its names as one question, so people aren't asked twice", () => {
    expect(questionKey("Bookkeeping", "work_detail")).toBe(questionKey("General ledger", "work_detail"));
    expect(questionKey("Payroll", "work_detail")).toBe(questionKey("Run payroll", "work_detail"));
    expect(groupsFor("Budgeting")).toEqual([]);
    expect(groupsFor("Phlebotomy")).toEqual([]);
  });
});

describe("batch 1: genuine experience qualifies, in the approved phrases", () => {
  const cases: [string, string][] = [
    ["Bookkeeping", "I posted journal entries for both stores every day and maintained the ledger in QuickBooks."],
    ["General ledger", "Each week I posted entries to the ledger for our rental properties."],
    ["Payroll processing", "Every other Friday I prepared paychecks for 40 people from the timesheets."],
    ["Run payroll", "I ran payroll for a 25-person landscaping company for three years."],
    ["Accounts payable", "I matched invoices to purchase orders and ran payment batches twice a week."],
    ["Accounts payable", "I processed vendor invoices for the whole warehouse, about 200 a month."],
    ["Accounts receivable", "I billed customers at month-end and chased overdue invoices until they paid."],
    ["Bank reconciliation", "Each month I reconciled the bank statements for our six checking accounts."],
    ["Month-end close", "I closed the books every month: accruals, reconciliations and the trial balance."],
    ["Cash handling", "I counted the till at open and close and balanced the register every shift."],
    ["Data entry", "I keyed records from paper claim forms into the system all day."],
  ];
  it.each(cases)("%s: %s", (requirement, answer) => {
    expect(read(requirement, answer).verdict).toBe("supported");
    expect(read(requirement, answer).sourceId).toMatch(/^equivalence:/);
  });
});

describe("batch 1: the misleading wordings found in review don't get Supported", () => {
  const cases: [string, string][] = [
    ["Bookkeeping", "I keep the books on the shelves in order at the library."],
    ["Bookkeeping", "I maintain the ledger of tool checkouts in the shop."],
    ["Payroll processing", "I calculate wages for our labor cost forecast each quarter."],
    ["Accounts payable", "I process vendors' onboarding forms for procurement."],
    ["Accounts receivable", "I collect customers' coats at the front desk."],
    ["Accounts receivable", "I chase customers who leave without paying for gas."],
    ["Bank reconciliation", "I match bank statements to the right folders before filing them."],
    ["Month-end close", "I ran the month-end inventory count in the warehouse."],
    ["Month-end close", "I close the month's schedule in the staffing app."],
    ["Cash handling", "I balance the register tape rolls in the supply closet."],
    ["Data entry", "I enter the data center through the badge door every morning."],
    ["Data entry", "I type records of our team meetings now and then."],
  ];
  it.each(cases)("%s: %s", (requirement, answer) => {
    expect(read(requirement, answer).verdict).not.toBe("supported");
  });
});

describe("batch 1: classes, supervising, helping, delegating, someone else, negations and hypotheticals stay without Supported", () => {
  const work: [string, string][] = [
    ["Bookkeeping", "posted journal entries"],
    ["Payroll processing", "processed paychecks"],
    ["Accounts payable", "processed vendor invoices"],
    ["Accounts receivable", "chased overdue invoices"],
    ["Bank reconciliation", "reconciled bank statements"],
    ["Month-end close", "closed the books"],
    ["Cash handling", "counted the till"],
    ["Data entry", "keyed records"],
  ];
  it.each(work)("%s (%s)", (requirement, phrase) => {
    const notSupported = [
      `I took a one-day class where the instructor ${phrase} and we watched.`,
      `I supervise the clerks who ${phrase} and I approve their work.`,
      `I helped the specialist who ${phrase}, mostly fetching files.`,
      `We hired an outside firm that ${phrase} for us.`,
      `My coworker ${phrase}; I just watched.`,
      `I have never ${phrase}.`,
      `I could do it if needed, since I've seen how someone ${phrase}.`,
    ];
    for (const answer of notSupported) expect(read(requirement, answer).verdict, answer).not.toBe("supported");
  });
});

describe("batch 1: what stays as it was", () => {
  // Kept as a regression case, as the owner asked. It's genuine reconciliation work. Its Possible came only from the unapproved
  // group's "match … statement activity" pattern, which the approved revision removed, and it shares no word with the
  // requirement, so it now gets nothing. Reported to the owner; recognition work may lift it later.
  it("the genuine bank-reconciliation answer that matched only through a removed pattern: now Not enough information", () => {
    const answer = "Each month I matched the statement activity for our six checking accounts line by line to the ledger and cleared outstanding deposits and uncashed checks.";
    expect(read("Performing bank reconciliations", answer).verdict).toBe("insufficient_information");
  });

  it("budgeting is rejected, so it grants nothing and merges nothing", () => {
    expect(questionKey("Budgeting", "work_detail")).not.toBe(questionKey("Budget preparation", "work_detail"));
    expect(read("Budget preparation", "I drew up the budget for the volunteer program.").sourceId).toBeNull();
  });

  it("an unapproved group still grants nothing beyond Possible", () => {
    expect(read("Phlebotomy", "I drew blood from about 20 patients each morning using vacuum tubes.").verdict).toBe("possible");
  });
});
