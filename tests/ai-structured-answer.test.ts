import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Verdict } from "@/lib/ai/evidence";
import { explicitRecency, proposeCompoundSplit } from "@/lib/ai/requirement-structure";
import { compoundQuestionKey, keyForRequirement, partQuestionKey } from "@/lib/ai/rules/review-queue";
import {
  readStructuredAnswer, recencyAgainst, requirementAsks,
  type Consistency, type Involvement, type StructuredAnswer, type WorkFrequency, type WorkRecency,
} from "@/lib/ai/rules/structured-answer";

// Structured ownership, Stage 2: the rule table (design §4–5) with D1–D3 and O1–O3. Pure and structured-only: what the
// explanation shows is a supplied consistency state. Nothing here reads free text or touches a sealed split.

const INVOLVEMENTS: Involvement[] = ["PERFORMED", "PART", "SUPERVISED", "REQUESTED", "ASSISTED", "OBSERVED_TRAINED", "TAUGHT", "NOT_DONE"];
const FREQUENCIES: WorkFrequency[] = ["MOST_DAYS", "WEEKLY", "MONTHLY", "FEW_TIMES", "ONCE"];
const RECENCIES: WorkRecency[] = ["CURRENT", "WITHIN_YEAR", "ONE_TO_THREE_YEARS", "OVER_THREE_YEARS"];
const KINDS = {
  work: { text: "Installing residential wiring", category: "Skills" },
  supervision: { text: "Supervising a crew of installers", category: "Skills" },
  coordination: { text: "Scheduling subcontractors for job sites", category: "Skills" },
  assisting: { text: "Assisting the lead electrician", category: "Skills" },
  training: { text: "Training new hires on safety procedures", category: "Skills" },
  skillTool: { text: "Microsoft Excel", category: "Skills" },
  experience: { text: "Hands-on experience installing residential wiring", category: "Experience" },
  level: { text: "Advanced Microsoft Excel", category: "Skills" },
  time: { text: "3+ years installing residential wiring", category: "Skills" },
} as const;
type Kind = keyof typeof KINDS;
const CONSISTENCIES: Consistency[] = [
  { state: "consistent", textShowsWork: true },
  { state: "consistent", textShowsWork: false },
  ...[...INVOLVEMENTS, null].map(textSuggests => ({ state: "text_mismatch" as const, textSuggests })),
  { state: "text_unread" },
  { state: "no_text" },
];
const RANK: Record<Verdict, number> = { gap: 0, insufficient_information: 1, possible: 2, supported: 3 };
const min = (...v: Verdict[]) => v.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));

function answer(inv: Involvement, kind: Kind, consistency: Consistency, extra: Partial<StructuredAnswer> = {}): StructuredAnswer {
  const doing = inv === "PERFORMED" || inv === "PART";
  return {
    requirement: KINDS[kind], involvement: inv, alsoDidSome: ["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT"].includes(inv) ? false : null,
    frequency: doing ? "WEEKLY" : null, recency: doing ? "CURRENT" : null, claimedMonths: null, consistency, ...extra,
  };
}

/** The design's table, written independently of the implementation. */
function oracle(inv: Involvement, kind: Kind, freq: WorkFrequency | null, consistency: Consistency): Verdict {
  if (inv === "NOT_DONE") return "gap";
  const theWork = { SUPERVISED: kind === "supervision", REQUESTED: kind === "coordination", ASSISTED: kind === "assisting", TAUGHT: kind === "training" } as Record<string, boolean>;
  const reading = (choice: Involvement, shows: boolean): Verdict => {
    if (choice === "NOT_DONE") return "gap";
    if (choice === "PERFORMED" || theWork[choice]) return shows && (choice !== "PERFORMED" || ["MOST_DAYS", "WEEKLY", "MONTHLY"].includes(freq ?? "")) ? "supported" : "possible";
    if (choice === "PART" || choice === "TAUGHT" || choice === "ASSISTED") return "possible";
    if (choice === "SUPERVISED" || choice === "REQUESTED") return "insufficient_information";
    return ["experience", "level", "time"].includes(kind) ? "insufficient_information" : "possible"; // OBSERVED_TRAINED
  };
  let v = reading(inv, consistency.state === "consistent" && consistency.textShowsWork);
  if (consistency.state === "text_unread") v = min(v, "possible");
  if (consistency.state === "text_mismatch") v = min(v, consistency.textSuggests ? reading(consistency.textSuggests, false) : "insufficient_information", "possible");
  if (kind === "level" || kind === "time") v = min(v, "possible");
  return v;
}

describe("the requirement kinds used by the table read as intended", () => {
  it.each(Object.entries(KINDS))("%s", (kind, req) => {
    const a = requirementAsks(req);
    expect(a.supervision).toBe(kind === "supervision");
    expect(a.coordination).toBe(kind === "coordination");
    expect(a.assisting).toBe(kind === "assisting");
    expect(a.training).toBe(kind === "training");
    expect(a.level).toBe(kind === "level");
    expect(a.time).toBe(kind === "time");
    expect(explicitRecency(req.text).asks).toBe(false);
  });
});

describe("exhaustive rule table: every choice × requirement kind × frequency × recency × consistency state", () => {
  const cases: [Involvement, Kind, WorkFrequency | null, WorkRecency | null, Consistency][] = [];
  for (const inv of INVOLVEMENTS)
    for (const kind of Object.keys(KINDS) as Kind[])
      for (const freq of inv === "PERFORMED" || inv === "PART" ? FREQUENCIES : [null])
        for (const rec of inv === "PERFORMED" || inv === "PART" ? RECENCIES : [null])
          for (const c of CONSISTENCIES) cases.push([inv, kind, freq, rec, c]);

  it(`matches the design's table in all ${"cases"}`, () => {
    expect(cases.length).toBeGreaterThan(5000);
    const wrong = cases.filter(([inv, kind, freq, rec, c]) => readStructuredAnswer(answer(inv, kind, c, { frequency: freq, recency: rec })).verdict !== oracle(inv, kind, freq, c));
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("D1: never Supported without consistent text that shows the work (a choice alone is never enough)", () => {
    for (const [inv, kind, freq, rec, c] of cases) {
      const r = readStructuredAnswer(answer(inv, kind, c, { frequency: freq, recency: rec }));
      if (!(c.state === "consistent" && c.textShowsWork)) expect(r.verdict, `${inv} ${kind} ${c.state}`).not.toBe("supported");
    }
  });

  it("D1: a contradiction never raises a verdict, is never above Possible, and always asks", () => {
    for (const [inv, kind, freq, rec, c] of cases) {
      if (c.state !== "text_mismatch" || inv === "NOT_DONE") continue;
      const mismatch = readStructuredAnswer(answer(inv, kind, c, { frequency: freq, recency: rec }));
      const consistent = readStructuredAnswer(answer(inv, kind, { state: "consistent", textShowsWork: true }, { frequency: freq, recency: rec }));
      expect(RANK[mismatch.verdict]).toBeLessThanOrEqual(Math.min(RANK[consistent.verdict], RANK.possible));
      expect(mismatch.clarifications).toContain("text_mismatch");
    }
  });

  it("D3: unread (non-English) text is never Supported, counts exactly as no text, and says it wasn't read", () => {
    for (const [inv, kind, freq, rec] of cases) {
      const unread = readStructuredAnswer(answer(inv, kind, { state: "text_unread" }, { frequency: freq, recency: rec }));
      const none = readStructuredAnswer(answer(inv, kind, { state: "no_text" }, { frequency: freq, recency: rec }));
      expect(unread.verdict).toBe(none.verdict);
      expect(unread.verdict).not.toBe("supported");
      if (inv !== "NOT_DONE") expect(unread.caveats.join(" ")).toMatch(/wasn't read/);
    }
  });

  it("the rule table takes no free text at all: verdicts depend only on structured fields and the supplied state", () => {
    const source = readFileSync("src/lib/ai/rules/structured-answer.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // No field access to an answer's words and no text reader; the user-facing caveat may say "explanation".
    expect(source).not.toMatch(/\.explanation\b|\.detail\b|readAnswer|answer-review|clauses|interpret/);
  });
});

describe("D1 and the approved choices", () => {
  const consistent = { state: "consistent", textShowsWork: true } as const;
  it("'I did it myself' with a consistent role, frequency and recency but no text reaches Possible, and asks for specifics", () => {
    const r = readStructuredAnswer(answer("PERFORMED", "work", { state: "no_text" }));
    expect(r.verdict).toBe("possible");
    expect(r.clarifications).toEqual(["needs_specific_text"]);
  });
  it("only consistent specific text, done regularly, reaches Supported", () => {
    expect(readStructuredAnswer(answer("PERFORMED", "work", consistent)).verdict).toBe("supported");
    expect(readStructuredAnswer(answer("PERFORMED", "work", consistent, { frequency: "FEW_TIMES" })).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("PERFORMED", "work", consistent, { frequency: "ONCE" })).verdict).toBe("possible");
  });
  it("O1 teaching is not doing: Possible at most for the work, as the work when the requirement is about training", () => {
    expect(readStructuredAnswer(answer("TAUGHT", "work", consistent)).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("TAUGHT", "experience", consistent)).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("TAUGHT", "training", consistent)).verdict).toBe("supported");
  });
  it("supervision is not execution: nothing for the work itself, as the work when the requirement is about supervising", () => {
    expect(readStructuredAnswer(answer("SUPERVISED", "work", consistent)).verdict).toBe("insufficient_information");
    expect(readStructuredAnswer(answer("SUPERVISED", "supervision", consistent)).verdict).toBe("supported");
  });
  it("O2 arranging, ordering or paperwork is not performing the work, unless the requirement is about coordination or records", () => {
    expect(readStructuredAnswer(answer("REQUESTED", "work", consistent)).verdict).toBe("insufficient_information");
    expect(readStructuredAnswer(answer("REQUESTED", "experience", consistent)).verdict).toBe("insufficient_information");
    expect(readStructuredAnswer(answer("REQUESTED", "coordination", consistent)).verdict).toBe("supported");
  });
  it("helping is Possible at most; watching or training on it is Possible for a skill or tool, nothing for experience", () => {
    expect(readStructuredAnswer(answer("ASSISTED", "work", consistent)).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("OBSERVED_TRAINED", "skillTool", consistent)).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("OBSERVED_TRAINED", "experience", consistent)).verdict).toBe("insufficient_information");
  });
  it("'I haven't done this' is Does not meet", () => {
    expect(readStructuredAnswer(answer("NOT_DONE", "work", { state: "no_text" })).verdict).toBe("gap");
  });
  it("a level or time requirement is Possible at most from an answer, whatever it claims", () => {
    expect(readStructuredAnswer(answer("PERFORMED", "level", consistent)).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("PERFORMED", "time", consistent, { claimedMonths: 120 })).verdict).toBe("possible");
    expect(readStructuredAnswer(answer("PERFORMED", "level", consistent)).caveats.join(" ")).toMatch(/can't show the level/);
  });
});

describe("clarification reasons come from structured facts and the supplied state only", () => {
  it("a lead choice on a requirement for the work itself, with 'did you also do some?' unanswered, asks it", () => {
    const r = readStructuredAnswer(answer("SUPERVISED", "work", { state: "no_text" }, { alsoDidSome: null }));
    expect(r.clarifications).toContain("ask_also_did_some");
    expect(readStructuredAnswer(answer("SUPERVISED", "supervision", { state: "no_text" }, { alsoDidSome: null })).clarifications).not.toContain("ask_also_did_some");
  });
  it("'I did some of it' without an explanation asks which parts", () => {
    expect(readStructuredAnswer(answer("PART", "work", { state: "no_text" })).clarifications).toContain("which_parts");
  });
  it("a stated recency the role's dates can't allow gives no automatic credit and asks (structured contradiction)", () => {
    const ended = { months: 24, endedMonthsAgo: 30 };
    for (const recency of ["CURRENT", "WITHIN_YEAR"] as WorkRecency[]) {
      const r = readStructuredAnswer(answer("PERFORMED", "work", { state: "consistent", textShowsWork: true }, { recency, role: ended }));
      expect(r.verdict).toBe("insufficient_information");
      expect(r.clarifications).toEqual(["role_dates_conflict"]);
    }
    const fresh = readStructuredAnswer(answer("PERFORMED", "work", { state: "consistent", textShowsWork: true }, { recency: "OVER_THREE_YEARS", role: { months: 10, endedMonthsAgo: null } }));
    expect(fresh.clarifications).toEqual(["role_dates_conflict"]);
    const fits = readStructuredAnswer(answer("PERFORMED", "work", { state: "consistent", textShowsWork: true }, { recency: "ONE_TO_THREE_YEARS", role: ended }));
    expect(fits).toMatchObject({ verdict: "supported", clarifications: [] });
  });
  it("a contradiction never resolves itself by assumption: no suggested reading means Not enough information", () => {
    const r = readStructuredAnswer(answer("PERFORMED", "work", { state: "text_mismatch", textSuggests: null }));
    expect(r).toMatchObject({ verdict: "insufficient_information", clarifications: ["text_mismatch"] });
  });
});

describe("D2: recency is a note unless the requirement explicitly asks for recent experience", () => {
  const consistent = { state: "consistent", textShowsWork: true } as const;
  it("detects explicit windows, 'recent' and 'current' work; ignores unrelated uses", () => {
    expect(explicitRecency("Payroll experience within the last 2 years")).toMatchObject({ asks: true, windowMonths: 24 });
    expect(explicitRecency("Hands-on welding in the past 18 months")).toMatchObject({ asks: true, windowMonths: 18 });
    expect(explicitRecency("Phlebotomy within the past year")).toMatchObject({ asks: true, windowMonths: 12 });
    expect(explicitRecency("Recent hands-on experience with forklifts")).toMatchObject({ asks: true, windowMonths: null });
    expect(explicitRecency("Currently working as a CNA")).toMatchObject({ asks: true, current: true });
    for (const t of ["Recent graduates welcome", "Experience with recent versions of Excel", "Microsoft Excel", "3+ years of payroll"]) expect(explicitRecency(t).asks, t).toBe(false);
  });
  it("older than three years keeps its credit when the requirement doesn't ask, with a note", () => {
    const r = readStructuredAnswer(answer("PERFORMED", "work", consistent, { recency: "OVER_THREE_YEARS" }));
    expect(r.verdict).toBe("supported");
    expect(r.caveats).toContain("Last done more than 3 years ago.");
  });
  it("against an explicit window: inside is unaffected, outside is Possible at most, overlapping asks", () => {
    const within2 = (recency: WorkRecency) => readStructuredAnswer({ ...answer("PERFORMED", "work", consistent), requirement: { text: "Installing residential wiring within the last 2 years", category: "Skills" }, recency });
    expect(within2("WITHIN_YEAR")).toMatchObject({ verdict: "supported", clarifications: [] });
    expect(within2("OVER_THREE_YEARS")).toMatchObject({ verdict: "possible", clarifications: ["recency_outside_window"] });
    expect(within2("ONE_TO_THREE_YEARS")).toMatchObject({ verdict: "possible", clarifications: ["recency_unclear"] });
  });
  it("the window table", () => {
    const w = (n: number | null, current = false) => ({ asks: true, windowMonths: n, current, phrase: "" });
    expect(recencyAgainst("CURRENT", w(12))).toBe("met");
    expect(recencyAgainst("WITHIN_YEAR", w(12))).toBe("met");
    expect(recencyAgainst("ONE_TO_THREE_YEARS", w(12))).toBe("not_met");
    expect(recencyAgainst("ONE_TO_THREE_YEARS", w(36))).toBe("met");
    expect(recencyAgainst("OVER_THREE_YEARS", w(60))).toBe("unclear");
    expect(recencyAgainst("WITHIN_YEAR", w(0, true))).toBe("unclear");
    expect(recencyAgainst("ONE_TO_THREE_YEARS", w(null))).toBe("unclear");
    expect(recencyAgainst("OVER_THREE_YEARS", w(null))).toBe("not_met");
    expect(recencyAgainst(null, w(24))).toBe("unclear");
    expect(recencyAgainst("OVER_THREE_YEARS", { asks: false, windowMonths: null, current: false, phrase: null })).toBe("none");
  });
});

describe("O3: an approved compound split takes the lowest verdict over its necessary parts", () => {
  const base = { ...answer("PERFORMED", "work", { state: "consistent", textShowsWork: true }), requirement: { text: "Conduit bending and installation", category: "Skills" as const } };
  const parts = (checked: boolean[], shows = true) => ({ approved: true, parts: checked.map((c, i) => ({ part: `part ${i}`, checked: c, textShowsWork: shows })) });
  it("every part done, each with specific text: Supported", () => {
    expect(readStructuredAnswer({ ...base, compound: parts([true, true]) }).verdict).toBe("supported");
  });
  it("one part's text missing: the whole is Possible (the lowest part decides)", () => {
    const c = parts([true, true]);
    c.parts[1].textShowsWork = false;
    expect(readStructuredAnswer({ ...base, compound: c }).verdict).toBe("possible");
  });
  it("one necessary part not done: never credit for the whole; Possible at most and it names the gap", () => {
    expect(readStructuredAnswer({ ...base, compound: parts([true, false]) })).toMatchObject({ verdict: "possible", clarifications: ["missing_compound_parts"] });
    expect(readStructuredAnswer({ ...base, compound: parts([true, false, false]) }).verdict).toBe("possible");
  });
  it("no part done: Not enough information", () => {
    expect(readStructuredAnswer({ ...base, compound: parts([false, false]) }).verdict).toBe("insufficient_information");
  });
  it("an unapproved split is ignored entirely", () => {
    const unapproved = { approved: false, parts: [{ part: "a", checked: true }, { part: "b", checked: false }] };
    expect(readStructuredAnswer({ ...base, compound: unapproved })).toEqual(readStructuredAnswer(base));
  });
});

describe("the compound splitter proposes; it doesn't decide", () => {
  const split = (t: string) => proposeCompoundSplit(t);
  it("proposes the parts of genuinely compound tasks", () => {
    expect(split("Conduit bending and installation")).toMatchObject({ kind: "task_compound", parts: ["Conduit bending", "Conduit installation"] });
    expect(split("Installing and maintaining HVAC systems")).toMatchObject({ kind: "task_compound", parts: ["Installing HVAC systems", "maintaining HVAC systems"] });
    expect(split("3+ years of patient scheduling and insurance verification")).toMatchObject({ kind: "task_compound", parts: ["patient scheduling", "insurance verification"] });
  });
  it("keeps established single concepts whole", () => {
    for (const t of ["Accounts payable and receivable", "Strong written and verbal communication skills", "Health and safety", "Microsoft Excel"]) expect(split(t).kind, t).toBe("single");
  });
  it("leaves item lists to the existing piece-by-piece reading, and alternatives alone", () => {
    expect(split("Python and SQL").kind).toBe("item_list");
    expect(split("Excel or Google Sheets").kind).toBe("alternatives");
  });
  it("marks unclear cases ambiguous for the owner instead of guessing", () => {
    expect(split("Research and development").kind).toBe("ambiguous");
    expect(split("Load and unload trucks")).toMatchObject({ kind: "ambiguous", parts: ["Load trucks", "unload trucks"] });
    expect(split("Transmission removal and replacement").kind).toBe("ambiguous");
  });
  it("examples after 'including' belong to one task", () => {
    expect(split("Perform routine vehicle maintenance including oil changes and tire rotations").kind).toBe("single");
  });
  it("a task word followed by its own task phrase keeps both as written", () => {
    expect(split("Pruning and tree felling")).toMatchObject({ kind: "task_compound", parts: ["Pruning", "tree felling"] });
  });
  it("a credential or a length of time mixed with a task goes to the owner", () => {
    expect(split("Forklift certification and 1+ year operating material handling equipment").kind).toBe("ambiguous");
  });
  it("keeps every proposal tied to its original requirement", () => {
    const p = split("Conduit bending and installation");
    expect(p.requirement).toBe("Conduit bending and installation");
  });
});

describe("compound question keys (not connected to the queue)", () => {
  it("a part shares its key with a single-task requirement for the same work", () => {
    expect(partQuestionKey("Conduit bending")).toBe(keyForRequirement({ index: 0, text: "Conduit bending", category: "Skills", priority: "Required" }));
  });
  it("the compound key never equals any part's key, and doesn't depend on part order", () => {
    const k = compoundQuestionKey(["Conduit bending", "Conduit installation"]);
    expect(k).not.toBe(partQuestionKey("Conduit bending"));
    expect(k).not.toBe(partQuestionKey("Conduit installation"));
    expect(k).toBe(compoundQuestionKey(["Conduit installation", "Conduit bending"]));
  });
});

describe("Stage 2 is isolated from matching and the review workflow", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== "generated") walk(p, out); } else if (/\.(ts|tsx)$/.test(n)) out.push(p.split("\\").join("/"));
    }
    return out;
  };
  it("no application code uses the rule table, the splitter, recency detection or the compound keys", () => {
    const users = walk("src").filter(f => f !== "src/lib/ai/rules/structured-answer.ts" && /structured-answer|proposeCompoundSplit|explicitRecency|compoundQuestionKey|partQuestionKey/.test(readFileSync(f, "utf8")));
    // structured-consistency.ts (Stage 3) uses the rule table's types; it is itself unused by the app (tests/ai-rules-v20.test.ts).
    expect(users.filter(f => !["src/lib/ai/requirement-structure.ts", "src/lib/ai/rules/review-queue.ts", "src/lib/ai/rules/structured-consistency.ts"].includes(f))).toEqual([]);
  });
});
