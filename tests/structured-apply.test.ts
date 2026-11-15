import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Evidence, MatchRequest, MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { validateMatchResponse, type Finding } from "@/lib/ai/match-validation";
import { readAiConfig } from "@/lib/ai/config";
import { applyAnswers, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { RULES_VERSION, rulesResponse, type RawFinding } from "@/lib/ai/rules/engine";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";
import { APPROVED_SPLITS, RECOGNITION_VERSION } from "@/lib/ai/rules/split-recognition";
import { applyStructuredAnswers, maskStructuredFindings, NO_MASK, structuredDenials, structuredFingerprintAnswers, withholdChoiceFindings, type StructuredRow } from "@/lib/ai/rules/structured-apply";

// Phase 5.3 Stage F4: structured answers composed into the rules' findings (behind STRUCTURED_MATCHING_ENABLED), through
// the same independent validator as every result. The database side is tests/integration/structured-matching.integration.ts.

const ROLE = "00000000-0000-4000-8000-0000000000e1";
const ANSWER = "00000000-0000-4000-8000-0000000000a1";
const req = (text: string, index = 0, category: MatchRequirement["category"] = "Skills"): MatchRequirement => ({ index, text, category, priority: "Required" });
const role: Evidence = { id: `experience:${ROLE}`, kind: "experience", job_title: "Office Assistant", start_month: "2019-01", end_month: null, description: "Answered phones." };
const answerItem = (detail: string, id = ANSWER): Evidence => ({ id: `experience:${id}`, kind: "experience", job_title: "Office Assistant", start_month: "2019-01", end_month: null, description: detail, source: "clarification" });
function row(requirement: MatchRequirement, extra: Partial<StructuredRow> = {}): StructuredRow {
  const key = keyForRequirement(requirement);
  return { id: ANSWER, status: "ACTIVE", formVersion: 2, outcome: "ROLE_DETAIL_ADDED", involvement: "PERFORMED", alsoDidSome: null, frequency: "MOST_DAYS", recency: "CURRENT", claimedMonths: null,
    experienceId: ROLE, detail: null, evidenceId: `experience:${ANSWER}`, questionKey: key, coveredKeys: [key], parts: [], ...extra };
}
const ticked = (cid: string, which: (i: number) => boolean = () => true) => APPROVED_SPLITS[cid].parts.map((partText, partIndex) => ({ partIndex, partText, checked: which(partIndex) }));
/** The whole rules pipeline as F4 runs it: free-text answers, then structured answers, then the validator. */
function run(requirements: MatchRequirement[], rows: StructuredRow[], options: { evidence?: Evidence[]; answers?: LinkedAnswer[]; freeText?: Set<string>; base?: (f: RawFinding[]) => RawFinding[] } = {}) {
  const evidence = [role, ...rows.filter(r => r.detail).map(r => answerItem(r.detail!, r.id)), ...(options.evidence ?? [])];
  const answers = [...(options.answers ?? []), ...structuredDenials(rows, options.freeText ?? new Set())];
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e04", provider: "rules", as_of_month: "2026-11", requirements, evidence, ...(answers.length ? { linked_answers: answers } : {}) };
  let applied: ReturnType<typeof applyStructuredAnswers> | null = null;
  const body = rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => {
    applied = applyStructuredAnswers(request, applyAnswers(request, (options.base ?? (x => x))(f), answers, keyForRequirement), rows.filter(r => r.involvement !== "NOT_DONE"), options.freeText ?? new Set(), keyForRequirement);
    return applied.findings;
  });
  const validated = validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider: "rules", model: null });
  return { findings: validated.findings, applied: applied!, request };
}

// ---------------------------------------------------------------------------------------------------------------------
describe("the flag", () => {
  const env = { AI_ANALYSIS_DAILY_LIMIT: "20" };
  it.each<[Record<string, string>, boolean]>([
    [{}, false],
    [{ STRUCTURED_MATCHING_ENABLED: "true" }, false],
    [{ STRUCTURED_MATCHING_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }, false],
    [{ STRUCTURED_MATCHING_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true" }, false],
    [{ STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }, false],
    [{ STRUCTURED_MATCHING_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }, true],
    [{ STRUCTURED_MATCHING_ENABLED: " true ", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }, true],
    [{ STRUCTURED_MATCHING_ENABLED: "TRUE", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }, false],
    [{ STRUCTURED_MATCHING_ENABLED: "1", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }, false],
    [{ STRUCTURED_MATCHING_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true", VERCEL: "1" }, false],
  ])("%j → %s", (flags, on) => {
    expect(readAiConfig({ ...env, ...flags })).toMatchObject({ structuredMatching: on });
  });
  it("off when the configuration is unusable", () => expect(readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "0", STRUCTURED_MATCHING_ENABLED: "true" })).toMatchObject({ enabled: false }));
});

// ---------------------------------------------------------------------------------------------------------------------
describe("whole requirements", () => {
  const hvac = req("Repairing commercial HVAC systems");
  const words = "I repair commercial HVAC systems myself every week.";
  it("a description showing the work: Supported, citing the person's own words (candidate_answer), and valid", () => {
    const { findings } = run([hvac], [row(hvac, { detail: words })]);
    expect(findings[0]).toMatchObject({ verdict: "supported", basis: "candidate_answer", rulesOnlyVerdict: "insufficient_information", evidenceSources: ["candidate_answer"], citations: [{ evidenceId: `experience:${ANSWER}` }] });
    expect(words).toContain(findings[0].citations[0].quote);
  });
  it("a choice alone: nothing stored (choice findings are withheld in F4)", () => {
    const { findings, applied } = run([hvac], [row(hvac)]);
    expect(findings[0]).toMatchObject({ verdict: "insufficient_information", basis: "no_evidence" });
    expect(applied.withheld).toBe(1);
    expect(JSON.stringify(findings)).not.toContain("choice:");
  });
  it("an irrelevant description (the consistency gap) never gives Supported", () => {
    const { findings } = run([hvac], [row(hvac, { detail: "I pick up parts for the HVAC techs." })]);
    expect(findings[0].verdict).not.toBe("supported");
  });
  it("a description of related or partial work: Possible, citing the words", () => {
    const { findings } = run([hvac], [row(hvac, { involvement: "PART", detail: words })]);
    expect(findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_answer" });
  });
  it("a contradicting description gives nothing", () => {
    const { findings } = run([hvac], [row(hvac, { detail: "Our HVAC techs do all the repairs; I schedule their calls." })]);
    expect(findings[0].verdict).toBe("insufficient_information");
  });
  it("a rules Supported is never lowered, by any choice", () => {
    const excel = req("Microsoft Excel");
    const skill: Evidence = { id: "skill:00000000-0000-4000-8000-0000000000f1", kind: "skill", name: "Microsoft Excel", proficiency: null };
    for (const involvement of ["PERFORMED", "SUPERVISED", "OBSERVED_TRAINED", "NOT_DONE"]) {
      const r = involvement === "NOT_DONE" ? row(excel, { involvement, outcome: "DENIED", experienceId: null, evidenceId: null, frequency: null, recency: null })
        : row(excel, { involvement, frequency: involvement === "PERFORMED" ? "WEEKLY" : null, recency: involvement === "PERFORMED" ? "CURRENT" : null, alsoDidSome: involvement === "SUPERVISED" ? false : null, detail: "Someone else does all our Excel work." });
      expect(run([excel], [r], { evidence: [skill] }).findings[0].verdict, involvement).toBe("supported");
    }
  });
  it("a free-text answer wins: the structured answer to the same question is ignored", () => {
    const freeText = new Set([keyForRequirement(hvac)]);
    const { findings, applied } = run([hvac], [row(hvac, { detail: words })], { freeText });
    expect(findings[0].verdict).toBe("insufficient_information");
    expect(applied.results[0].match?.ignored).toBe("free_text_counts");
  });
  it("'haven't done this' is today's denial: Not supported, from a deny record; a free-text answer still wins", () => {
    const denial = row(hvac, { involvement: "NOT_DONE", outcome: "DENIED", experienceId: null, evidenceId: null, frequency: null, recency: null });
    expect(run([hvac], [denial]).findings[0]).toMatchObject({ verdict: "gap", basis: "candidate_denied" });
    expect(structuredDenials([denial], new Set([keyForRequirement(hvac)]))).toEqual([]);
    expect(structuredDenials([{ ...denial, status: "REVOKED" }], new Set())).toEqual([]);
    expect(structuredDenials([{ ...denial, detail: "x" }], new Set())).toEqual([]);
  });
  it("rules-v22 isn't adopted: a dispatched-work description reads with the default reader", () => {
    const plumbing = req("Install and repair residential plumbing");
    const text = "My boss sends me out to install water heaters and fix leaks every day.";
    const { findings, applied } = run([plumbing], [row(plumbing, { detail: text, parts: ticked("A58") })]);
    expect(applied.results[0].match?.versions.reader).toBe("v21");
    expect(findings[0].verdict).toBe("insufficient_information");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("F-5: the title-only rule applies to a structured description exactly as to free text", () => {
  // The engine's own Stage 1c case (fw-082): credit resting only on a "Pharmacy Technician" title.
  const pharmacy = req("Order and manage pharmacy inventory", 0, "Experience");
  const tech: Evidence = { id: `experience:${ROLE}`, kind: "experience", job_title: "Pharmacy Technician", start_month: "2023-11", end_month: null, description: null };
  const theirs = "Our lead tech, Gloria, does the ordering from the wholesaler and handles the overstock returns. I fill and count.";
  const read = (answers: LinkedAnswer[], rows: StructuredRow[]) => {
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e05", provider: "rules", as_of_month: "2026-11", requirements: [pharmacy], evidence: [tech, answerItem(theirs)], ...(answers.length ? { linked_answers: answers } : {}) };
    const body = rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => applyStructuredAnswers(request, applyAnswers(request, f, answers, keyForRequirement), rows, new Set(), keyForRequirement).findings);
    return validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider: "rules", model: null }).findings[0];
  };
  it("the title alone gives Possible; a structured description giving the work to someone else takes it away, exactly as free text does", () => {
    expect(read([], []).verdict).toBe("possible");
    const free = read([{ action: "confirm", questionKey: keyForRequirement(pharmacy), evidenceId: `experience:${ANSWER}`, detail: theirs }], []);
    const structured = read([], [row(pharmacy, { detail: theirs })]);
    expect(free).toMatchObject({ verdict: "insufficient_information", basis: "candidate_answer", rulesOnlyVerdict: "possible" });
    expect(structured).toEqual(free);
  });
  it("supervising alone doesn't take it away, as for free text", () => {
    const own = "I train the new techs and check the inventory reports every week.";
    const structured = read([], [row(pharmacy, { involvement: "SUPERVISED", alsoDidSome: false, frequency: null, recency: null, detail: own })]);
    expect(structured.verdict).not.toBe("insufficient_information");
  });
  it("evidence of the work itself is never lowered", () => {
    const hvac = req("Repairing commercial HVAC systems");
    const fromWork = (f: RawFinding[]) => f.map(x => ({ ...x, verdict: "possible" as Verdict, basis: "described_in_work" as const, explanation: "Described in your work.", citations: [{ evidence_id: `experience:${ROLE}`, quote: "Answered phones" }] }));
    expect(run([hvac], [row(hvac, { detail: "Our HVAC techs do all of the repairs on commercial HVAC systems. I book their appointments." })], { base: fromWork }).findings[0].verdict).toBe("possible");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("all 33 approved splits, through the real readers and the validator", () => {
  type Row = { cid: string; kind: string; text: string; expected: { verdict: Verdict; transferAll: boolean } };
  const parity = (JSON.parse(readFileSync("tests/fixtures/split_recognition/parity.json", "utf8")) as { rows: Row[] }).rows;
  const ids = Object.keys(APPROVED_SPLITS);
  it.each(ids)("%s: every part shown and ticked → Supported, quoting the person's words; recognition version recorded", cid => {
    const text = parity.find(r => r.cid === cid && r.expected.verdict === "supported")!.text;
    const requirement = req(APPROVED_SPLITS[cid].requirement);
    const { findings, applied } = run([requirement], [row(requirement, { detail: text, parts: ticked(cid) })]);
    expect(findings[0]).toMatchObject({ verdict: "supported", basis: "candidate_answer" });
    expect(text).toContain(findings[0].citations[0].quote);
    expect(applied.recognitionVersion).toBe(RECOGNITION_VERSION);
  });
  it.each(ids)("%s: a part left unticked → Possible at most", cid => {
    const text = parity.find(r => r.cid === cid && r.expected.verdict === "supported")!.text;
    const requirement = req(APPROVED_SPLITS[cid].requirement);
    expect(run([requirement], [row(requirement, { detail: text, parts: ticked(cid, i => i !== 0) })]).findings[0].verdict).toBe("possible");
  });
  it.each(ids)("%s: a grouped question that includes it → nothing (F-7)", cid => {
    const text = parity.find(r => r.cid === cid && r.expected.verdict === "supported")!.text;
    const requirement = req(APPROVED_SPLITS[cid].requirement);
    const key = keyForRequirement(requirement);
    expect(run([requirement], [row(requirement, { detail: text, coveredKeys: [key, "another-key"], parts: [] })]).findings[0].verdict).toBe("insufficient_information");
  });
  it.each(ids)("%s: a lead choice stays Not enough information", cid => {
    const text = parity.find(r => r.cid === cid && r.expected.verdict === "supported")!.text;
    const requirement = req(APPROVED_SPLITS[cid].requirement);
    expect(run([requirement], [row(requirement, { involvement: "ASSISTED", alsoDidSome: false, frequency: null, recency: null, detail: text })]).findings[0].verdict).toBe("insufficient_information");
  });
  it("whole transfer (recognition: others did all of it) contradicts the tick; shared work is not whole transfer", () => {
    const transferred = parity.find(r => r.expected.transferAll)!;
    const requirement = req(APPROVED_SPLITS[transferred.cid].requirement);
    expect(run([requirement], [row(requirement, { detail: transferred.text, parts: ticked(transferred.cid) })]).findings[0].verdict).toBe("insufficient_information");
    // Shared participation: the person's own clause survives, so it is not whole transfer.
    const shared = parity.find(r => r.cid === transferred.cid && !r.expected.transferAll && r.expected.verdict !== "insufficient_information")!;
    expect(run([requirement], [row(requirement, { detail: shared.text, parts: ticked(transferred.cid) })]).findings[0].verdict).not.toBe("insufficient_information");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("freshness, masking and withholding", () => {
  const hvac = req("Repairing commercial HVAC systems");
  it("each structured answer counts by its own id (every correction is a new row); denials as deny records", () => {
    const a = row(hvac, { id: "00000000-0000-4000-8000-0000000000b1" });
    const d = row(req("Salesforce", 1), { involvement: "NOT_DONE", outcome: "DENIED", experienceId: null, evidenceId: null, frequency: null, recency: null, id: "00000000-0000-4000-8000-0000000000b2" });
    expect(structuredFingerprintAnswers([a, d], new Set())).toEqual([{ action: "deny", questionKey: d.questionKey }, { action: `structured:${a.id}`, questionKey: a.questionKey }]);
    expect(structuredFingerprintAnswers([{ ...a, status: "REVOKED" }], new Set())).toEqual([]);
  });
  const f = (requirementIndex: number, basis: Finding["basis"], evidenceId: string | null): Finding => ({ requirementIndex, verdict: basis === "candidate_denied" ? "gap" : "supported", explanation: "x", citations: evidenceId ? [{ evidenceId, quote: "q" }] : [], caveats: [], basis, evidenceSources: ["candidate_answer"] });
  const reqs = [hvac, req("Salesforce", 1), req("Excel", 2), req("Python", 3)];
  it("flag off: anything citing a structured answer, and a denial only a structured answer gave, is masked; the rest stands", () => {
    const mask = { evidence: new Set([`experience:${ANSWER}`]), denialKeys: new Set([keyForRequirement(reqs[1])]) };
    const findings = [f(0, "candidate_answer", `experience:${ANSWER}`), f(1, "candidate_denied", null), f(2, "listed_skill", "skill:x"), f(3, "candidate_denied", null)];
    const out = maskStructuredFindings(findings, reqs, mask, keyForRequirement);
    expect(out.map(x => x.verdict)).toEqual(["insufficient_information", "insufficient_information", "supported", "gap"]);
    expect(out[0]).toMatchObject({ citations: [], explanation: expect.stringMatching(/structured answer/) });
    expect(maskStructuredFindings(findings, reqs, NO_MASK, keyForRequirement)).toBe(findings);
  });
  it("a finding resting on a structured choice is always withheld; nothing else is touched", () => {
    const findings = [f(0, "candidate_choice", `choice:${ANSWER}`), f(2, "listed_skill", "skill:x")];
    const out = withholdChoiceFindings(findings);
    expect(out[0]).toMatchObject({ verdict: "insufficient_information", citations: [], explanation: expect.stringMatching(/isn't shown yet/) });
    expect(out[1]).toBe(findings[1]);
    expect(withholdChoiceFindings([findings[1]])).toEqual([findings[1]]);
  });
});
