import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import table from "@/lib/ai/rules/data/answer_equivalences.json";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { groupsFor, readAnswer } from "@/lib/ai/rules/answer-review";
import { questionKey } from "@/lib/ai/rules/review-queue";

// Equivalence batch 4 (logistics, office, legal, education, HR and sales), as the owner decided on 2026-11-10: ten groups
// approved with the exact phrases evaluated in docs/EQUIVALENCE_REVIEW_BATCH4.md; customer service, appointment scheduling,
// business travel and cold calling held. Production readings; nothing uses assumeApproved.
const req = (text: string): MatchRequirement => ({ index: 0, text, category: "Skills", priority: "Required" });
const read = (requirement: string, answer: string) => readAnswer(req(requirement), answer);
const group = (name: string) => table.groups.find(g => g.canonical === name)!;

const APPROVED: Record<string, [string[], string[]]> = {
  forkliftoperation: [["forklift operation", "forklift operating", "forklift driving", "operate a forklift", "operating a forklift"], ["operated a forklift", "operated forklifts", "drove a forklift", "drove forklifts", "operated a lift truck"]],
  cyclecounting: [["cycle counting", "cycle counts", "inventory counting", "stock counts"], ["ran cycle counts", "did stock counts", "performed stock counts"]],
  orderpicking: [["order picking", "picking orders", "pick orders"], ["picked customer orders", "filled orders from the shelves", "picked warehouse orders"]],
  lessonplanning: [["lesson planning", "develop lesson plans", "lesson plans"], ["wrote lesson plans", "prepared lesson plans", "planned weekly lessons"]],
  legalresearch: [["legal research"], ["researched case law", "researched statutes"]],
  contractdrafting: [["contract drafting", "draft contracts", "drafting contracts", "draft commercial contracts"], ["drafted contracts", "drafted commercial contracts"]],
  recruiting: [["recruiting", "recruitment", "candidate screening"], ["screened resumes", "interviewed job applicants", "screened job applicants", "interviewed job candidates"]],
  teamsupervision: [["team supervision", "supervise a team", "supervising staff", "staff supervision"], ["supervised a team of", "managed a team of", "supervised a crew of"]],
  discovery: [["discovery responses", "preparing discovery responses", "responding to discovery"], ["drafted discovery responses", "drafted interrogatory responses", "prepared discovery responses"]],
  routedispatch: [["route dispatching", "driver routes", "coordinating driver routes", "routing and scheduling", "route planning"], ["dispatched drivers", "planned delivery routes for drivers"]],
};

describe("batch 4: what the owner decided", () => {
  it("table version", () => expect(table.version).toBe("answer-equivalences-v5"));

  it.each(Object.entries(APPROVED))("%s has exactly the approved scope, and its names are asked as one question", (canonical, [asks, phrases]) => {
    expect(group(canonical)).toMatchObject({ asks, descriptions: phrases, verbs: [], objects: [], status: "owner_approved" });
    expect((group(canonical) as { review?: string }).review).toMatch(/owner decision 2026-11-10, equivalence batch 4/);
    for (const name of asks) expect(questionKey(name, "work_detail"), name).toBe(questionKey(asks[0], "work_detail"));
  });

  it("the narrowed phrases stay out", () => {
    expect(group("cyclecounting").descriptions).not.toContain("counted inventory");
    expect(group("teamsupervision").descriptions).not.toContain("supervised staff");
    expect(group("routedispatch").descriptions).not.toContain("dispatched trucks");
  });

  it("the two broad names are removed: team leadership and bare dispatching are their own questions", () => {
    expect(group("teamsupervision").asks).not.toContain("team leadership");
    expect(group("routedispatch").asks).not.toContain("dispatching");
    expect(groupsFor("Team leadership")).toEqual([]);
    expect(groupsFor("Dispatching")).toEqual([]);
    expect(questionKey("Team leadership", "work_detail")).not.toBe(questionKey("Team supervision", "work_detail"));
    expect(questionKey("Dispatching", "work_detail")).not.toBe(questionKey("Route dispatching", "work_detail"));
  });

  it("the four held groups stay unapproved and unchanged, and merge nothing", () => {
    expect(group("customerservice")).toMatchObject({ status: "source_checked", descriptions: ["resolved customer complaints", "handled customer complaints", "answered customer questions", "helped customers with", "resolved customer issues"] });
    expect(group("appointmentscheduling")).toMatchObject({ status: "source_checked", descriptions: ["booked appointments", "scheduled appointments", "booked patient appointments", "scheduled patient visits"] });
    expect(group("travelbooking")).toMatchObject({ status: "source_checked", descriptions: ["booked flights", "booked travel", "arranged travel"] });
    expect(group("coldcalling")).toMatchObject({ status: "source_checked", descriptions: ["made cold calls", "cold called", "make cold calls"] });
    expect(group("coldcalling").asks).toContain("prospecting");
    for (const q of ["Customer service", "Appointment scheduling", "Patient scheduling", "Booking business travel", "Cold calling", "Outbound prospecting"]) expect(groupsFor(q), q).toEqual([]);
  });
});

describe("batch 4: genuine experience qualifies through the approved group", () => {
  const cases: [string, string, string][] = [
    ["Forklift operation", "I operated a forklift every shift, loading and unloading trailers at the distribution center.", "forkliftoperation"],
    ["Cycle counting", "I ran cycle counts on the pick faces every morning and fixed variances in the system.", "cyclecounting"],
    ["Order picking", "I picked customer orders with an RF scanner and staged them for shipping.", "orderpicking"],
    ["Lesson planning", "I wrote lesson plans for my fourth-grade class every week, aligned to state standards.", "lessonplanning"],
    ["Legal research", "I researched case law on Westlaw and wrote memos for the litigation partners.", "legalresearch"],
    ["Contract drafting", "I drafted commercial contracts and negotiated redlines with opposing counsel.", "contractdrafting"],
    ["Recruiting", "I screened resumes and interviewed job applicants for our warehouse roles.", "recruiting"],
    ["Team supervision", "I supervised a team of nine cashiers and wrote their schedules.", "teamsupervision"],
    ["Preparing discovery responses", "I drafted discovery responses and organized document productions for our litigation team.", "discovery"],
    ["Route dispatching", "I dispatched drivers and planned delivery routes for drivers across three counties.", "routedispatch"],
  ];
  it.each(cases)("%s: %s", (requirement, answer, canonical) => {
    expect(read(requirement, answer)).toMatchObject({ verdict: "supported", sourceId: `equivalence:${canonical}` });
  });
});

describe("batch 4: the misleading wordings found in review don't get Supported", () => {
  const cases: [string, string][] = [
    ["Forklift operation", "I scheduled the drivers who operated forklifts on second shift."],
    ["Forklift operation", "I'm learning to drive a forklift for my certification next month."],
    ["Cycle counting", "I took inventory of my skills at a career workshop."],
    ["Cycle counting", "I counted stock certificates for the estate attorney."],
    ["Cycle counting", "I counted inventory of my record collection for insurance."],
    ["Cycle counting", "I reviewed the stock counts the clerks submitted."],
    ["Order picking", "I pulled orders from the supplier when prices rose."],
    ["Order picking", "I audited the orders the pickers filled from the shelves."],
    ["Lesson planning", "I wrote lesson plans as an assignment in my education course."],
    ["Legal research", "I researched precedents for our branding redesign."],
    ["Legal research", "I looked up case law for a school debate."],
    ["Legal research", "I proofread the memos after the associates researched case law."],
    ["Contract drafting", "I prepared contracts for signature by printing and tabbing them."],
    ["Contract drafting", "I drafted agreements for our roommate chore schedule."],
    ["Contract drafting", "I wrote contracts on the whiteboard for the sales team's goals."],
    ["Recruiting", "I interviewed candidates for the school newspaper election story."],
    ["Recruiting", "I screened candidates for symptoms at the clinic door."],
    ["Recruiting", "I screened applicants' badges at the security desk."],
    ["Recruiting", "I scheduled the interviews the hiring managers held with candidates."],
    ["Team supervision", "I led a team-building game at the company picnic."],
    ["Team supervision", "I supervised staff parking in the lot as a valet."],
    ["Team supervision", "I was supervised by a team lead."],
    ["Team supervision", "I was a member of a team that a manager supervised."],
    ["Preparing discovery responses", "I answered interrogatories in my own divorce case."],
    ["Preparing discovery responses", "I responded to discovery as a defendant in a small claims case."],
    ["Preparing discovery responses", "I copied the discovery responses the paralegals drafted."],
    ["Route dispatching", "I assigned drivers parking spots in the new lot."],
    ["Route dispatching", "I planned delivery routes for my own newspaper route."],
    ["Route dispatching", "I dispatched trucks of donated food to shelters as a volunteer driver."],
    ["Route dispatching", "I rode along while the dispatcher dispatched drivers."],
  ];
  it.each(cases)("%s: %s", (requirement, answer) => {
    expect(read(requirement, answer).verdict).not.toBe("supported");
  });
});

describe("batch 4: classes, supervising, helping, outside firms, someone else, negations and hypotheticals stay without Supported", () => {
  const work: [string, string, string][] = [
    ["Forklift operation", "operated a forklift", "operate a forklift"],
    ["Cycle counting", "ran cycle counts", "run cycle counts"],
    ["Order picking", "picked customer orders", "pick customer orders"],
    ["Lesson planning", "wrote lesson plans", "write lesson plans"],
    ["Legal research", "researched case law", "research case law"],
    ["Contract drafting", "drafted contracts", "draft contracts"],
    ["Recruiting", "screened resumes", "screen resumes"],
    ["Team supervision", "supervised a crew of six", "supervise a crew of six"],
    ["Preparing discovery responses", "drafted discovery responses", "draft discovery responses"],
    ["Route dispatching", "dispatched drivers", "dispatch drivers"],
  ];
  it.each(work)("%s (%s)", (requirement, past, base) => {
    const notSupported = [
      `I took a one-day class where the instructor ${past} and we watched.`,
      `I supervise the people who ${past} and I approve their work.`,
      `I helped the specialist who ${past}, mostly fetching files.`,
      `We hired an outside firm that ${past} for us.`,
      `My coworker ${past}; I just watched.`,
      `I have never ${past}.`,
      `I could ${base} if needed.`,
    ];
    for (const answer of notSupported) expect(read(requirement, answer).verdict, answer).not.toBe("supported");
  });
});

describe("batch 4: labeled legitimate answers in held groups are preserved", () => {
  // Each is labeled in its own set (m11_review: qualified, Supported acceptable; m11_followup2/3: answer_verdict). The evaluated
  // candidates would have dropped each to Not enough information; holding the group keeps today's Possible.
  const cases: [string, string][] = [
    ["Booking business travel", "I find flights and hotels for our directors, send them the itinerary, and file the receipts when they get back from a trip."],
    ["Outbound prospecting", "I work a list of companies who've never bought from us, make about sixty cold calls a day, and book first meetings for the team."],
    ["Patient scheduling", "I book appointments for three physical therapists. Well, I also handle the waitlist and rebook cancellations, which is most of my mornings."],
    ["Handle patient scheduling and insurance verification", "I book all the appointments and reschedules, my coworker Tasha runs the insurance checks before each visit and calls the patient if something's not covered."],
  ];
  it.each(cases)("%s stays Possible", (requirement, answer) => {
    expect(read(requirement, answer).verdict).toBe("possible");
  });
});
