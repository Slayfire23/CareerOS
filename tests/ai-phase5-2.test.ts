import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { handsPartToSomeoneElse, splitBySubject } from "@/lib/ai/clauses";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements } from "@/lib/ai/evidence-boundary";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import { readFollowUpReply } from "@/lib/ai/rules/follow-up-reply";

// Phase 5.2 regressions. Each failure from the opened splits is pinned, with variants written apart from them.
const req = (text: string, category: MatchRequirement["category"] = "Skills"): MatchRequirement => ({ index: 0, text, category, priority: "Required" });
const verdict = (requirement: string, answer: string, category: MatchRequirement["category"] = "Skills") => readAnswer(req(requirement, category), answer).verdict;

describe("Stage 1a: another person's clause is theirs", () => {
  it("fv-052: the teacher's lessons aren't the person's", () => {
    const answer = "Our team uses curriculum lessons. I plan the small-group reading activities myself, the lead teacher plans the whole-class lessons.";
    expect(verdict("Lesson planning", answer)).not.toBe("supported");
    expect(answerStatements(answer).some(s => /lead teacher/.test(s.text))).toBe(false);
  });

  it("variants: a colleague's half of the sentence never counts for the person", () => {
    expect(verdict("Produce ordering", "I write the weekly menus myself, the head chef orders the produce on Fridays.")).toBe("insufficient_information");
    expect(verdict("Payroll processing", "I do the bookkeeping, my partner runs payroll every two weeks, and I file the quarterly taxes.")).toBe("insufficient_information");
    expect(verdict("Wheel alignment", "I swap the tires and balance them, while our alignment tech sets the camber and toe.")).toBe("insufficient_information");
  });

  it("the person's clause after someone else's still counts", () => {
    const statements = answerStatements("I do the bookkeeping, my partner runs payroll every two weeks, and I file the quarterly taxes.");
    expect(statements.map(s => s.text)).toContain("I file the quarterly taxes");
    expect(statements.some(s => /payroll/.test(s.text))).toBe(false);
  });

  it("splits only where the sentence changes hands", () => {
    expect(splitBySubject("I lay out and cut all the pieces, and I press the seams").length).toBe(1);
    expect(splitBySubject("I lay out the pieces, Marta does the stitching, and I press the seams").map(c => c.subject)).toEqual(["self", "other", "self"]);
    expect(splitBySubject("I clean the rooms, the bathrooms and the lobby").length).toBe(1);
    expect(splitBySubject("I write the objectives, the lesson plans, and the quizzes").length).toBe(1);
  });

  it("a line that opens on its verb isn't someone else's", () => {
    expect(verdict("Plasma cutting", "Plasma cut plate every day.")).toBe("possible");
    expect(verdict("Terraform", "Wrote Terraform modules for our AWS network and ran the plans in CI.")).toBe("supported");
  });
});

describe("Stage 1a: a reply that hands part of it to someone else", () => {
  it("fv-061, fv-080: 'he applied them', 'he did the ratings'", () => {
    expect(readFollowUpReply(req("Network firewall configuration"), "I configure our firewalls.", "I wrote up the rule requests for the new VPN users, he applied them.").outcome).toBe("unresolved");
    expect(readFollowUpReply(req("Bridge inspection"), "I've inspected bridges for the county.", "Yes, he did the ratings, I took the photos and measurements he called out.").outcome).toBe("unresolved");
  });

  it("variants", () => {
    expect(handsPartToSomeoneElse("I sign the report as the plant contact, but the consultant pulls the data and writes it up")).toBe(true);
    expect(handsPartToSomeoneElse("I prep the patient and the sonographer runs the scan")).toBe(true);
  });

  it("things and events in the same sentence aren't someone else's work", () => {
    expect(handsPartToSomeoneElse("Those tallies are mine")).toBe(false);
    expect(handsPartToSomeoneElse("One lady's heel ulcer closed in eleven weeks and I had the measurements to show it")).toBe(false);
    expect(handsPartToSomeoneElse("A small business owner came in Tuesday, I walked her through the business checking setup")).toBe(false);
    expect(handsPartToSomeoneElse("I rebuilt the allergen matrix myself when we switched bun suppliers and two items picked up sesame")).toBe(false);
  });

  it("owner decision fu-102 stands: a separate sentence about someone else's part doesn't take back the person's own", () => {
    const reply = "I set out the sticky traps myself and tell him where we've seen mice. He sprays and does the bait stations.";
    expect(readFollowUpReply(req("Pest control treatment"), "I arranged a monthly visit from an exterminator.", reply).reason).toBe("describes_own_work");
  });
});
