import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { DEFAULT_TEXT_RULES, type TextRules } from "@/lib/ai/evidence-boundary";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import { approvedSplitFor } from "@/lib/ai/rules/approved-split-link";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { APPROVED_SPLITS, RECOGNITION_VERSION, recognizeParts } from "@/lib/ai/rules/split-recognition";
import { readStructuredAnswer, type Consistency, type Involvement, type WorkFrequency, type WorkRecency } from "@/lib/ai/rules/structured-answer";
import { assessConsistency } from "@/lib/ai/rules/structured-consistency";
import { matchStructuredAnswer, STRUCTURED_MATCHING_VERSION, type PartReadings, type StructuredAnswerRecord, type StructuredMatch, type StructuredMatchInput, type TextReadings } from "@/lib/ai/rules/structured-matching";

// Phase 5.3 Stage F2: the pure structured-matching module. Not connected to the app (last describe block).
const RANK: Record<Verdict, number> = { gap: 0, insufficient_information: 1, possible: 2, supported: 3 };
const VERDICTS: Verdict[] = ["gap", "insufficient_information", "possible", "supported"];
const INVOLVEMENTS: Involvement[] = ["PERFORMED", "PART", "SUPERVISED", "REQUESTED", "ASSISTED", "OBSERVED_TRAINED", "TAUGHT", "NOT_DONE"];
const FREQUENCIES: WorkFrequency[] = ["MOST_DAYS", "WEEKLY", "MONTHLY", "FEW_TIMES", "ONCE"];
const RECENCIES: WorkRecency[] = ["CURRENT", "WITHIN_YEAR", "ONE_TO_THREE_YEARS", "OVER_THREE_YEARS"];
const ID = "00000000-0000-4000-8000-0000000000a1";
const ROLE = { months: 60, endedMonthsAgo: null };
const req = (text: string, category: MatchRequirement["category"] = "Skills"): MatchRequirement => ({ index: 0, text, category, priority: "Required" });
const keyOf = (r: MatchRequirement) => questionKey(r.text, "work_detail");

/** A stored structured answer for `requirement`, valid by default. */
function record(requirement: MatchRequirement, involvement: Involvement, extra: Partial<StructuredAnswerRecord> = {}): StructuredAnswerRecord {
  const doing = involvement === "PERFORMED" || involvement === "PART";
  const denial = involvement === "NOT_DONE";
  const split = approvedSplitFor(requirement.text);
  return {
    id: ID, status: "ACTIVE", formVersion: 2, outcome: denial ? "DENIED" : "ROLE_DETAIL_ADDED", involvement,
    alsoDidSome: null, frequency: doing ? "WEEKLY" : null, recency: doing ? "CURRENT" : null, claimedMonths: null,
    experienceId: denial ? null : "00000000-0000-4000-8000-0000000000e1", detail: null, evidenceId: denial ? null : `experience:${ID}`,
    questionKey: keyOf(requirement), coveredKeys: [keyOf(requirement)],
    parts: doing && split ? split.parts.map((partText, partIndex) => ({ partIndex, partText, checked: true })) : [],
    ...extra,
  };
}
/** What the app would supply: the real readers, with one reader version, over the answer's own description. */
function realReadings(requirement: MatchRequirement, a: StructuredAnswerRecord, rules: TextRules = DEFAULT_TEXT_RULES): { text: TextReadings | null; parts: PartReadings | null } {
  const detail = a.detail?.trim() ?? "";
  if (!detail) return { text: null, parts: null };
  const reading = readAnswer(requirement, detail, { textRules: rules });
  const text: TextReadings = { readerVersion: rules, forText: detail, consistency: assessConsistency({ requirement, involvement: a.involvement as Involvement, explanation: detail, textRules: rules }).consistency, requirementReading: { verdict: reading.verdict, quote: reading.quote } };
  const split = approvedSplitFor(requirement.text);
  if (!split) return { text, parts: null };
  const r = recognizeParts({ splitId: split.splitId, explanation: detail, textRules: rules });
  return { text, parts: { recognitionVersion: r.version, readerVersion: rules, forText: detail, splitId: r.splitId, read: r.read, parts: r.parts, transferAll: r.transferAll } };
}
function input(requirement: MatchRequirement, a: StructuredAnswerRecord, extra: Partial<StructuredMatchInput> = {}): StructuredMatchInput {
  return { requirement, questionKey: keyOf(requirement), finding: { verdict: "insufficient_information", basis: "no_evidence" }, answer: a, role: ROLE, freeTextCounts: false, ...realReadings(requirement, a), ...extra };
}
const deepFreeze = <T>(o: T): T => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

// ---------------------------------------------------------------------------------------------------------------------
describe("fidelity: the owner-reviewed V5 simulation (284 parity rows), read through the module", () => {
  type Row = { cid: string; kind: string; text: string; expected: { parts: boolean[]; transferAll: boolean; verdict: Verdict; consistency: string } };
  const rows = (JSON.parse(readFileSync("tests/fixtures/split_recognition/parity.json", "utf8")) as { rows: Row[] }).rows;
  it.each(rows.map((r, i) => [i, r.cid, r.kind, r] as const))("row %i (%s, %s): the reading is the simulation's verdict", (_i, cid, _kind, row) => {
    const requirement = req(APPROVED_SPLITS[cid].requirement);
    const a = record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: row.text });
    const m = matchStructuredAnswer(input(requirement, a));
    expect(m.ignored).toBeNull();
    expect(m.split!.parts.map(p => p.shown)).toEqual(row.expected.parts);
    expect(m.reading!.verdict).toBe(row.expected.verdict);
    // Applied to Not enough information: the reading, with the person's own words quoted for Supported.
    expect(m.verdict).toBe(row.expected.verdict === "supported" ? "supported" : row.expected.verdict === "possible" ? "possible" : "insufficient_information");
    if (m.verdict === "supported") expect(row.text).toContain(m.citation!.quote!);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("the decision table, exhaustively (every choice × frequency × recency × explanation × requirement × prior finding)", () => {
  // Whole (unsplit) requirements of each kind the rule table distinguishes.
  const KINDS: Record<string, MatchRequirement> = {
    work: req("Repairing commercial HVAC systems"),
    supervision: req("Supervising a crew of installers"),
    coordination: req("Scheduling subcontractors for job sites"),
    assisting: req("Assisting the lead electrician"),
    training: req("Training new hires on safety procedures"),
    skillTool: req("Microsoft Excel"),
    experience: req("Hands-on experience repairing commercial HVAC systems", "Experience"),
    level: req("Advanced Microsoft Excel"),
    time: req("3+ years repairing commercial HVAC systems"),
    recent: req("Repairing commercial HVAC systems within the last 2 years"),
  };
  it("none of these is an approved split (splits have their own tests)", () => {
    for (const r of Object.values(KINDS)) expect(approvedSplitFor(r.text), r.text).toBeNull();
  });
  const DESCRIPTION = "I repair rooftop units myself every week.";
  // [label, description?, consistency supplied, requirement reading]
  const EXPLANATIONS: [string, string | null, Consistency | null, { verdict: Verdict; quote: string | null } | null][] = [
    ["no description", null, null, null],
    ["consistent, the reading shows the work", DESCRIPTION, { state: "consistent", textShowsWork: true }, { verdict: "supported", quote: "repair rooftop units myself every week" }],
    ["consistent, reading Possible", DESCRIPTION, { state: "consistent", textShowsWork: true }, { verdict: "possible", quote: "repair rooftop units myself every week" }],
    ["consistent, reading shows nothing (the consistency gap)", DESCRIPTION, { state: "consistent", textShowsWork: true }, { verdict: "insufficient_information", quote: null }],
    ["consistent, says it doesn't show", DESCRIPTION, { state: "consistent", textShowsWork: false }, { verdict: "insufficient_information", quote: null }],
    ["consistent, a quote that isn't verbatim", DESCRIPTION, { state: "consistent", textShowsWork: true }, { verdict: "supported", quote: "I repair chillers" }],
    ...[...INVOLVEMENTS, null].map((s): [string, string, Consistency, { verdict: Verdict; quote: string | null }] => [`mismatch → ${s}`, DESCRIPTION, { state: "text_mismatch", textSuggests: s }, { verdict: "insufficient_information", quote: null }]),
    ["mismatch, someone else did it (F6)", DESCRIPTION, { state: "text_mismatch", textSuggests: null, contradictedBy: "other_person" }, { verdict: "insufficient_information", quote: null }],
    ["mismatch, own denial (F6)", DESCRIPTION, { state: "text_mismatch", textSuggests: null, contradictedBy: "own_denial" }, { verdict: "insufficient_information", quote: null }],
    ["not English (D3)", "Reparo equipos de aire acondicionado.", { state: "text_unread" }, { verdict: "insufficient_information", quote: null }],
  ];
  const variants = (inv: Involvement): Partial<StructuredAnswerRecord>[] => {
    if (inv === "PERFORMED") return FREQUENCIES.flatMap(frequency => RECENCIES.map(recency => ({ frequency, recency })));
    if (inv === "PART") return [null, true].flatMap(alsoDidSome => FREQUENCIES.flatMap(frequency => RECENCIES.map(recency => ({ alsoDidSome, frequency, recency }))));
    if (inv === "NOT_DONE" || inv === "OBSERVED_TRAINED") return [{}];
    return [{ alsoDidSome: null }, { alsoDidSome: false }];
  };
  const FINDINGS: { verdict: Verdict; basis: string }[] = [
    { verdict: "gap", basis: "stated_absent" }, { verdict: "gap", basis: "employment_dates" }, { verdict: "insufficient_information", basis: "no_evidence" },
    { verdict: "possible", basis: "listed_skill" }, { verdict: "supported", basis: "listed_skill" },
  ];
  const cases: { label: string; m: StructuredMatch; expectedReading: Verdict; before: Verdict; inv: Involvement; description: string | null; requirement: MatchRequirement }[] = [];
  for (const [kindName, requirement] of Object.entries(KINDS)) for (const inv of INVOLVEMENTS) for (const v of variants(inv)) for (const [expl, description, consistency, reading] of inv === "NOT_DONE" ? [EXPLANATIONS[0]] : EXPLANATIONS) for (const finding of FINDINGS) {
    const a = record(requirement, inv, { ...v, detail: description });
    const text: TextReadings | null = description ? { readerVersion: DEFAULT_TEXT_RULES, forText: description, consistency: consistency!, requirementReading: reading! } : null;
    const m = matchStructuredAnswer({ requirement, questionKey: keyOf(requirement), finding, answer: a, role: ROLE, freeTextCounts: false, text, parts: null });
    // The rule table, called directly, with "the text shows the work" decided from the requirement reading only.
    const shows = !!description && consistency?.state === "consistent" && reading?.verdict === "supported" && !!reading.quote && description.includes(reading.quote);
    const tableConsistency: Consistency = !description ? { state: "no_text" } : consistency!.state === "consistent" ? { state: "consistent", textShowsWork: shows } : consistency!;
    const expectedReading = readStructuredAnswer({ requirement, involvement: inv, alsoDidSome: a.alsoDidSome, frequency: a.frequency as WorkFrequency | null, recency: a.recency as WorkRecency | null, claimedMonths: null, consistency: tableConsistency, role: ROLE }).verdict;
    cases.push({ label: `${kindName} ${inv} ${JSON.stringify(v)} ${expl} prior=${finding.verdict}/${finding.basis}`, m, expectedReading, before: finding.verdict, inv, description, requirement });
  }

  it("covers every combination", () => {
    // 10 requirement kinds × 5 prior findings × (60 PERFORMED and PART variants + 9 other-choice variants) × 18 explanations, plus NOT_DONE.
    expect(cases.length).toBe(62_150);
    expect(cases.every(c => c.m.ignored === null)).toBe(true);
  });
  it("the reading is exactly the approved rule table's", () => {
    const wrong = cases.filter(c => c.m.reading!.verdict !== c.expectedReading).map(c => c.label);
    expect(wrong).toEqual([]);
  });
  it("Supported only from the rule table's Supported, with the person's own words quoted verbatim", () => {
    const bad = cases.filter(c => c.m.verdict === "supported" && c.before !== "supported" && !(c.expectedReading === "supported" && c.m.basis === "candidate_answer" && !!c.description && c.description.includes(c.m.citation!.quote!)));
    expect(bad.map(c => c.label)).toEqual([]);
  });
  it("a choice alone (no description, or no usable quote) is Possible at most", () => {
    expect(cases.filter(c => !c.description && c.before !== "supported" && RANK[c.m.verdict] > RANK.possible).map(c => c.label)).toEqual([]);
    expect(cases.filter(c => c.m.basis === "candidate_choice" && RANK[c.m.verdict] > RANK.possible).map(c => c.label)).toEqual([]);
  });
  it("the consistency gap: a consistent explanation whose reading doesn't show the work never gives Supported", () => {
    const gap = cases.filter(c => /consistency gap|says it doesn't show|isn't verbatim|reading Possible/.test(c.label) && c.before !== "supported");
    expect(gap.length).toBeGreaterThan(0);
    expect(gap.filter(c => c.m.verdict === "supported").map(c => c.label)).toEqual([]);
  });
  it("Supported is never lowered; nothing is lowered except a denial", () => {
    expect(cases.filter(c => c.before === "supported" && c.m.verdict !== "supported").map(c => c.label)).toEqual([]);
    expect(cases.filter(c => c.inv !== "NOT_DONE" && RANK[c.m.verdict] < RANK[c.before]).map(c => c.label)).toEqual([]);
  });
  it("Possible raises only Not enough information; Not enough information changes nothing", () => {
    expect(cases.filter(c => c.inv !== "NOT_DONE" && c.before === "possible" && c.m.verdict !== "possible" && c.m.verdict !== "supported").map(c => c.label)).toEqual([]);
    expect(cases.filter(c => c.inv !== "NOT_DONE" && c.expectedReading === "insufficient_information" && c.before !== "gap" && c.m.changed).map(c => c.label)).toEqual([]);
    expect(cases.filter(c => c.inv !== "NOT_DONE" && c.expectedReading === "possible" && c.before === "possible" && c.m.changed).map(c => c.label)).toEqual([]);
  });
  it("a gap stays a gap (claimed months are tested separately; none here)", () => {
    expect(cases.filter(c => c.inv !== "NOT_DONE" && c.before === "gap" && c.m.verdict !== "gap").map(c => c.label)).toEqual([]);
  });
  it("lead choices keep their ceilings when the requirement isn't that kind of work", () => {
    const ceiling: Partial<Record<Involvement, Verdict>> = { SUPERVISED: "insufficient_information", REQUESTED: "insufficient_information", ASSISTED: "possible", TAUGHT: "possible", PART: "possible", OBSERVED_TRAINED: "possible" };
    const theWork: Partial<Record<Involvement, string>> = { SUPERVISED: "supervision", REQUESTED: "coordination", ASSISTED: "assisting", TAUGHT: "training" };
    // What the answer raises a finding to (a finding already higher before the answer is left as it was).
    const over = cases.filter(c => ceiling[c.inv] && c.m.changed && c.requirement !== KINDS[theWork[c.inv] ?? ""] && RANK[c.m.verdict] > RANK[ceiling[c.inv]!]);
    expect(over.map(c => c.label)).toEqual([]);
    // ... and OBSERVED_TRAINED gives nothing where the requirement asks for experience, a level or time.
    expect(cases.filter(c => c.inv === "OBSERVED_TRAINED" && [KINDS.experience, KINDS.level, KINDS.time].includes(c.requirement) && c.m.changed).map(c => c.label)).toEqual([]);
  });
  it("frequency, level, time and recency limits hold: never Supported past them", () => {
    expect(cases.filter(c => c.inv === "PERFORMED" && /"frequency":"(?:FEW_TIMES|ONCE)"/.test(c.label) && c.before !== "supported" && c.m.verdict === "supported").map(c => c.label)).toEqual([]);
    expect(cases.filter(c => [KINDS.level, KINDS.time].includes(c.requirement) && c.before !== "supported" && c.m.verdict === "supported").map(c => c.label)).toEqual([]);
    expect(cases.filter(c => c.requirement === KINDS.recent && /"recency":"(?:ONE_TO_THREE_YEARS|OVER_THREE_YEARS)"/.test(c.label) && c.before !== "supported" && c.m.verdict === "supported").map(c => c.label)).toEqual([]);
  });
  it("contradictions (F6) and unread text give no Supported", () => {
    expect(cases.filter(c => /F6|not English|mismatch/.test(c.label) && c.before !== "supported" && c.m.verdict === "supported").map(c => c.label)).toEqual([]);
    expect(cases.filter(c => /F6/.test(c.label) && c.before === "insufficient_information" && c.m.changed).map(c => c.label)).toEqual([]);
  });
  it("a denial: a non-Supported, non-gap finding becomes Not supported; Supported and gaps stand", () => {
    for (const c of cases.filter(c => c.inv === "NOT_DONE")) {
      const want = c.before === "supported" || c.before === "gap" ? c.before : "gap";
      expect(c.m.verdict, c.label).toBe(want);
      expect(c.m.basis, c.label).toBe(c.before === "supported" || c.before === "gap" ? null : "candidate_denied");
    }
  });
  it("a role whose dates contradict the stated recency gives nothing", () => {
    const requirement = KINDS.work;
    const a = record(requirement, "PERFORMED", { recency: "CURRENT", frequency: "MOST_DAYS", detail: DESCRIPTION });
    const m = matchStructuredAnswer({ ...input(requirement, a), role: { months: 24, endedMonthsAgo: 30 }, text: { readerVersion: DEFAULT_TEXT_RULES, forText: DESCRIPTION, consistency: { state: "consistent", textShowsWork: true }, requirementReading: { verdict: "supported", quote: "repair rooftop units myself every week" } } });
    expect(m.reading!.limits).toContain("role_dates_conflict");
    expect(m).toMatchObject({ changed: false, verdict: "insufficient_information" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("the consistency gap (F0): consistency alone never establishes the work", () => {
  it('"did it myself" + picking up parts, on the approved plumbing split: never Supported', () => {
    const requirement = req("Install and repair residential plumbing");
    const a = record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: "I pick up parts for the plumbers who install water heaters." });
    const i = input(requirement, a);
    expect(i.text!.consistency).toEqual({ state: "consistent", textShowsWork: false });
    const m = matchStructuredAnswer(i);
    expect(m.split!.parts.map(p => p.shown)).toEqual([false, false]);
    expect(m.verdict).toBe("possible");
    expect(m.reading!.limits).toContain("no_specific_text");
  });
  it("the same on a whole requirement: consistent, but the reading of this requirement shows nothing", () => {
    const requirement = req("Installing water heaters in residential homes");
    expect(approvedSplitFor(requirement.text)).toBeNull();
    const a = record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: "I pick up parts for the plumbers who install water heaters." });
    const m = matchStructuredAnswer(input(requirement, a));
    expect(m.verdict).not.toBe("supported");
  });
  it("a supplied textShowsWork: true is ignored: the requirement reading decides", () => {
    const requirement = req("Repairing commercial HVAC systems");
    const description = "I pick up parts for the HVAC techs.";
    const a = record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: description });
    const m = matchStructuredAnswer({ ...input(requirement, a), text: { readerVersion: DEFAULT_TEXT_RULES, forText: description, consistency: { state: "consistent", textShowsWork: true }, requirementReading: { verdict: "insufficient_information", quote: null } } });
    expect(m.verdict).toBe("possible");
    expect(m.reading!.limits).toContain("no_specific_text");
  });
  it("on a split, a supplied textShowsWork: true is ignored: recognition decides, part by part", () => {
    const requirement = req("Install and repair residential plumbing");
    const description = "I pick up parts for the plumbers.";
    const a = record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: description });
    const m = matchStructuredAnswer({ ...input(requirement, a), text: { readerVersion: DEFAULT_TEXT_RULES, forText: description, consistency: { state: "consistent", textShowsWork: true }, requirementReading: { verdict: "supported", quote: "pick up parts for the plumbers" } },
      parts: { recognitionVersion: RECOGNITION_VERSION, readerVersion: DEFAULT_TEXT_RULES, forText: description, splitId: "A58", read: true, transferAll: false, parts: APPROVED_SPLITS.A58.parts.map(part => ({ part, shown: false, transferred: false })) } });
    expect(m.verdict).toBe("possible");
  });
  it("the person's real work still gets Supported (control)", () => {
    const requirement = req("Install and repair residential plumbing");
    const a = record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: "I install water heaters and repair leaking pipes in homes myself every day." });
    const m = matchStructuredAnswer(input(requirement, a));
    expect(m.split!.parts.map(p => p.shown)).toEqual([true, true]);
    expect(m).toMatchObject({ verdict: "supported", basis: "candidate_answer", citation: { evidenceId: `experience:${ID}` } });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("all 33 approved splits", () => {
  const ids = Object.keys(APPROVED_SPLITS);
  const DESCRIPTION = "I do this work myself every week.";
  const shownAll = (id: string, shown: boolean[] = APPROVED_SPLITS[id].parts.map(() => true)): PartReadings => ({ recognitionVersion: RECOGNITION_VERSION, readerVersion: DEFAULT_TEXT_RULES, forText: DESCRIPTION, splitId: id, read: true, transferAll: false, parts: APPROVED_SPLITS[id].parts.map((part, i) => ({ part, shown: shown[i], transferred: false })) });
  const consistent: TextReadings = { readerVersion: DEFAULT_TEXT_RULES, forText: DESCRIPTION, consistency: { state: "consistent", textShowsWork: true }, requirementReading: { verdict: "insufficient_information", quote: null } };
  const run = (id: string, extra: Partial<StructuredAnswerRecord> = {}, over: Partial<StructuredMatchInput> = {}) => {
    const requirement = req(APPROVED_SPLITS[id].requirement);
    return matchStructuredAnswer({ ...input(requirement, record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: DESCRIPTION, ...extra })), text: consistent, parts: shownAll(id), ...over });
  };
  it("there are 33, each linked by its exact wording to itself", () => {
    expect(ids.length).toBe(33);
    for (const id of ids) expect(approvedSplitFor(APPROVED_SPLITS[id].requirement)?.splitId).toBe(id);
  });
  it.each(ids)("%s: every part ticked and shown → Supported, quoting the person's own words", id => {
    const m = run(id);
    expect(m).toMatchObject({ verdict: "supported", basis: "candidate_answer", citation: { evidenceId: `experience:${ID}`, quote: "I do this work myself every week" } });
    expect(m.split).toMatchObject({ splitId: id, grouped: false, partsMatch: true });
  });
  it.each(ids)("%s: one part unticked → Possible at most, naming the missing parts", id => {
    const n = APPROVED_SPLITS[id].parts.length;
    const parts = APPROVED_SPLITS[id].parts.map((partText, partIndex) => ({ partIndex, partText, checked: partIndex !== n - 1 }));
    const m = run(id, { parts });
    expect(m.verdict).toBe("possible");
    expect(m.reading!.clarifications).toContain("missing_compound_parts");
  });
  it.each(ids)("%s: one ticked part not shown → Possible (only one part described)", id => {
    const shown = APPROVED_SPLITS[id].parts.map((_, i) => i !== 0);
    expect(run(id, {}, { parts: shownAll(id, shown) }).verdict).toBe("possible");
  });
  it.each(ids)("%s: an unticked part that's shown gives no credit", id => {
    const parts = APPROVED_SPLITS[id].parts.map((partText, partIndex) => ({ partIndex, partText, checked: partIndex === 0 }));
    const m = run(id, { parts });
    expect(m.verdict).toBe("possible");
  });
  it.each(ids)("%s: no part ticked → nothing", id => {
    const parts = APPROVED_SPLITS[id].parts.map((partText, partIndex) => ({ partIndex, partText, checked: false }));
    expect(run(id, { parts })).toMatchObject({ changed: false, verdict: "insufficient_information" });
  });
  it.each(ids)("%s: a grouped question that includes it → nothing (F-7)", id => {
    const requirement = req(APPROVED_SPLITS[id].requirement);
    const m = run(id, { coveredKeys: [keyOf(requirement), "another-requirement-key"], parts: [] });
    expect(m).toMatchObject({ changed: false, verdict: "insufficient_information" });
    expect(m.split).toMatchObject({ grouped: true, partsMatch: false });
  });
  it.each(ids)("%s: stored parts that aren't the approved wording count as none ticked", id => {
    const parts = APPROVED_SPLITS[id].parts.map((partText, partIndex) => ({ partIndex, partText: `${partText} (edited)`, checked: true }));
    expect(run(id, { parts })).toMatchObject({ changed: false, verdict: "insufficient_information" });
  });
  it.each(ids)("%s: a part counted twice (duplicate index) counts as none ticked", id => {
    const parts = APPROVED_SPLITS[id].parts.map((partText, partIndex) => ({ partIndex, partText, checked: true }));
    parts[parts.length - 1] = { ...parts[0] };
    expect(run(id, { parts }).verdict).toBe("insufficient_information");
  });
  it.each(ids)("%s: recognition of another split, or of other text, is refused", id => {
    const other = ids.find(x => x !== id && APPROVED_SPLITS[x].parts.length === APPROVED_SPLITS[id].parts.length) ?? ids.find(x => x !== id)!;
    expect(run(id, {}, { parts: { ...shownAll(other), forText: DESCRIPTION } }).ignored).toBe("recognition_for_other_split");
    expect(run(id, {}, { parts: { ...shownAll(id), forText: "Something else." } }).ignored).toBe("reading_for_other_text");
  });
  it("P1/P8 and P13/P14 stay distinct: parts saved for one never count for the other", () => {
    for (const [x, y] of [["P1", "P8"], ["P13", "P14"]]) {
      expect(APPROVED_SPLITS[x].requirement).not.toBe(APPROVED_SPLITS[y].requirement);
      const requirement = req(APPROVED_SPLITS[y].requirement);
      const partsOfX = APPROVED_SPLITS[x].parts.map((partText, partIndex) => ({ partIndex, partText, checked: true }));
      const m = matchStructuredAnswer({ ...input(requirement, record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: DESCRIPTION, parts: partsOfX })), text: consistent, parts: shownAll(y) });
      expect(m.split!.splitId).toBe(y);
      expect(m.split!.partsMatch, `${x} parts on ${y}`).toBe(APPROVED_SPLITS[x].parts.join("|") === APPROVED_SPLITS[y].parts.join("|"));
      if (!m.split!.partsMatch) expect(m.verdict).toBe("insufficient_information");
    }
  });
  it("an unsplit requirement never takes parts", () => {
    const requirement = req("Repairing commercial HVAC systems");
    const m = matchStructuredAnswer(input(requirement, record(requirement, "PERFORMED", { parts: [{ partIndex: 0, partText: "Repairing", checked: true }] })));
    expect(m.ignored).toBe("parts_without_split");
  });
  it("whole transfer (the simulation's signal) gives nothing for the tick", () => {
    expect(run("A58", {}, { parts: { ...shownAll("A58", [false, false]), transferAll: true } })).toMatchObject({ changed: false, verdict: "insufficient_information" });
  });
  it("a lead choice on a split has no part ticks (the form doesn't ask them): Not enough information, never more", () => {
    for (const inv of ["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT", "OBSERVED_TRAINED"] as Involvement[]) {
      const requirement = req(APPROVED_SPLITS.A58.requirement);
      const m = matchStructuredAnswer({ ...input(requirement, record(requirement, inv, { alsoDidSome: inv === "OBSERVED_TRAINED" ? null : false, detail: DESCRIPTION })), text: consistent, parts: shownAll("A58") });
      expect(m.verdict, inv).toBe("insufficient_information");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("claimed months (F-6): a claim, Possible at most, never dates", () => {
  const requirement = req("3+ years of residential plumbing experience", "Experience");
  const gap = { verdict: "gap" as const, basis: "employment_dates" };
  const run = (claimedMonths: number | null, extra: Partial<StructuredAnswerRecord> = {}, over: Partial<StructuredMatchInput> = {}) =>
    matchStructuredAnswer({ ...input(requirement, record(requirement, "PERFORMED", { claimedMonths, ...extra })), finding: gap, ...over });
  it("enough claimed time raises a dates gap to Possible, citing the choice", () => {
    expect(run(48)).toMatchObject({ verdict: "possible", basis: "candidate_choice", citation: { evidenceId: `choice:${ID}`, quote: null } });
    expect(run(36).verdict).toBe("possible");
  });
  it("too little, none, the wrong choice, another kind of gap, or a role-date conflict: the gap stays", () => {
    expect(run(35).verdict).toBe("gap");
    expect(run(null).verdict).toBe("gap");
    expect(matchStructuredAnswer({ ...input(requirement, record(requirement, "OBSERVED_TRAINED")), finding: gap }).verdict).toBe("gap");
    expect(run(48, {}, { finding: { verdict: "gap", basis: "stated_absent" } }).verdict).toBe("gap");
    expect(run(48, { recency: "CURRENT" }, { role: { months: 12, endedMonthsAgo: 24 } }).verdict).toBe("gap");
  });
  it("claimed months never raise Not enough information or Possible above Possible", () => {
    expect(run(600, { frequency: "MOST_DAYS" }, { finding: { verdict: "insufficient_information", basis: "no_evidence" } }).verdict).toBe("possible");
    expect(run(600, { frequency: "MOST_DAYS" }, { finding: { verdict: "possible", basis: "employment_dates" } }).verdict).toBe("possible");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("precedence, status and malformed input: fail closed, finding unchanged", () => {
  const requirement = req("Repairing commercial HVAC systems");
  const good = () => record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: "I repair rooftop units myself every week." });
  const before = { verdict: "insufficient_information" as const, basis: "no_evidence" };
  const refused = (i: StructuredMatchInput, reason: string) => {
    const m = matchStructuredAnswer(i);
    expect(m).toMatchObject({ ignored: reason, changed: false, verdict: before.verdict, basis: null, citation: null, reading: null });
  };
  it("a counting free-text answer wins", () => refused({ ...input(requirement, good()), freeTextCounts: true }, "free_text_counts"));
  it.each(["SUPERSEDED", "REVOKED", "DELETED", ""])("status %s is ignored", status => refused(input(requirement, { ...good(), status }), "not_active"));
  it("a free-text answer (formVersion 1) is not read here", () => refused(input(requirement, { ...good(), formVersion: 1 }), "not_structured"));
  it("an answer to another question is not read", () => refused(input(requirement, { ...good(), questionKey: "other", coveredKeys: ["other"] }), "not_this_question"));
  it.each<[string, Partial<StructuredAnswerRecord>]>([
    ["unknown choice", { involvement: "DID_IT" }],
    ["no choice", { involvement: null }],
    ["unknown frequency", { frequency: "HOURLY" }],
    ["unknown recency", { recency: "SOMETIME" }],
    ["PERFORMED without frequency", { frequency: null }],
    ["PERFORMED without recency", { recency: null }],
    ["PERFORMED with also-did-some", { alsoDidSome: true }],
    ["PERFORMED as a denial", { outcome: "DENIED" }],
    ["no role", { experienceId: null }],
    ["claimed months out of range", { claimedMonths: 0 }],
    ["claimed months too large", { claimedMonths: 721 }],
    ["claimed months not whole", { claimedMonths: 12.5 }],
    ["parts not a list", { parts: null as never }],
    ["keys not a list", { coveredKeys: null as never }],
  ])("malformed: %s", (_l, extra) => refused(input(requirement, { ...good(), ...extra }), "invalid_answer"));
  it.each<[Involvement, Partial<StructuredAnswerRecord>]>([
    ["SUPERVISED", { alsoDidSome: true }], ["ASSISTED", { frequency: "WEEKLY" }], ["OBSERVED_TRAINED", { alsoDidSome: false }], ["PART", { alsoDidSome: false }],
    ["NOT_DONE", { detail: "words" }], ["NOT_DONE", { experienceId: "x" }], ["TAUGHT", { claimedMonths: 12 }],
  ])("malformed: %s with %j", (inv, extra) => refused(input(requirement, { ...record(requirement, inv), ...extra }), "invalid_answer"));
  it("a role answer without its role's dates is ignored", () => refused({ ...input(requirement, good()), role: null }, "missing_role"));
  it("a role answer with broken role dates is ignored", () => refused({ ...input(requirement, good()), role: { months: -1, endedMonthsAgo: null } }, "missing_role"));
  it("a role answer without its own evidence id is ignored (F1: masking needs it)", () => {
    refused(input(requirement, { ...good(), evidenceId: null }), "evidence_id_mismatch");
    refused(input(requirement, { ...good(), evidenceId: "experience:someone-else" }), "evidence_id_mismatch");
  });
  it("a description without its readings, or readings of other text, is ignored", () => {
    refused({ ...input(requirement, good()), text: null }, "missing_reading");
    const i = input(requirement, good());
    refused({ ...i, text: { ...i.text!, forText: "I repair chillers." } }, "reading_for_other_text");
  });
  it("a split description without recognition is ignored", () => {
    const plumbing = req("Install and repair residential plumbing");
    refused({ ...input(plumbing, record(plumbing, "PERFORMED", { detail: "I install water heaters myself." })), parts: null }, "missing_reading");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("versions: the default reader unless the caller explicitly asks for another", () => {
  const plumbing = req("Install and repair residential plumbing");
  const dispatched = record(plumbing, "PERFORMED", { frequency: "MOST_DAYS", detail: "My boss sends me out to install water heaters and fix leaks every day." });
  it("readings from another reader are refused, never silently adopted", () => {
    const v22 = realReadings(plumbing, dispatched, "v22");
    const m = matchStructuredAnswer({ ...input(plumbing, dispatched), ...v22 });
    expect(m.ignored).toBe("reader_version_mismatch");
    expect(matchStructuredAnswer({ ...input(plumbing, dispatched), parts: { ...realReadings(plumbing, dispatched).parts!, readerVersion: "v22" } }).ignored).toBe("reader_version_mismatch");
  });
  it("recognition from another recognition version is refused", () => {
    const i = input(plumbing, dispatched);
    expect(matchStructuredAnswer({ ...i, parts: { ...i.parts!, recognitionVersion: "splits-v1.0" } }).ignored).toBe("recognition_version_mismatch");
    expect(matchStructuredAnswer({ ...i, parts: { ...i.parts!, recognitionVersion: "splits-v1.2" } }).ignored).toBe("recognition_version_mismatch");
  });
  it("the default: the dispatched answer reads as F0 found (a mismatch), so the tick gives nothing", () => {
    const m = matchStructuredAnswer(input(plumbing, dispatched));
    expect(m.versions).toEqual({ reader: DEFAULT_TEXT_RULES, recognition: RECOGNITION_VERSION });
    expect(m.verdict).toBe("insufficient_information");
  });
  it("opting in explicitly to rules-v22, with v22 readings, reads it as the person's own work", () => {
    const m = matchStructuredAnswer({ ...input(plumbing, dispatched), ...realReadings(plumbing, dispatched, "v22"), expect: { readerVersion: "v22" } });
    expect(m.versions.reader).toBe("v22");
    expect(m).toMatchObject({ ignored: null, verdict: "supported", basis: "candidate_answer" });
  });
  it("the module's own version", () => expect(STRUCTURED_MATCHING_VERSION).toBe("structured-matching-v1"));
});

// ---------------------------------------------------------------------------------------------------------------------
describe("pure and deterministic", () => {
  it("the same input gives the same output, and the input is never changed", () => {
    const requirement = req("Install and repair residential plumbing");
    const i = deepFreeze(input(requirement, record(requirement, "PERFORMED", { frequency: "MOST_DAYS", detail: "I install water heaters and repair leaking pipes in homes myself every day." })));
    const first = JSON.stringify(matchStructuredAnswer(i));
    for (let k = 0; k < 20; k++) expect(JSON.stringify(matchStructuredAnswer(i))).toBe(first);
  });
  it("every verdict is one of the four", () => {
    const requirement = req("Microsoft Excel");
    for (const v of VERDICTS) expect(VERDICTS).toContain(matchStructuredAnswer({ ...input(requirement, record(requirement, "TAUGHT", { alsoDidSome: false })), finding: { verdict: v, basis: null } }).verdict);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("not connected (F2): it cannot influence matching", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(`${dir}/${f}`).isDirectory() ? (f === "generated" ? [] : walk(`${dir}/${f}`)) : [`${dir}/${f}`]));
  const MODULE = "src/lib/ai/rules/structured-matching.ts";
  it("only the F4 composition module imports it", () => {
    expect(walk("src").filter(f => f !== MODULE && /structured-matching/.test(readFileSync(f, "utf8")))).toEqual(["src/lib/ai/rules/structured-apply.ts"]);
  });
  it("it has no database, network, flag, environment, clock, randomness or model access", () => {
    const source = readFileSync(MODULE, "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map(m => m[1]).sort();
    expect(imports).toEqual(["@/lib/ai/evidence", "@/lib/ai/evidence-boundary", "@/lib/ai/match-validation", "@/lib/ai/rules/approved-split-link", "@/lib/ai/rules/structured-answer", "@/lib/ai/rules/structured-form", "@/lib/ai/untrusted-text"]);
    expect(source).not.toMatch(/prisma|@\/lib\/db|fetch\(|process\.env|readAiConfig|Date\.now|new Date|Math\.random|ollama|anthropic|server-only/i);
  });
});
