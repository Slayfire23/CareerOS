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
import { buildChoiceEvidence, choiceCitation, type ChoiceEvidence } from "@/lib/ai/choice-evidence";
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
  // As analysis.ts builds it (Stage F5): each structured answer's choice item, for the rules only.
  const choices = rows.map(buildChoiceEvidence).filter((c): c is ChoiceEvidence => !!c);
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e04", provider: "rules", as_of_month: "2026-11", requirements, evidence, ...(answers.length ? { linked_answers: answers } : {}), ...(choices.length ? { structured_choices: choices } : {}) };
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
  it("a choice alone: Possible, citing the choice in CareerOS's wording (candidate_choice), and valid (F5)", () => {
    const { findings, applied } = run([hvac], [row(hvac)]);
    const choice = buildChoiceEvidence(row(hvac))!;
    expect(findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_choice", evidenceSources: ["candidate_choice"], rulesOnlyVerdict: "insufficient_information", citations: [{ evidenceId: choice.id, quote: choice.statement }] });
    expect(findings[0].explanation).toMatch(/A choice on its own counts as Possible at most/);
    expect(applied.withheld).toBe(0);
  });
  it("a choice is never Supported, whatever the choice", () => {
    for (const [involvement, frequency, recency] of [["PERFORMED", "MOST_DAYS", "CURRENT"], ["PART", "WEEKLY", "CURRENT"], ["TAUGHT", null, null], ["ASSISTED", null, null]] as const) {
      const f = run([hvac], [row(hvac, { involvement, frequency, recency, alsoDidSome: ["TAUGHT", "ASSISTED"].includes(involvement) ? false : null })]).findings[0];
      expect(f.verdict, involvement).not.toBe("supported");
    }
  });
  it("without the choice item on the request (an AI request, or none built), nothing is stored", () => {
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e06", provider: "rules", as_of_month: "2026-11", requirements: [hvac], evidence: [role] };
    const applied = applyStructuredAnswers(request, [{ requirement_index: 0, verdict: "insufficient_information", explanation: "x", citations: [], caveats: [], basis: "no_evidence" }], [row(hvac)], new Set(), keyForRequirement);
    expect(applied.findings[0].verdict).toBe("insufficient_information");
    expect(applied.withheld).toBe(1);
  });
  it("other work (the consistency gap) never gives Supported; words are quoted only where the free-text reader would quote them", () => {
    const text = "I pick up parts for the HVAC techs.";
    const { findings } = run([hvac], [row(hvac, { detail: text })]);
    expect(findings[0].verdict).not.toBe("supported");
    // The same words as a free-text answer: the reader calls them related work (Possible), quoting the same words.
    const free = run([hvac], [], { evidence: [answerItem(text)], answers: [{ action: "confirm", questionKey: keyForRequirement(hvac), evidenceId: `experience:${ANSWER}`, detail: text }] }).findings[0];
    expect(findings[0].verdict).toBe(free.verdict);
    expect(findings[0].citations.map(c => c.quote)).toEqual(free.citations.map(c => c.quote));
  });
  it("a description of related or partial work: Possible, citing the words", () => {
    const { findings } = run([hvac], [row(hvac, { involvement: "PART", detail: words })]);
    expect(findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_answer" });
  });
  it("a description giving the work to others: never Supported, and its words never cited as support", () => {
    const { findings } = run([hvac], [row(hvac, { detail: "Our HVAC techs do all the repairs; I schedule their calls." })]);
    expect(findings[0].verdict).not.toBe("supported");
    expect(JSON.stringify(findings[0].citations)).not.toContain("schedule their calls");
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
  it("a stored choice finding is shown only if it is a Possible citing the current wording of an active answer", () => {
    const choice = buildChoiceEvidence({ id: ANSWER, involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" })!;
    const valid = new Map([[choice.id, choice.statement]]);
    const good: Finding = { requirementIndex: 0, verdict: "possible", explanation: "x", citations: [{ evidenceId: choice.id, quote: choice.statement }], caveats: [], basis: "candidate_choice", evidenceSources: ["candidate_choice"] };
    const other = f(2, "listed_skill", "skill:x");
    expect(withholdChoiceFindings([good, other], valid)).toEqual([good, other]);
    const bad: [string, Finding][] = [
      ["flag off (no valid choices)", good],
      ["Supported", { ...good, verdict: "supported" }],
      ["another basis", { ...good, basis: "candidate_answer" }],
      ["edited wording", { ...good, citations: [{ evidenceId: choice.id, quote: `${choice.statement} Verified.` }] }],
      ["an answer that no longer counts", { ...good, citations: [{ evidenceId: `choice:00000000-0000-4000-8000-0000000000ff`, quote: choice.statement }] }],
      ["beside other evidence", { ...good, citations: [...good.citations, { evidenceId: "skill:x", quote: "q" }] }],
      ["malformed id", { ...good, citations: [{ evidenceId: "choice:", quote: choice.statement }] }],
    ];
    for (const [why, finding] of bad) {
      const out = withholdChoiceFindings([finding, other], why.startsWith("flag off") ? new Map() : valid);
      expect(out[0], why).toMatchObject({ verdict: "insufficient_information", citations: [], explanation: expect.stringMatching(/has since changed/) });
      expect(out[1], why).toBe(other);
    }
    expect(choiceCitation(choice)).toEqual({ evidence_id: choice.id, quote: choice.statement });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("F6: partial experience is worded as partial, never as meeting the requirement", () => {
  const hvac = req("Personally performing HVAC repairs");
  const text = "I pick up parts for the HVAC techs.";
  const WORDING = /^Your (structured )?answer may describe experience with part of this requirement\. Please clarify which tasks you personally performed\.$/;
  it("free text and structured: Possible (unchanged), with the clarified wording and the person's exact words", () => {
    const structured = run([hvac], [row(hvac, { detail: text })]).findings[0];
    const free = run([hvac], [], { evidence: [answerItem(text)], answers: [{ action: "confirm", questionKey: keyForRequirement(hvac), evidenceId: `experience:${ANSWER}`, detail: text }] }).findings[0];
    for (const f of [structured, free]) {
      expect(f.verdict).toBe("possible");
      expect(f.explanation).toMatch(WORDING);
      expect(f.explanation).not.toMatch(/or part of what this asks for/);
      expect(f.citations.map(c => c.quote)).toEqual(["I pick up parts for the HVAC techs"]);
    }
    expect(structured.explanation.startsWith("Your structured answer")).toBe(true);
    expect(free.explanation.startsWith("Your answer")).toBe(true);
  });
  it("a description that shows the whole requirement still reads as doing the work (Supported is untouched)", () => {
    const words = "I repair commercial HVAC systems myself every week.";
    const f = run([req("Repairing commercial HVAC systems")], [row(req("Repairing commercial HVAC systems"), { detail: words })]).findings[0];
    expect(f).toMatchObject({ verdict: "supported", explanation: "Your structured answer describes doing this work yourself." });
  });
});

describe("F5: applicant-facing wording", () => {
  it("off: the Stage E wording, unchanged; on: may count after a re-run, never a promise; no technical terms", async () => {
    const { MATCH_EFFECT, matchEffect } = await import("@/lib/ai/rules/structured-form-spec");
    expect(matchEffect(false)).toBe("This kind of answer doesn't change the match yet.");
    expect(matchEffect(undefined)).toBe(MATCH_EFFECT.off);
    expect(matchEffect(true)).toBe("It can count toward the match when you run the analysis again, depending on what you describe.");
    for (const text of Object.values(MATCH_EFFECT)) {
      expect(text).not.toMatch(/\bwill\b|guarantee|improve|raise|formVersion|rule table|flag|structured matching|verified/i);
    }
  });
  it("choice results explain themselves without durations (the validator rejects unverified durations)", async () => {
    const source = readFileSync("src/lib/ai/rules/structured-apply.ts", "utf8");
    const block = source.slice(source.indexOf("const CHOICE_EXPLAIN"), source.indexOf("};", source.indexOf("const CHOICE_EXPLAIN")));
    expect(block).not.toMatch(/\d/);
    expect(block).toMatch(/Possible at most/);
  });
});
