import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { handsPartToSomeoneElse, splitBySubject } from "@/lib/ai/clauses";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements, involvement } from "@/lib/ai/evidence-boundary";
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

describe("Stage 1b: what the person's part was, from the main verb", () => {
  it("fv-046, fv-062, fv-091: running or managing hands-on work isn't doing it", () => {
    expect(verdict("Software code review", "I make sure every PR on my team gets two reviewers and I set the review guidelines. I approve merges for releases.")).toBe("insufficient_information");
    expect(verdict("Commercial cleaning", "I manage cleaning for eight office buildings. I schedule the night crews, do quality walk-throughs, and handle tenant complaints.")).toBe("insufficient_information");
    expect(verdict("Teaching swimming lessons", "I run the swim lesson program at the rec center. I hire and schedule the instructors, assign the classes, and observe lessons for evaluations.")).toBe("insufficient_information");
  });

  it("variants: supervising the hands-on work, in other words", () => {
    expect(verdict("Drywall finishing", "I run two finishing crews on the tract homes and walk every house before paint.")).toBe("insufficient_information");
    expect(verdict("Forklift operation", "I manage the forklift drivers on second shift and make sure every pallet gets put away by close.")).toBe("insufficient_information");
    expect(verdict("Patient bathing", "I lead a team of six aides on the night shift.")).toBe("insufficient_information");
  });

  it("supervising counts where supervising is what's asked", () => {
    expect(verdict("Supervising cleaning staff", "I manage cleaning for eight office buildings and schedule the night crews.")).not.toBe("insufficient_information");
  });

  it("fv-042, fv-088: asking a provider to do it isn't doing it, unless coordinating is what's asked (owner rule 3)", () => {
    expect(verdict("IT helpdesk support", "When our computers break we put in a ticket with the managed IT company. They remote in and fix it.")).toBe("insufficient_information");
    expect(verdict("Snow removal equipment operation", "Snow removal at our complexes is a contract with a plow company. I call them when we get over two inches.")).toBe("insufficient_information");
    expect(verdict("Roof repair", "When the roof leaks I call the roofer and let him in.")).toBe("insufficient_information");
    expect(verdict("Vendor coordination", "I put in the work orders with our HVAC vendor and follow up until each one's closed.")).not.toBe("insufficient_information");
  });

  it("watching isn't doing it (owner rule 5)", () => {
    expect(involvement("I watched the electrician wire the panel")).toBe("observed");
    expect(involvement("I was the note-taker on every inspection")).toBe("observed");
    expect(involvement("I sat in on the depositions")).toBe("observed");
    expect(verdict("Panel wiring", "I watched the electrician wire the panel.")).toBe("insufficient_information");
  });

  it("a word inside a name isn't the person's part: 'new hire training', 'the help desk', 'a hand bender'", () => {
    expect(verdict("Staff training", "I do all the staff training for the front desk: new hire training on the property system, and refresher training each quarter.")).toBe("supported");
    expect(answerStatements("I'm the one who troubleshoots the card readers before calling the help desk.")[0]?.ownership).toBe("performed");
    expect(verdict("G-code programming", "I write and edit G-code by hand for our Haas mills.")).toBe("supported");
  });

  it("running a thing yourself is doing it", () => {
    expect(answerStatements("I run the dishwasher and the pot sink on close.")[0]?.ownership).toBe("performed");
    expect(answerStatements("I follow up a week later to make sure direct deposit came through.")[0]?.ownership).toBe("performed");
    expect(answerStatements("I submit claims and work denials.")[0]?.ownership).toBe("performed");
  });

  it("who did it has to be said (owner rule 6): a sentence about a thing or someone else is no lead", () => {
    expect(verdict("Drafting legal contracts", "Outside counsel writes the first drafts for anything big.")).toBe("insufficient_information");
    expect(verdict("Tempering chocolate", "Temper chocolate for bonbons weekly.")).toBe("possible");
    expect(verdict("E-filing court documents", "E-filed motions through the county court portal.")).toBe("possible");
  });

  it("'$1.4M' and '1.29 to 1.30' are one sentence", () => {
    expect(answerStatements("I closed $1.4M last year against a $1M quota.").length).toBe(1);
  });
});
