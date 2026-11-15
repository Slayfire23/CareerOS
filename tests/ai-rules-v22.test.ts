import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements, DEFAULT_TEXT_RULES, directedAtPerson, isV21Family, othersParts, type TextRules } from "@/lib/ai/evidence-boundary";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import { followUpKind, readFollowUpReply } from "@/lib/ai/rules/follow-up-reply";
import { assessConsistency } from "@/lib/ai/rules/structured-consistency";
import { RECOGNITION_VERSION, recognizeParts } from "@/lib/ai/rules/split-recognition";

// Phase 5.3 Stage F0: rules-v22, OPT-IN. rules-v21 plus one rule: work the person was sent, assigned, scheduled, put or
// "had" to do ("My boss sends me out to install water heaters") is the person's own work, read exactly as "I install
// water heaters". Probes written before the code. rules-v21 stays the default and reads every text as before.
const REQ = "Install and repair residential plumbing";
const req: MatchRequirement = { index: 0, text: REQ, category: "Skills", priority: "Required" };
const read = (text: string, rules: TextRules) => ({
  statements: answerStatements(text, rules).map(s => [s.subject, s.ownership, s.exposureOnly, s.text]),
  verdict: readAnswer(req, text, { textRules: rules }).verdict,
  consistency: assessConsistency({ requirement: { text: REQ, category: "Skills" }, involvement: "PERFORMED", explanation: text, textRules: rules }).reason,
  parts: recognizeParts({ splitId: "A58", explanation: text, textRules: rules }).parts.map(p => [p.shown, p.transferred]),
  others: othersParts(text, true, false, true, rules === "v22"),
});

// [id, text, the person's own words it is read as, the parts it names]
const OWN: [string, string, string, [boolean, boolean]][] = [
  ["P1", "My boss sends me out to install water heaters and fix leaks every day.", "I install water heaters and fix leaks every day.", [true, true]],
  ["P2", "The company sends me to install water heaters and fix leaks in homes.", "I install water heaters and fix leaks in homes.", [true, true]],
  ["P3", "Dispatch sends me out to install water heaters every day.", "I install water heaters every day.", [true, false]],
  ["P4", "My supervisor has me install water heaters and fix leaks.", "I install water heaters and fix leaks.", [true, true]],
  ["P5", "They usually send me out to fix leaks and unclog drains.", "I fix leaks and unclog drains.", [false, true]],
  ["P6", "My foreman assigns me to install water heaters on new builds.", "I install water heaters on new builds.", [true, false]],
  ["P7", "The office schedules me to repair leaking pipes most mornings.", "I repair leaking pipes most mornings.", [false, true]],
  ["P8", "My boss had me install water heaters and fix leaks for three years.", "I install water heaters and fix leaks for three years.", [true, true]],
];

// Must read exactly as rules-v21 reads them.
const SAME: [string, string][] = [
  ["tell", "My boss tells me to fix the leaks."],
  ["ask", "My manager asks me to fix leaks in tenants' homes every week."],
  ["let (refusal)", "The inspector doesn't let me touch anything load bearing."],
  ["make", "My boss makes me install water heaters."],
  ["negation", "My boss never sends me out to install water heaters."],
  ["negation (n't)", "My boss doesn't send me out to fix leaks."],
  ["intention", "My boss wants to send me out to install water heaters next year."],
  ["future", "My boss is going to send me out to fix leaks."],
  ["modal and condition", "My boss would send me out to fix leaks if I had my license."],
  ["others' work", "My boss sends the plumbers out to install water heaters."],
  ["a class, not an act", "My boss sent me to a class on installing water heaters."],
  ["template", "A career coach told me to put 'installed water heaters' on my resume."],
  ["received, not directed", "Our associate sends me what she finds to put in the file."],
  ["me and others", "My boss sends me and two techs out to install water heaters."],
  ["let (permission)", "My boss lets me install water heaters on weekends."],
  ["a place", "My boss sends me to the site to supervise the plumbers who install water heaters."],
  ["a thing", "A friend sent me a link and I poked at the sample file."],
];

describe("rules-v22 is opt-in", () => {
  it("rules-v21 stays the default, and the rules and recognition versions are unchanged", () => {
    expect(DEFAULT_TEXT_RULES).toBe("v21");
    expect(RULES_VERSION).toBe("rules-v21");
    expect(RECOGNITION_VERSION).toBe("splits-v1.1");
    expect(isV21Family("v22")).toBe(true);
    expect(isV21Family("v21")).toBe(true);
    expect(isV21Family("v20")).toBe(false);
    expect(isV21Family(undefined)).toBe(false);
  });
  it('only the reader and its four direct users name "v22", and nothing in the app selects it', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(`${dir}/${f}`).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));
    const naming = walk("src").filter(f => /\.(?:ts|tsx)$/.test(f) && readFileSync(f, "utf8").includes('"v22"')).sort();
    expect(naming).toEqual([
      "src/lib/ai/evidence-boundary.ts",
      "src/lib/ai/rules/answer-review.ts",
      "src/lib/ai/rules/follow-up-reply.ts",
      "src/lib/ai/rules/split-recognition.ts",
      "src/lib/ai/rules/structured-consistency.ts",
    ]);
    for (const f of walk("src").filter(f => /\.(?:ts|tsx)$/.test(f))) expect(readFileSync(f, "utf8"), f).not.toMatch(/textRules\s*:\s*["']v22["']|TEXT_RULES\s*=\s*["']v22["']/);
  });
});

describe("rules-v21 is unchanged (the F0 baseline)", () => {
  it.each(OWN)("%s: no statement of the person's own, a mismatch, and the parts read as others' work", (_id, text) => {
    const r = read(text, "v21");
    expect(r.statements).toEqual([]);
    expect(r.verdict).toBe("insufficient_information");
    expect(r.consistency).toBe("mismatch");
    expect(r.parts.every(([shown]) => !shown)).toBe(true);
  });
});

describe("rules-v22: work the person was sent or put to do is their own", () => {
  it.each(OWN)("%s reads exactly as the person's own words", (_id, text, own, shown) => {
    const v22 = read(text, "v22");
    const asOwn = read(own, "v21");
    expect(v22.statements).toEqual([["self", "performed", false, expect.any(String)]]);
    expect(v22.verdict).toBe(asOwn.verdict);
    expect(v22.consistency).toBe("consistent");
    expect(v22.parts).toEqual(shown.map(s => [s, false]));
    expect(v22.parts).toEqual(asOwn.parts);
    expect(v22.others).toEqual([]);
  });
  it.each(OWN)("%s: every quote is the answer's own words, verbatim, at its own place", (_id, text) => {
    for (const s of answerStatements(text, "v22")) expect(text.slice(s.start, s.start + s.text.length)).toBe(s.text);
    const quote = readAnswer(req, text, { textRules: "v22" }).quote;
    if (quote) expect(text).toContain(quote);
  });
  it("the act is everything after the directing words, and nothing before it", () => {
    expect(directedAtPerson("My boss sends me out to install water heaters and fix leaks every day")).toEqual({ act: "install water heaters and fix leaks every day", index: 24 });
    expect(directedAtPerson("My supervisor has me install water heaters")?.act).toBe("install water heaters");
  });
});

describe("rules-v22 changes nothing else", () => {
  it.each(SAME)("%s: read exactly as rules-v21", (_why, text) => {
    expect(read(text, "v22")).toEqual(read(text, "v21"));
  });
  it.each(SAME)("%s: not directed at the person", (_why, text) => {
    expect(directedAtPerson(text.replace(/[.]$/, ""))).toBeNull();
  });
});

describe("rules-v22: the act keeps every rule a first-person statement has", () => {
  it.each([
    ["helping", "My boss sends me out to help the plumbers install water heaters.", "I help the plumbers install water heaters.", "assisted"],
    ["watching", "My boss sends me out to watch the plumbers install water heaters.", "I watch the plumbers install water heaters.", "observed"],
    ["other work for others", "My boss sends me to pick up parts for the plumbers who install water heaters.", "I pick up parts for the plumbers who install water heaters.", "performed"],
  ] as const)("%s: same reading as the person's own words", (_why, text, own, ownership) => {
    const v22 = read(text, "v22");
    const asOwn = read(own, "v21");
    expect(v22.statements.map(s => s[1])).toEqual([ownership]);
    expect(v22.verdict).toBe(asOwn.verdict);
    expect(v22.verdict).toBe("insufficient_information");
    expect(v22.consistency).toBe(asOwn.consistency);
    expect(v22.parts).toEqual(asOwn.parts);
    expect(v22.parts.every(([shown]) => !shown)).toBe(true);
  });
  it("a later sentence that gives the work away still counts", () => {
    const text = "My boss sends me out to install water heaters. Actually the plumbers do all the installs and repairs, I just carry tools.";
    expect(readAnswer(req, text, { textRules: "v22" }).verdict).not.toBe("supported");
  });
  it("a negated act is not the person's work", () => {
    expect(read("My boss sends me out but I don't install water heaters.", "v22")).toEqual(read("My boss sends me out but I don't install water heaters.", "v21"));
  });
});

describe("rules-v22: follow-up replies", () => {
  it("a reply that names dispatched work is read as the person's own, and v21 reads it as before", () => {
    const answer = "I work for a plumbing company and handle service calls.";
    const reply = "My boss sends me out to install water heaters and fix leaks every day.";
    expect(readFollowUpReply(req, answer, reply, answer, { textRules: "v21" }).outcome).toBe(readFollowUpReply(req, answer, reply, answer).outcome);
    const v22 = readFollowUpReply(req, answer, reply, answer, { textRules: "v22" });
    const own = readFollowUpReply(req, answer, "I install water heaters and fix leaks every day.", answer, { textRules: "v21" });
    expect(v22.outcome).toBe(own.outcome);
    expect(followUpKind(req, answer, answer, { textRules: "v22" })).toBe(followUpKind(req, answer, answer, { textRules: "v21" }));
  });
});
