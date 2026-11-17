import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Evidence, MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { DEFAULT_TEXT_RULES, isV21Family, type TextRules } from "@/lib/ai/evidence-boundary";
import { validateMatchResponse } from "@/lib/ai/match-validation";
import { applyAnswers, readAnswer, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { RULES_VERSION, rulesResponse } from "@/lib/ai/rules/engine";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";
import { withdrawnClaims } from "@/lib/ai/withdrawals";
import { candidateFor, type R4Scenario } from "./eval/parts-score";

// Post-Stage G Gate A, continued: the opt-in free-text reader "v21a" (rules-v21 plus explicit withdrawals). SYNTHETIC text
// only; nothing from the sealed R4 split. Both answer paths end to end:
//   free text: the rules engine + `applyAnswers` with the reader version, then the validator (as matching does);
//   structured: structured matching v2 ("did it myself", weekly, current), via the scorer's pure `candidateFor`.

const ROLE: Evidence = { id: "experience:00000000-0000-4000-8000-0000000000a1", kind: "experience", job_title: "Associate", start_month: "2023-11", end_month: null, description: null };
const ANSWER_ID = "experience:00000000-0000-4000-8000-0000000000a2";
const req = (text: string): MatchRequirement => ({ index: 0, text, category: "Skills", priority: "Required" });

type Level = "credit_supported" | "credit_possible" | "no_credit";
const level = (v: string): Level => (v === "supported" ? "credit_supported" : v === "possible" ? "credit_possible" : "no_credit");

/** The free-text path end to end, with a chosen reader version. */
function freeText(requirement: string, detail: string, textRules: TextRules): string {
  const r = req(requirement);
  const evidence: Evidence[] = [ROLE, { ...ROLE, id: ANSWER_ID, description: detail, source: "clarification" } as Evidence];
  const linked: LinkedAnswer[] = [{ action: "confirm", questionKey: keyForRequirement(r), evidenceId: ANSWER_ID, detail }];
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [r], evidence, linked_answers: linked };
  const body = rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => applyAnswers(request, f, linked, keyForRequirement, { textRules }));
  return validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider: "rules", model: null }).findings[0].verdict;
}
let n = 0;
function structured(requirement: string, detail: string, language = "en"): string {
  const s: R4Scenario = {
    id: `v21a-${++n}`, category: "synthetic", split_id: null, language, requirement: { text: requirement, category: "Skills" }, role: { title: "Associate", months: 36, description: null },
    answer: { involvement: "PERFORMED", also_did_some: null, frequency: "WEEKLY", recency: "CURRENT", claimed_months: null, parts: null, explanation: detail },
    reply: null, writer_intended: { verdict: "possible", parts_done: null, note: "" },
  };
  const v = candidateFor(s, "2026-11").verdict;
  return v === "not_enough" ? "insufficient_information" : v === "not_supported" ? "gap" : v;
}

const FORKLIFT = "Forklift operation";
const PACKING = "Order packing";
const PAYROLL = "Payroll processing";
const WELDING = "Welding";

// Explicit withdrawals: under v21a, free text gives no credit, exactly as structured matching v2.
const WITHDRAWN: [string, string, string][] = [
  ["to someone else (cleft)", FORKLIFT, "I operated the forklift every day. Actually, that was my partner; I only did the paperwork."],
  ["to someone else, after 'but'", FORKLIFT, "I used to operate the forklift, but to be honest it was my brother who drove it."],
  ["'my brother did that'", FORKLIFT, "I operated the forklift on nights. But to be honest, my brother did that."],
  ["named person", FORKLIFT, "I operate the forklift. Actually, it was Sam who did that."],
  ["'not me'", FORKLIFT, "I ran the forklift on nights. In fact, that was my lead, not me."],
  ["payroll to a bookkeeper", PAYROLL, "I process payroll each month. Actually, that was our bookkeeper."],
  ["payroll, after 'but honestly'", PAYROLL, "I handled payroll, but honestly it was my manager who processed it."],
  ["welding, correction", WELDING, "I weld the frames. Correction: that is the senior welder."],
  ["correction to a denial", PAYROLL, "I process payroll. Actually, I never processed payroll."],
  ["later own denial", FORKLIFT, "I operate the forklift. I have never operated a forklift myself."],
  ["later own denial (welding)", WELDING, "I weld daily. I have never welded."],
  ["multiple activities, the corrected one asked", FORKLIFT, "I operate the forklift and pack orders. Actually, my partner drove the forklift."],
];

// Legitimate experience: v21a reads exactly as rules-v21 on free text, and both paths keep the credit.
const KEPT: [string, string, string, Level | "*"][] = [
  ["multiple activities, the other one asked", PACKING, "I operate the forklift and pack orders. Actually, my partner drove the forklift.", "*"],
  ["historical, then changed responsibilities", FORKLIFT, "I drove the forklift for six years. These days my coworker drives it and I run inventory.", "*"],
  ["historical, 'but now'", FORKLIFT, "I operated the forklift daily for years, but now I manage the warehouse.", "*"],
  ["correction over time", FORKLIFT, "I drove the forklift for years. Actually, now my coworker drives it.", "*"],
  ["collaboration", FORKLIFT, "My team and I unload trucks, and I drive the forklift myself.", "*"],
  ["shared duty", FORKLIFT, "My coworker and I share forklift duty, and I drive it every morning.", "*"],
  ["own work beside a coworker", FORKLIFT, "I operate the forklift every day and my supervisor checks the loads.", "*"],
  ["unrelated own task beside the activity", FORKLIFT, "I operate the forklift every day. I also pack orders when it's slow.", "*"],
  ["narrowing correction", FORKLIFT, "I drive the forklift. Actually, I only drive it on weekends.", "*"],
  ["adding correction", FORKLIFT, "I operate the forklift daily. Actually, I also train new drivers on it.", "*"],
  ["narrowing the reader already handles", FORKLIFT, "I drive and service the forklift. Actually, the mechanic does the servicing, I only drive it.", "*"],
  ["negation first, then own work", FORKLIFT, "I never drove a forklift before this job, but now I operate one every day.", "*"],
  ["negation of something else", FORKLIFT, "I drive the forklift every shift. I never drove a reach truck.", "*"],
  ["'actually' as emphasis", FORKLIFT, "Actually, I operate the forklift every day on the night shift.", "*"],
];

describe("v21a is opt-in: rules-v21 and the production default are unchanged", () => {
  it("the default stays rules-v21; v21a is one more selectable version in the v21 family", () => {
    expect(DEFAULT_TEXT_RULES).toBe("v21");
    expect(RULES_VERSION).toBe("rules-v21");
    expect(isV21Family("v21a")).toBe(true);
  });
  it("nothing in the application selects v21a: only the reader library and the guarded local test switch name it", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(`${dir}/${f}`).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));
    const naming = walk("src").filter(f => /\.(?:ts|tsx)$/.test(f) && readFileSync(f, "utf8").includes('"v21a"')).sort();
    // test-reader.ts: the guarded local browser-test switch (refused on Vercel and unless the database is local).
    expect(naming).toEqual(["src/lib/ai/evidence-boundary.ts", "src/lib/ai/rules/answer-review.ts", "src/lib/ai/test-reader.ts"]);
    for (const f of walk("src").filter(f => /\.(?:ts|tsx)$/.test(f))) expect(readFileSync(f, "utf8"), f).not.toMatch(/textRules\s*:\s*["']v21a["']|TEXT_RULES\s*=\s*["']v21a["']/);
  });
  it("under rules-v21 the free-text bypass is still there (unchanged): that's what v21a closes once adopted", () => {
    expect(freeText(FORKLIFT, WITHDRAWN[0][2], "v21")).toBe("supported");
    expect(freeText(FORKLIFT, WITHDRAWN[1][2], "v21")).toBe("supported");
  });
});

describe("explicit withdrawals: free text under v21a and structured matching v2 agree (no credit)", () => {
  it("has the categories", () => expect(WITHDRAWN.length).toBeGreaterThanOrEqual(12));
  it.each(WITHDRAWN)("%s", (_name, requirement, text) => {
    const free = freeText(requirement, text, "v21a");
    const struct = structured(requirement, text);
    expect(level(free), `free ${free}`).toBe("no_credit");
    expect(level(struct), `structured ${struct}`).toBe("no_credit");
  });
  it("a withdrawal that leaves own work on the activity is Possible at most on both paths", () => {
    const text = "I operate the forklift every day. Actually, that was my partner. I still operate the forklift on weekends myself.";
    expect(level(freeText(FORKLIFT, text, "v21a"))).not.toBe("credit_supported");
    expect(level(structured(FORKLIFT, text))).not.toBe("credit_supported");
    expect(level(freeText(FORKLIFT, text, "v21a"))).toBe(level(structured(FORKLIFT, text)));
  });
});

describe("legitimate experience is kept, and both paths agree", () => {
  it("has at least 14", () => expect(KEPT.length).toBeGreaterThanOrEqual(14));
  it.each(KEPT)("%s", (_name, requirement, text, want) => {
    const v21 = freeText(requirement, text, "v21");
    const v21a = freeText(requirement, text, "v21a");
    expect(v21a, "v21a reads it as v21 does").toBe(v21);
    if (want !== "*") expect(level(v21a)).toBe(want);
    // Structured matching gives the choice's own Possible where the words show less; it never contradicts what free text keeps.
    const struct = structured(requirement, text);
    if (level(v21a) !== "no_credit") expect(level(struct), `structured ${struct}`).not.toBe("no_credit");
  });
  it("the activity-specific withdrawal: only the corrected activity goes", () => {
    const text = "I operate the forklift and pack orders. Actually, my partner drove the forklift.";
    const [w] = withdrawnClaims(text);
    expect(text.slice(w.claim[0], w.claim[1]).trim()).toBe("I operate the forklift");
    expect(level(freeText(PACKING, text, "v21a"))).toBe(level(freeText(PACKING, text, "v21")));
    expect(level(freeText(FORKLIFT, text, "v21a"))).toBe("no_credit");
  });
});

describe("D3: non-English text is never read, under v21a as under v21", () => {
  it("the same reading on both versions, and structured matching keeps it unread (Possible from the choice)", () => {
    const text = "Manejo el montacargas todos los días. En realidad, era mi compañero.";
    expect(readAnswer(req(FORKLIFT), text, { textRules: "v21a" })).toEqual(readAnswer(req(FORKLIFT), text, { textRules: "v21" }));
    expect(readAnswer(req(FORKLIFT), text, { textRules: "v21a" }).reason).toBe("language_not_evaluated");
    expect(structured(FORKLIFT, text, "es")).toBe("possible");
  });
});
