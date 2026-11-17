import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { answerCitationIds, buildChoiceEvidence, choiceCitation, choiceEvidenceId, choiceEvidenceIsIntact, choiceStatement, citesLapsedAnswer, type ChoiceEvidence } from "@/lib/ai/choice-evidence";
import { evidenceFingerprint, quoteIsVerbatim, type Evidence, type MatchRequest, type MatchRequirement } from "@/lib/ai/evidence";
import { DEFAULT_TEXT_RULES, evidenceForAi, evidenceForRules } from "@/lib/ai/evidence-boundary";
import { RULE_BASES, validateMatchResponse } from "@/lib/ai/match-validation";
import { RULES_VERSION, rulesResponse, type RawFinding } from "@/lib/ai/rules/engine";
import { approvedSplitFor } from "@/lib/ai/rules/approved-split-link";
import { questionKey } from "@/lib/ai/rules/review-queue";
import type { Involvement, WorkFrequency, WorkRecency } from "@/lib/ai/rules/structured-answer";
import { CHOICES, FREQUENCIES, RECENCIES } from "@/lib/ai/rules/structured-form-spec";
import { matchStructuredAnswer, type StructuredAnswerRecord } from "@/lib/ai/rules/structured-matching";

// Phase 5.3 Stage F3 (F-4): `candidate_choice` citations. A structured choice is a self-reported claim, cited by its own
// `choice:` item with CareerOS's fixed wording: Possible at most, never Supported, never presented as the person's words.

const ANSWER = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
const CHOICE = buildChoiceEvidence({ id: ANSWER, involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" })!;
const req = (text: string, index = 0, category: MatchRequirement["category"] = "Skills"): MatchRequirement => ({ index, text, category, priority: "Required" });
const DESCRIPTION = "I repair rooftop units myself every week.";
const evidence: Evidence[] = [
  { id: "experience:00000000-0000-4000-8000-0000000000e1", kind: "experience", job_title: "Technician", start_month: "2020-01", end_month: null, description: "Answered phones." },
  { id: `experience:${ANSWER}`, kind: "experience", job_title: "Technician", start_month: "2020-01", end_month: null, description: DESCRIPTION, source: "clarification" },
];
const requirements = [req("Repairing commercial HVAC systems")];
const base: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e02", provider: "rules", as_of_month: "2026-11", requirements, evidence, structured_choices: [CHOICE] };
/** The rules' response with the first finding replaced, as F4's composition would produce it, then validated. */
function validate(finding: Record<string, unknown>, request: MatchRequest = base, provider: "rules" | "assisted" = "rules") {
  const body = rulesResponse(request, { provider, model: null, methodVersion: RULES_VERSION }, f => f.map((x, i) => (i === 0 ? ({ ...x, ...finding } as RawFinding) : x)));
  return validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider, model: null });
}
const choiceFinding = (extra: Record<string, unknown> = {}) => ({ verdict: "possible", basis: "candidate_choice", explanation: "You chose that you did this work yourself. A choice alone shows Possible at most.", citations: [choiceCitation(CHOICE)], caveats: [], rules_only_verdict: "insufficient_information", ...extra });

// ---------------------------------------------------------------------------------------------------------------------
describe("the choice evidence item", () => {
  it("has its own kind and id, and CareerOS's fixed wording, labelled self-reported and not verified", () => {
    expect(CHOICE).toEqual({ id: `choice:${ANSWER}`, kind: "choice", answer_id: ANSWER, involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT",
      statement: "Structured answer, self-reported: CareerOS hasn't independently verified it. Choice: I did this work myself. How often: Weekly. Most recently: It's part of my job now." });
    expect(choiceCitation(CHOICE)).toEqual({ evidence_id: `choice:${ANSWER}`, quote: CHOICE.statement });
  });
  it("every choice, frequency and recency has wording from the form's own labels; none claims verification", () => {
    for (const c of CHOICES.filter(x => x.value !== "NOT_DONE")) for (const f of [null, ...FREQUENCIES.map(x => x.value)]) for (const r of [null, ...RECENCIES.map(x => x.value)]) {
      const s = choiceStatement({ involvement: c.value, frequency: f as WorkFrequency | null, recency: r as WorkRecency | null });
      expect(s.startsWith("Structured answer, self-reported: CareerOS hasn't independently verified it. Choice: ")).toBe(true);
      expect(s).toContain(c.label);
      expect(s.length).toBeLessThanOrEqual(300);
      expect(s.replace("hasn't independently verified", "")).not.toMatch(/verified|confirmed|proven|certified/i);
    }
  });
  it("there is none for a 'haven't done this', a malformed answer, or an id that isn't an answer's", () => {
    expect(buildChoiceEvidence({ id: ANSWER, involvement: "NOT_DONE", frequency: null, recency: null })).toBeNull();
    expect(buildChoiceEvidence({ id: ANSWER, involvement: "DID_IT", frequency: null, recency: null })).toBeNull();
    expect(buildChoiceEvidence({ id: ANSWER, involvement: "PERFORMED", frequency: "HOURLY", recency: "CURRENT" })).toBeNull();
    expect(buildChoiceEvidence({ id: "not-a-uuid", involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" })).toBeNull();
    expect(buildChoiceEvidence({ id: `${ANSWER}:x`, involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" })).toBeNull();
  });
  it("an item is intact only if it's exactly what CareerOS builds (no edited id, wording or answer)", () => {
    expect(choiceEvidenceIsIntact(CHOICE)).toBe(true);
    expect(choiceEvidenceIsIntact({ ...CHOICE, statement: "I installed 400 water heaters." })).toBe(false);
    expect(choiceEvidenceIsIntact({ ...CHOICE, id: `choice:${OTHER}` })).toBe(false);
    expect(choiceEvidenceIsIntact({ ...CHOICE, answer_id: OTHER })).toBe(false);
    expect(choiceEvidenceIsIntact({ ...CHOICE, involvement: "SUPERVISED" })).toBe(false);
    expect(choiceEvidenceIsIntact({ ...CHOICE, kind: "experience" as never })).toBe(false);
  });
  it("it isn't evidence: the engine, AI providers and the fingerprint never see it", () => {
    expect(evidenceForRules(base.evidence).some(e => e.id.startsWith("choice:"))).toBe(false);
    expect(evidenceForAi(base.evidence).some(e => e.id.startsWith("choice:"))).toBe(false);
    expect(evidenceFingerprint(base.evidence)).toBe(evidenceFingerprint(evidence));
  });
  it("a choice citation lapses with its answer; deletion finds both of the answer's ids", () => {
    const lapsed = new Set([`experience:${ANSWER}`]);
    expect(citesLapsedAnswer(`choice:${ANSWER}`, lapsed)).toBe(true);
    expect(citesLapsedAnswer(`experience:${ANSWER}`, lapsed)).toBe(true);
    expect(citesLapsedAnswer(`choice:${OTHER}`, lapsed)).toBe(false);
    expect(citesLapsedAnswer(`skill:${ANSWER}`, lapsed)).toBe(false);
    expect(citesLapsedAnswer(`experience:${OTHER}`, lapsed)).toBe(false);
    expect(answerCitationIds(ANSWER)).toEqual([`experience:${ANSWER}`, choiceEvidenceId(ANSWER)]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("the validator: candidate_choice", () => {
  it("is a rule basis", () => expect(RULE_BASES).toContain("candidate_choice"));
  it("Possible with its own choice cited: valid, and marked as a choice, not the person's words", () => {
    const [f] = validate(choiceFinding()).findings;
    expect(f).toMatchObject({ verdict: "possible", basis: "candidate_choice", evidenceSources: ["candidate_choice"], citations: [{ evidenceId: `choice:${ANSWER}`, quote: CHOICE.statement }], rulesOnlyVerdict: "insufficient_information" });
  });
  it("also from the AI-assisted provider (the verdict is still the rules')", () => {
    expect(validate(choiceFinding(), base, "assisted").findings[0]).toMatchObject({ basis: "candidate_choice", method: "rules" });
  });
  it.each(["supported", "gap", "insufficient_information"])("never %s", verdict => {
    expect(() => validate(choiceFinding({ verdict }))).toThrow(/Possible at most|verdict without evidence|gap claimed/);
  });
  it("a choice can't justify Supported under any other basis either", () => {
    for (const basis of ["candidate_answer", "listed_skill", "described_in_work", "employment_dates", undefined]) {
      expect(() => validate(choiceFinding({ verdict: "supported", basis })), String(basis)).toThrow(/choice cited outside a choice result|an answer's result must cite/);
    }
  });
  it("a choice citation can't be added beside other evidence, under any basis", () => {
    const words = { evidence_id: `experience:${ANSWER}`, quote: "I repair rooftop units myself every week" };
    expect(() => validate(choiceFinding({ citations: [choiceCitation(CHOICE), words] }))).toThrow(/cite its choice, and only that/);
    expect(() => validate({ verdict: "possible", basis: "candidate_answer", citations: [words, choiceCitation(CHOICE)] })).toThrow(/choice cited outside a choice result/);
  });
  it("a choice result must cite a choice: the person's words, or profile text, can't stand in", () => {
    expect(() => validate(choiceFinding({ citations: [{ evidence_id: `experience:${ANSWER}`, quote: "I repair rooftop units myself every week" }] }))).toThrow(/cite its choice/);
    expect(() => validate(choiceFinding({ citations: [{ evidence_id: "experience:00000000-0000-4000-8000-0000000000e1", quote: "Technician" }] }))).toThrow(/cite its choice/);
    expect(() => validate(choiceFinding({ citations: [] }))).toThrow(/verdict without evidence/);
  });
  it("the quote must be the choice's own wording: never the person's words, never anything invented", () => {
    for (const quote of ["I repair rooftop units myself every week", "I did this work myself", "Structured answer, self-reported: CareerOS hasn't independently verified it.", `${CHOICE.statement} Verified.`]) {
      expect(() => validate(choiceFinding({ citations: [{ evidence_id: CHOICE.id, quote }] })), quote).toThrow(/quote the choice as CareerOS words it/);
    }
  });
  it("a choice that wasn't sent, or another answer's, is refused", () => {
    expect(() => validate(choiceFinding({ citations: [{ evidence_id: `choice:${OTHER}`, quote: CHOICE.statement }] }))).toThrow(/not sent/);
    expect(() => validate(choiceFinding(), { ...base, structured_choices: undefined })).toThrow(/not sent/);
    expect(() => validate(choiceFinding({ citations: [{ evidence_id: "choice:", quote: CHOICE.statement }] }))).toThrow(/not sent/);
  });
  it("tampered, duplicated or colliding choice items reject the whole response", () => {
    expect(() => validate(choiceFinding(), { ...base, structured_choices: [{ ...CHOICE, statement: "I installed 400 water heaters." }] })).toThrow(/invalid structured choice/);
    expect(() => validate(choiceFinding(), { ...base, structured_choices: [CHOICE, CHOICE] })).toThrow(/invalid structured choice/);
    const colliding: ChoiceEvidence = { ...CHOICE };
    const collide = { ...base, evidence: [...evidence, { id: colliding.id, kind: "skill", name: "x", proficiency: null } as Evidence] };
    expect(() => validate(choiceFinding(), collide)).toThrow(/invalid structured choice/);
  });
  it("language-model providers can never cite a choice", () => {
    const request: MatchRequest = { ...base, provider: "anthropic", budget: { max_input_tokens: 1000, max_output_tokens: 1000 } };
    const body = { request_id: request.request_id, provider: "anthropic", model: "m", method_version: "x", usage: { input_tokens: 1, output_tokens: 1 }, provider_request_id: null,
      findings: [{ requirement_index: 0, verdict: "possible", explanation: "x", citations: [choiceCitation(CHOICE)], caveats: [] }], verdict_counts: { supported: 0, possible: 1, gap: 0, insufficient_information: 0 } };
    expect(() => validateMatchResponse(request, body, { provider: "anthropic", model: "m" })).toThrow(/a structured choice cited outside a choice result/);
  });
  it("employment requirements: a choice is never employment evidence for Supported, and Possible stays Possible", () => {
    const request: MatchRequest = { ...base, requirements: [req("3+ years of residential plumbing experience", 0, "Experience")] };
    expect(validate(choiceFinding(), request).findings[0].verdict).toBe("possible");
    expect(() => validate(choiceFinding({ verdict: "supported" }), request)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("Supported keeps its verbatim requirement; existing citations are unchanged", () => {
  it("candidate_answer still needs the answer's own words, verbatim", () => {
    const words = { evidence_id: `experience:${ANSWER}`, quote: "I repair rooftop units myself every week" };
    expect(validate({ verdict: "supported", basis: "candidate_answer", citations: [words], rules_only_verdict: "insufficient_information" }).findings[0]).toMatchObject({ verdict: "supported", evidenceSources: ["candidate_answer"] });
    expect(() => validate({ verdict: "supported", basis: "candidate_answer", citations: [{ ...words, quote: "I repair rooftop units myself every day" }] })).toThrow(/not verbatim/);
    expect(() => validate({ verdict: "supported", basis: "candidate_answer", citations: [{ evidence_id: "experience:00000000-0000-4000-8000-0000000000e1", quote: "Answered phones" }] })).toThrow(/must cite that answer/);
  });
  it("a request with choices validates the rules' own findings exactly as one without", () => {
    const plainBody = rulesResponse({ ...base, structured_choices: undefined }, { provider: "rules", model: null, methodVersion: RULES_VERSION });
    const withBody = rulesResponse(base, { provider: "rules", model: null, methodVersion: RULES_VERSION });
    expect(JSON.stringify(withBody)).toBe(JSON.stringify(plainBody));
    expect(validateMatchResponse(base, JSON.parse(JSON.stringify(withBody)), { provider: "rules", model: null })).toEqual(validateMatchResponse({ ...base, structured_choices: undefined }, JSON.parse(JSON.stringify(plainBody)), { provider: "rules", model: null }));
  });
  it("the person's words cited as a choice (an experience item quoted with basis candidate_choice) are refused", () => {
    expect(quoteIsVerbatim(evidence[1], "I repair rooftop units myself every week")).toBe(true);
    expect(() => validate(choiceFinding({ citations: [{ evidence_id: `experience:${ANSWER}`, quote: "I repair rooftop units myself every week" }] }))).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("F2 → F3: what the pure module produces validates exactly as intended", () => {
  const requirement = req("Repairing commercial HVAC systems");
  const record = (extra: Partial<StructuredAnswerRecord> = {}): StructuredAnswerRecord => ({
    id: ANSWER, status: "ACTIVE", formVersion: 2, outcome: "ROLE_DETAIL_ADDED", involvement: "PERFORMED", alsoDidSome: null, frequency: "WEEKLY", recency: "CURRENT", claimedMonths: null,
    experienceId: "00000000-0000-4000-8000-0000000000e1", detail: null, evidenceId: `experience:${ANSWER}`, questionKey: questionKey(requirement.text, "work_detail"), coveredKeys: [questionKey(requirement.text, "work_detail")], parts: [], ...extra,
  });
  const asFinding = (m: ReturnType<typeof matchStructuredAnswer>, choice: ChoiceEvidence | null) => ({
    verdict: m.verdict, basis: m.basis, explanation: "From your structured answer.", caveats: [], rules_only_verdict: m.rulesOnlyVerdict,
    citations: m.basis === "candidate_choice" ? [choiceCitation(choice!)] : m.citation ? [{ evidence_id: m.citation.evidenceId, quote: m.citation.quote }] : [],
  });
  it("a choice alone: Possible, cited by its choice item, valid", () => {
    expect(approvedSplitFor(requirement.text)).toBeNull();
    const m = matchStructuredAnswer({ requirement, questionKey: questionKey(requirement.text, "work_detail"), finding: { verdict: "insufficient_information", basis: "no_evidence" }, answer: record(), role: { months: 60, endedMonthsAgo: null }, freeTextCounts: false, text: null, parts: null });
    expect(m).toMatchObject({ verdict: "possible", basis: "candidate_choice", citation: { evidenceId: CHOICE.id } });
    expect(validate(asFinding(m, CHOICE)).findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_choice", evidenceSources: ["candidate_choice"] });
  });
  it("Supported from the person's words: cited as candidate_answer, verbatim, valid", () => {
    const m = matchStructuredAnswer({ requirement, questionKey: questionKey(requirement.text, "work_detail"), finding: { verdict: "insufficient_information", basis: "no_evidence" }, answer: record({ detail: DESCRIPTION }), role: { months: 60, endedMonthsAgo: null }, freeTextCounts: false,
      text: { readerVersion: DEFAULT_TEXT_RULES, forText: DESCRIPTION, consistency: { state: "consistent", textShowsWork: true }, requirementReading: { verdict: "supported", quote: "I repair rooftop units myself every week" } }, parts: null });
    expect(m).toMatchObject({ verdict: "supported", basis: "candidate_answer" });
    expect(validate(asFinding(m, CHOICE)).findings[0]).toMatchObject({ verdict: "supported", basis: "candidate_answer", evidenceSources: ["candidate_answer"] });
  });
  it.each<[Involvement, WorkFrequency | null, WorkRecency | null]>([["PART", "WEEKLY", "CURRENT"], ["ASSISTED", null, null], ["TAUGHT", null, null], ["OBSERVED_TRAINED", null, null]])("%s alone: Possible, a valid choice citation", (involvement, frequency, recency) => {
    const choice = buildChoiceEvidence({ id: ANSWER, involvement, frequency, recency })!;
    const m = matchStructuredAnswer({ requirement: req("Microsoft Excel"), questionKey: questionKey("Microsoft Excel", "work_detail"), finding: { verdict: "insufficient_information", basis: "no_evidence" }, answer: record({ involvement, frequency, recency, alsoDidSome: ["ASSISTED", "TAUGHT"].includes(involvement) ? false : null, questionKey: questionKey("Microsoft Excel", "work_detail"), coveredKeys: [questionKey("Microsoft Excel", "work_detail")] }), role: { months: 60, endedMonthsAgo: null }, freeTextCounts: false, text: null, parts: null });
    expect(m.basis).toBe("candidate_choice");
    const request = { ...base, requirements: [req("Microsoft Excel")], structured_choices: [choice], evidence: [...evidence, { id: "skill:00000000-0000-4000-8000-0000000000f1", kind: "skill", name: "Word", proficiency: null } as Evidence] };
    expect(validate(asFinding(m, choice), request).findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_choice" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("connected in F5: only the rules pipeline builds choices; the page shows them safely", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(`${dir}/${f}`).isDirectory() ? (f === "generated" ? [] : walk(`${dir}/${f}`)) : [`${dir}/${f}`]));
  it("only the analysis pipeline and the F4/F5 composition build choices; only the rules request carries them", () => {
    const users = walk("src").filter(f => /buildChoiceEvidence\b|choiceCitation\s*\(|structured_choices\s*:/.test(readFileSync(f, "utf8"))).sort();
    expect(users).toEqual(["src/lib/ai/analysis.ts", "src/lib/ai/choice-evidence.ts", "src/lib/ai/rules/structured-apply.ts"]);
    expect(walk("src").filter(f => /structured_choices/.test(readFileSync(f, "utf8"))).sort()).toEqual(["src/lib/ai/analysis.ts", "src/lib/ai/evidence.ts", "src/lib/ai/match-validation.ts", "src/lib/ai/rules/structured-apply.ts"]);
    // Only for the rules: built when `usesRules`, and the AI request strips everything but evidence it may see.
    expect(readFileSync("src/lib/ai/analysis.ts", "utf8")).toMatch(/const choices = structured && usesRules \?/);
  });
  it("the match page labels a choice as the person's choice, never their profile or their words, and never crashes on an unknown source", () => {
    const page = readFileSync("src/app/dashboard/jobs/[id]/match/page.tsx", "utf8");
    expect(page).toContain('candidate_choice: "Applicant\'s structured answer. Self-reported: CareerOS hasn\'t independently verified it",');
    expect(page).toContain('if (prefix === "choice")');
    expect(page).toContain("From a choice you made in a structured answer, not from your own description.");
    expect(page).toMatch(/Object\.hasOwn\(EVIDENCE_SOURCE, prefix\)/);
    expect(page).not.toMatch(/choice-evidence|structured_choices/);
  });
});
