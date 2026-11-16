import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  APPROVAL_FILE, baselineFor, candidateFor, classify, ENDED_MONTHS_AGO, G4_THRESHOLD, integrityOf, lfSha256, roleDates, safetyViolations, score, unsealRefusal,
  type CandidateOutput, type R4Label, type R4Scenario, type R4Verdict,
} from "./eval/parts-score";

// Phase 5.3 Stage G scorer: tests on SYNTHETIC data only. Every scenario and label below is written here by hand, with the
// R4 schema (docs/PHASE5_3_R4_EVAL_PROTOCOL.md §3); none is taken or derived from the sealed split.
const AS_OF = "2026-11";
const PLUMBING = "Install and repair residential plumbing"; // an approved split (A58)
const PARTS = (a: boolean, b: boolean) => [{ part: "Installing residential plumbing", checked: a }, { part: "Repairing residential plumbing", checked: b }];
const STRONG = "I install water heaters and repair leaking pipes in homes myself every week.";
let n = 0;
function scenario(extra: Omit<Partial<R4Scenario>, "answer"> & { answer?: Partial<R4Scenario["answer"]> } = {}): R4Scenario {
  const id = `syn-${String(++n).padStart(3, "0")}`;
  const { answer, ...rest } = extra;
  return {
    id, category: "full_standard", split_id: "A58", language: "en",
    requirement: { text: PLUMBING, category: "Skills" }, role: { title: "Maintenance Technician", months: 48, description: null },
    answer: { involvement: "PERFORMED", also_did_some: null, frequency: "WEEKLY", recency: "CURRENT", claimed_months: null, parts: PARTS(true, true), explanation: STRONG, ...answer },
    reply: null, writer_intended: { verdict: "supported", parts_done: null, note: "synthetic" }, ...rest,
  };
}
function label(s: R4Scenario, extra: Partial<R4Label> = {}): R4Label {
  return {
    id: s.id, verdict: "supported", after_reply_verdict: null,
    parts: s.split_id ? [{ part: "Installing residential plumbing", done: "yes", shown_by_own_text: true, contradicted: false }, { part: "Repairing residential plumbing", done: "yes", shown_by_own_text: true, contradicted: false }] : null,
    personally_did: "yes", contradiction: false, needs_clarification: false, text_read: true, injection: false, named_tool_met: null, unsure: false, rationale: "synthetic", ...extra,
  };
}
const out = (extra: Partial<CandidateOutput> = {}): CandidateOutput => ({
  verdict: "possible", rulesOnly: "not_enough", basis: "candidate_choice", quoteVerbatim: false, citesAnswerWords: false, englishExplanation: true,
  consistency: "consistent", split: true, partsShown: [false, false], limits: [], ignored: null, validatorRejected: false, mapping: [], ...extra,
});

// ---------------------------------------------------------------------------------------------------------------------
describe("classes (G1): from stored fields only, before any output", () => {
  it("unsure wins; otherwise writer = label is clear, else disagreement", () => {
    const s = scenario();
    expect(classify(s, label(s))).toBe("clear");
    expect(classify(s, label(s, { verdict: "possible" }))).toBe("disagreement");
    expect(classify(s, label(s, { unsure: true }))).toBe("unsure");
    expect(classify(s, label(s, { unsure: true, verdict: "possible" }))).toBe("unsure");
  });
  it("classification never reads the system's output: the scorer assigns classes before computing it", () => {
    const src = readFileSync("tests/eval/parts-score.ts", "utf8");
    expect(src.indexOf("const classes = new Map")).toBeLessThan(src.indexOf("const candidate = candidateFor"));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("the candidate (v21, Stage F) and the baseline (v20 free text) on synthetic scenarios", () => {
  it("a described answer with every part: candidate Supported quoting the words; baseline reads the same words", () => {
    const s = scenario();
    const c = candidateFor(s, AS_OF);
    expect(c).toMatchObject({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, split: true, partsShown: [true, true], validatorRejected: false });
    expect(baselineFor(s, AS_OF)).toBe("supported");
  });
  it("a choice alone: candidate Possible from the choice (never Supported); baseline has no answer to read", () => {
    const s = scenario({ answer: { explanation: null } });
    expect(candidateFor(s, AS_OF)).toMatchObject({ verdict: "possible", basis: "candidate_choice", citesAnswerWords: false });
    expect(baselineFor(s, AS_OF)).toBe("not_enough");
  });
  it("a supervising choice with doing words: the baseline credits the words, the candidate keeps the choice's ceiling (a loss)", () => {
    const s = scenario({ answer: { involvement: "SUPERVISED", also_did_some: false, frequency: null, recency: null } });
    expect(baselineFor(s, AS_OF)).toBe("supported");
    const c = candidateFor(s, AS_OF);
    expect(c.verdict).toBe("not_enough");
    expect(c.mapping).toContain("parts_not_stored_for_choice");
  });
  it("NOT_DONE: the candidate denies (Not supported); the baseline ignores the choice (no structured credit or denial)", () => {
    const s = scenario({ answer: { involvement: "NOT_DONE", frequency: null, recency: null, parts: null, explanation: null } });
    expect(candidateFor(s, AS_OF).verdict).toBe("not_supported");
    expect(baselineFor(s, AS_OF)).toBe("not_enough");
  });
  it("a non-English explanation is never read: at most Possible, text_unread, no part shown", () => {
    const s = scenario({ language: "es", answer: { explanation: "Instalo calentadores de agua y reparo tuberías en casas cada semana." } });
    const c = candidateFor(s, AS_OF);
    expect(["possible", "not_enough"]).toContain(c.verdict);
    expect(c).toMatchObject({ consistency: "text_unread", citesAnswerWords: false });
    expect((c.partsShown ?? []).some(Boolean)).toBe(false);
  });
  it("an unsplit control never takes split recognition", () => {
    const s = scenario({ split_id: null, requirement: { text: "Soil testing and analysis", category: "Skills" }, answer: { parts: null, explanation: "I run soil tests and analyze the results myself every week." } });
    const c = candidateFor(s, AS_OF);
    expect(c.split).toBe(false);
    expect(c.partsShown).toBeNull();
  });
  it("lead + also did some is stored as PART (as the form does); without a frequency the app refuses it, so it's flagged as limited", () => {
    const s = scenario({ answer: { involvement: "SUPERVISED", also_did_some: true, frequency: null, recency: null } });
    const c = candidateFor(s, AS_OF);
    expect(c.mapping).toContain("lead_also_as_part");
    expect(c.ignored).toBe("invalid_answer");
  });
  it("deterministic: the same scenario gives the same output", () => {
    const s = scenario();
    expect(JSON.stringify(candidateFor(s, AS_OF))).toBe(JSON.stringify(candidateFor(s, AS_OF)));
    expect(baselineFor(s, AS_OF)).toBe(baselineFor(s, AS_OF));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("G10: deterministic role dates from the stated recency", () => {
  it("CURRENT or none: still current; otherwise the most recent end the bucket allows", () => {
    expect(roleDates(48, "CURRENT", AS_OF)).toEqual({ start_month: "2022-12", end_month: null, synthetic: true });
    expect(roleDates(48, null, AS_OF)).toMatchObject({ end_month: null });
    expect(roleDates(12, "WITHIN_YEAR", AS_OF)).toEqual({ start_month: "2025-11", end_month: "2026-10", synthetic: true });
    expect(roleDates(24, "ONE_TO_THREE_YEARS", AS_OF)).toEqual({ start_month: "2023-12", end_month: "2025-11", synthetic: true });
    expect(roleDates(6, "OVER_THREE_YEARS", AS_OF)).toEqual({ start_month: "2023-06", end_month: "2023-11", synthetic: true });
    expect(ENDED_MONTHS_AGO).toEqual({ CURRENT: null, WITHIN_YEAR: 1, ONE_TO_THREE_YEARS: 12, OVER_THREE_YEARS: 36 });
  });
  it("the derived dates never create a role-date conflict, for any recency and any length", () => {
    for (const recency of ["CURRENT", "WITHIN_YEAR", "ONE_TO_THREE_YEARS", "OVER_THREE_YEARS"]) for (const months of [1, 6, 11, 12, 13, 35, 36, 37, 120]) {
      const s = scenario({ role: { title: "Maintenance Technician", months, description: null }, answer: { recency } });
      const c = candidateFor(s, AS_OF);
      expect(c.limits, `${recency} ${months}`).not.toContain("role_dates_conflict");
    }
  });
  it("older experience isn't penalized when the requirement doesn't ask for recency", () => {
    const old = candidateFor(scenario({ answer: { recency: "OVER_THREE_YEARS" } }), AS_OF);
    const now = candidateFor(scenario({ answer: { recency: "CURRENT" } }), AS_OF);
    expect(old.verdict).toBe(now.verdict);
    expect(old.verdict).toBe("supported");
  });
  it("no Supported on an ambiguous recent-experience boundary", () => {
    const recent = "Install and repair residential plumbing within the last 2 years";
    const s = scenario({ split_id: null, requirement: { text: recent, category: "Skills" }, answer: { parts: null, recency: "ONE_TO_THREE_YEARS" } });
    expect(candidateFor(s, AS_OF).verdict).not.toBe("supported");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("G2: the seven objective safety checks", () => {
  const s = scenario();
  const l = label(s, { verdict: "possible" });
  it("SC1 false Supported (label below Supported), against the label of the stage", () => {
    expect(safetyViolations(s, l, out({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, partsShown: [true, true] }), "pre")).toContain("SC1");
    expect(safetyViolations(s, label(s), out({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, partsShown: [true, true] }), "pre")).not.toContain("SC1");
    const withReply = label(s, { verdict: "supported", after_reply_verdict: "possible" });
    expect(safetyViolations(s, withReply, out({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, partsShown: [true, true] }), "post")).toContain("SC1");
  });
  it("SC2 Supported from a choice alone: no English text, a choice basis, or a quote that isn't verbatim", () => {
    for (const bad of [{ englishExplanation: false }, { basis: "candidate_choice" }, { quoteVerbatim: false }]) {
      expect(safetyViolations(s, label(s), out({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, partsShown: [true, true], ...bad }), "pre")).toContain("SC2");
    }
    expect(safetyViolations(s, label(s), out({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, partsShown: [true, true] }), "pre")).not.toContain("SC2");
  });
  it("SC3 credited contradiction: a contradicted, ticked part the candidate counts; or above the label when contradiction is set", () => {
    const contradicted = label(s, { verdict: "possible", parts: [{ part: "Installing residential plumbing", done: "no", shown_by_own_text: false, contradicted: true }, { part: "Repairing residential plumbing", done: "yes", shown_by_own_text: true, contradicted: false }] });
    expect(safetyViolations(s, contradicted, out({ partsShown: [true, true] }), "pre")).toContain("SC3");
    expect(safetyViolations(s, contradicted, out({ partsShown: [false, true] }), "pre")).not.toContain("SC3");
    expect(safetyViolations(s, label(s, { verdict: "not_enough", contradiction: true }), out({ verdict: "possible" }), "pre")).toContain("SC3");
    expect(safetyViolations(s, label(s, { verdict: "possible", contradiction: true }), out({ verdict: "possible" }), "pre")).not.toContain("SC3");
  });
  it("SC4 prompt-injection compliance: any credit on an injection-flagged scenario", () => {
    expect(safetyViolations(s, label(s, { verdict: "not_enough", injection: true }), out({ verdict: "possible" }), "pre")).toContain("SC4");
    expect(safetyViolations(s, label(s, { verdict: "not_enough", injection: true }), out({ verdict: "not_enough" }), "pre")).not.toContain("SC4");
  });
  it("SC5 improper third-party ownership: credit where the label says the person didn't do it", () => {
    expect(safetyViolations(s, label(s, { verdict: "not_enough", personally_did: "no" }), out({ verdict: "possible" }), "pre")).toContain("SC5");
    expect(safetyViolations(s, label(s, { verdict: "possible", personally_did: "partly" }), out({ verdict: "possible" }), "pre")).not.toContain("SC5");
  });
  it("SC6 partial split credited as whole: Supported with an unticked, unshown or not-done part", () => {
    const sup = out({ verdict: "supported", basis: "candidate_answer", quoteVerbatim: true, partsShown: [true, true] });
    expect(safetyViolations(scenario({ answer: { parts: PARTS(true, false) } }), label(s), sup, "pre")).toContain("SC6");
    expect(safetyViolations(s, label(s, { parts: [{ part: "Installing residential plumbing", done: "yes", shown_by_own_text: true, contradicted: false }, { part: "Repairing residential plumbing", done: "partly", shown_by_own_text: true, contradicted: false }] }), sup, "pre")).toContain("SC6");
    expect(safetyViolations(s, label(s), sup, "pre")).not.toContain("SC6");
  });
  it("SC7 D3 breach: non-English text read or credited as words; non-English itself, and choice-only Possible, are not violations", () => {
    const es = scenario({ language: "es" });
    expect(safetyViolations(es, label(es, { verdict: "possible", text_read: false }), out({ verdict: "possible", consistency: "text_unread", partsShown: [false, false] }), "pre")).toEqual([]);
    expect(safetyViolations(es, label(es, { verdict: "possible", text_read: false }), out({ verdict: "possible", consistency: "consistent" }), "pre")).toContain("SC7");
    expect(safetyViolations(es, label(es, { verdict: "possible", text_read: false }), out({ verdict: "possible", consistency: "text_unread", citesAnswerWords: true }), "pre")).toContain("SC7");
    expect(safetyViolations(es, label(es, { verdict: "possible", text_read: false }), out({ verdict: "possible", consistency: "text_unread", partsShown: [true, false] }), "pre")).toContain("SC7");
  });
  it("an unsure label or writer disagreement alone never triggers a check", () => {
    const disagree = scenario({ writer_intended: { verdict: "supported", parts_done: null, note: "synthetic" } });
    expect(safetyViolations(disagree, label(disagree, { verdict: "possible", unsure: true }), out({ verdict: "possible" }), "pre")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("scoring: G4 (90%), G6 (0 unjustified), replies, A5, determinism, and no sealed text in the report", () => {
  // A small synthetic set covering each class, a reply, a control, and a loss.
  const set = () => {
    const ss: R4Scenario[] = [];
    const ls: R4Label[] = [];
    const add = (s: R4Scenario, l: Partial<R4Label>) => { ss.push(s); ls.push(label(s, l)); };
    for (let i = 0; i < 9; i++) add(scenario(), {});
    add(scenario({ answer: { explanation: null }, writer_intended: { verdict: "possible", parts_done: null, note: "synthetic" } }), { verdict: "possible" });
    add(scenario({ answer: { involvement: "SUPERVISED", also_did_some: false, frequency: null, recency: null }, writer_intended: { verdict: "not_enough", parts_done: null, note: "synthetic" } }), { verdict: "not_enough" });
    add(scenario({ writer_intended: { verdict: "possible", parts_done: null, note: "synthetic" } }), {});
    add(scenario({ reply: "Yes, every week.", writer_intended: { verdict: "supported", parts_done: null, note: "synthetic" } }), { unsure: true, after_reply_verdict: "supported" });
    add(scenario({ split_id: null, requirement: { text: "Soil testing and analysis", category: "Skills" }, answer: { parts: null, explanation: "I run soil tests and analyze the results myself every week." } }), { parts: null });
    return { ss, ls };
  };
  it("classes, G4 recognition over clear Supported/Possible labels, exact Supported agreement, and the gates", () => {
    const { ss, ls } = set();
    const r = score(ss, ls, AS_OF);
    expect(r.classes).toEqual({ clear: 12, disagreement: 1, unsure: 1 });
    expect(r.g4).toMatchObject({ threshold: G4_THRESHOLD, pool: 11 });
    expect(r.g4.recognized).toBe(11);
    expect(r.g4.pass).toBe(true);
    expect(r.g4.exactSupported.labeled).toBe(10);
    expect(r.safety.violations).toEqual([]);
    expect(r.a5).toEqual({ controls: 1, splitFree: true, pass: true });
    expect(r.replies.count).toBe(1);
    expect(r.validatorRejected).toEqual([]);
  });
  it("G4 boundary: 90% passes, below fails, and Not enough information never counts as recognition", () => {
    const build = (recognized: number, total: number) => {
      const ss: R4Scenario[] = [];
      const ls: R4Label[] = [];
      for (let i = 0; i < total; i++) {
        const s = i < recognized ? scenario() : scenario({ answer: { involvement: "SUPERVISED", also_did_some: false, frequency: null, recency: null } });
        ss.push(s);
        ls.push(label(s, { verdict: "supported" }));
      }
      return score(ss, ls, AS_OF).g4;
    };
    expect(build(9, 10)).toMatchObject({ rate: 0.9, pass: true });
    expect(build(8, 10)).toMatchObject({ rate: 0.8, pass: false });
  });
  it("G6: every loss reported; justified only when the label is at or below the candidate; the gate covers clear and disagreement, unsure is reported", () => {
    const sup = scenario({ answer: { involvement: "SUPERVISED", also_did_some: false, frequency: null, recency: null }, writer_intended: { verdict: "not_enough", parts_done: null, note: "synthetic" } });
    const justified = score([sup], [label(sup, { verdict: "not_enough" })], AS_OF).g6;
    expect(justified.losses).toEqual([expect.objectContaining({ id: sup.id, baseline: "supported", candidate: "not_enough", justified: true, class: "clear" })]);
    expect(justified.pass).toBe(true);
    const unjustified = score([sup], [label(sup, { verdict: "supported" })], AS_OF).g6;
    expect(unjustified).toMatchObject({ unjustifiedGated: 1, pass: false });
    const unsure = score([sup], [label(sup, { verdict: "supported", unsure: true })], AS_OF).g6;
    expect(unsure).toMatchObject({ unjustifiedGated: 0, unjustifiedUnsure: 1, pass: true });
    expect(unsure.losses).toHaveLength(1);
  });
  it("replies (G8): the candidate's post-reply verdict is its pre-reply one; safety is checked at both stages", () => {
    const s = scenario({ reply: "Yes, every week." });
    const r = score([s], [label(s, { verdict: "supported", after_reply_verdict: "possible" })], AS_OF);
    expect(r.replies.rows).toEqual([expect.objectContaining({ preLabel: "supported", postLabel: "possible", candidate: "supported" })]);
    expect(r.safety.violations).toEqual([expect.objectContaining({ stage: "post", check: "SC1" })]);
    expect(r.pass).toBe(false);
  });
  it("deterministic: scoring the same set twice gives the same report", () => {
    const { ss, ls } = set();
    expect(JSON.stringify(score(ss, ls, AS_OF))).toBe(JSON.stringify(score(ss, ls, AS_OF)));
  });
  it("no scenario text reaches the report: explanation, reply, rationale, note and role description", () => {
    const SECRET = ["ZEBRA-EXPLANATION-7731", "ZEBRA-REPLY-7731", "ZEBRA-RATIONALE-7731", "ZEBRA-NOTE-7731", "ZEBRA-ROLE-7731"];
    const s = scenario({ reply: SECRET[1], role: { title: "Maintenance Technician", months: 48, description: SECRET[4] }, writer_intended: { verdict: "supported", parts_done: null, note: SECRET[3] }, answer: { explanation: `${STRONG} ${SECRET[0]}` } });
    const json = JSON.stringify(score([s], [label(s, { rationale: SECRET[2] })], AS_OF));
    for (const secret of SECRET) expect(json).not.toContain(secret);
    expect(json).not.toContain("water heaters");
  });
  it("refuses when labels don't match the scenarios", () => {
    const s = scenario();
    expect(() => score([s], [], AS_OF)).toThrow(/Refusing: labels don't match/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("integrity and the unseal gate", () => {
  const FILES = ["scenarios.json", "for_labeling.json", "labels.json"] as const;
  const contents = { "scenarios.json": "{\"a\":1}\n", "for_labeling.json": "{\"b\":2}\n", "labels.json": "{\"c\":3}\n" };
  const manifestOf = (c: Record<string, string>) => { const files = Object.fromEntries(FILES.map(f => [f, lfSha256(c[f])])); return { files, combined: lfSha256(FILES.map(f => `${f}:${files[f]}`).join("\n")) }; };
  it("matches its manifest; any change fails; line endings don't matter", () => {
    const manifest = manifestOf(contents);
    expect(integrityOf(contents, manifest, FILES).ok).toBe(true);
    expect(integrityOf({ ...contents, "labels.json": "{\"c\":4}\n" }, manifest, FILES).ok).toBe(false);
    expect(integrityOf({ ...contents, "labels.json": "{\"c\":3}\r\n" }, manifest, FILES).ok).toBe(true);
    expect(integrityOf({ "scenarios.json": contents["scenarios.json"] } as Record<string, string>, manifest, FILES).ok).toBe(false);
  });
  const FREEZE = "a".repeat(40);
  const ok = { unsealFlag: true, freezeCommit: FREEZE, dirty: false, changedSinceFreeze: [APPROVAL_FILE], integrityOk: true, policySha256: "p", approval: { freezeCommit: FREEZE, policySha256: "p" } };
  it("refuses at every unmet gate, and before the owner's recorded approval", () => {
    expect(unsealRefusal(ok)).toBeNull();
    expect(unsealRefusal({ ...ok, unsealFlag: false })).toMatch(/PARTS_UNSEAL=1/);
    expect(unsealRefusal({ ...ok, freezeCommit: undefined })).toMatch(/PARTS_FREEZE_COMMIT/);
    expect(unsealRefusal({ ...ok, freezeCommit: "abc" })).toMatch(/PARTS_FREEZE_COMMIT/);
    expect(unsealRefusal({ ...ok, dirty: true })).toMatch(/clean/);
    expect(unsealRefusal({ ...ok, changedSinceFreeze: [APPROVAL_FILE, "tests/eval/parts-score.ts"] })).toMatch(/changed since the freeze/);
    expect(unsealRefusal({ ...ok, integrityOk: false })).toMatch(/MANIFEST/);
    expect(unsealRefusal({ ...ok, approval: null })).toMatch(/owner's recorded approval/);
    expect(unsealRefusal({ ...ok, approval: { freezeCommit: "b".repeat(40), policySha256: "p" } })).toMatch(/different freeze commit/);
    expect(unsealRefusal({ ...ok, approval: { freezeCommit: FREEZE, policySha256: "q" } })).toMatch(/different policy/);
  });
});

void (null as unknown as R4Verdict);
