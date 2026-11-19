import { createHash } from "node:crypto";
import { buildChoiceEvidence, type ChoiceEvidence } from "@/lib/ai/choice-evidence";
import type { Evidence, MatchRequest, MatchRequirement, Verdict as AppVerdict } from "@/lib/ai/evidence";
import { validateMatchResponse, type Finding } from "@/lib/ai/match-validation";
import { explicitRecency } from "@/lib/ai/requirement-structure";
import { applyAnswers, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { RULES_VERSION, rulesResponse } from "@/lib/ai/rules/engine";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";
import { applyStructuredAnswers, structuredDenials, type StructuredRow } from "@/lib/ai/rules/structured-apply";
import type { Involvement } from "@/lib/ai/rules/structured-answer";
import { assessConsistency } from "@/lib/ai/rules/structured-consistency";

// Phase 5.3 Stage G scorer for the compound-split evaluation (R4), exactly per
// docs/PHASE5_3_STAGE_G_EVAL_QUALITY_POLICY.md (v4). PURE: it reads no file and writes none. The runner
// (tests/eval/parts.eval.ts, the only code allowed to read the sealed folder) passes the data in after its gates, and writes
// the report this returns. The report holds counts, ids, classes, verdicts, codes and booleans only: never a scenario's
// text, explanation, reply, rationale, note or role description. Developed and tested on synthetic data only.

export type R4Verdict = "supported" | "possible" | "not_enough" | "not_supported";
export type R4Scenario = {
  id: string; category: string; split_id: string | null; language: string;
  requirement: { text: string; category: "Skills" | "Experience" };
  role: { title: string; months: number; description: string | null };
  answer: { involvement: string; also_did_some: boolean | null; frequency: string | null; recency: string | null; claimed_months: number | null; parts: { part: string; checked: boolean }[] | null; explanation: string | null };
  reply: string | null;
  writer_intended: { verdict: R4Verdict; parts_done: string[] | null; note: string };
};
export type R4Label = {
  id: string; verdict: R4Verdict; after_reply_verdict: R4Verdict | null;
  parts: { part: string; done: string; shown_by_own_text: boolean; contradicted: boolean }[] | null;
  personally_did: string; contradiction: boolean; needs_clarification: boolean; text_read: boolean; injection: boolean;
  named_tool_met: boolean | null; unsure: boolean; rationale: string;
};
export type CaseClass = "clear" | "disagreement" | "unsure";
export type SafetyCheck = "SC1" | "SC2" | "SC3" | "SC4" | "SC5" | "SC6" | "SC7";

export const SCORER_VERSION = "r4-scorer-v1";
const RANK: Record<R4Verdict, number> = { not_supported: 0, not_enough: 1, possible: 2, supported: 3 };
const CREDIT = (v: R4Verdict) => v === "supported" || v === "possible";
export const fromApp = (v: AppVerdict): R4Verdict => (v === "insufficient_information" ? "not_enough" : v === "gap" ? "not_supported" : v);
const DOING = ["PERFORMED", "PART"];
const LEADS = ["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT"];

/** G1: decided from stored fields only, before any output is computed. */
export function classify(s: Pick<R4Scenario, "writer_intended">, l: Pick<R4Label, "unsure" | "verdict">): CaseClass {
  if (l.unsure) return "unsure";
  return s.writer_intended.verdict === l.verdict ? "clear" : "disagreement";
}

// ---- G10: deterministic role dates (the scenarios carry months, never dates) --------------------------------------
const monthIndex = (m: string) => { const [y, n] = m.split("-").map(Number); return y * 12 + n - 1; };
const monthOf = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
/** Months since the role ended, from the stated recency only: CURRENT or none → still current; otherwise the lower bound
 * of the stated bucket (the most recent end it allows), so the harness never invents a role-date conflict. */
export const ENDED_MONTHS_AGO: Record<string, number | null> = { CURRENT: null, WITHIN_YEAR: 1, ONE_TO_THREE_YEARS: 12, OVER_THREE_YEARS: 36 };
export function roleDates(months: number, recency: string | null, asOf: string): { start_month: string; end_month: string | null; synthetic: boolean } {
  const ended = recency === null ? null : ENDED_MONTHS_AGO[recency] ?? null;
  const end = monthIndex(asOf) - (ended ?? 0);
  const span = Math.max(1, Math.trunc(months));
  return { start_month: monthOf(end - span + 1), end_month: ended === null ? null : monthOf(end), synthetic: true };
}

// ---- One scenario: candidate (v21, Stage F) and baseline (v20 free text), same requirement and role context --------
const uuidFrom = (seed: string) => { const h = createHash("sha256").update(seed).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export type CandidateOutput = {
  verdict: R4Verdict; rulesOnly: R4Verdict; basis: string | null; quoteVerbatim: boolean; citesAnswerWords: boolean;
  englishExplanation: boolean; consistency: string | null; split: boolean; partsShown: boolean[] | null;
  limits: string[]; ignored: string | null; validatorRejected: boolean;
  /** How the scenario was mapped onto the app's stored answer (§8.2 of the policy); non-empty means the mapping is limited. */
  mapping: string[];
};

function context(s: R4Scenario, asOf: string) {
  const roleId = uuidFrom(`role:${s.id}`);
  const answerId = uuidFrom(`answer:${s.id}`);
  const dates = roleDates(s.role.months, s.answer.recency, asOf);
  const requirement: MatchRequirement = { index: 0, text: s.requirement.text, category: s.requirement.category, priority: "Required" };
  const role: Evidence = { id: `experience:${roleId}`, kind: "experience", job_title: s.role.title, start_month: dates.start_month, end_month: dates.end_month, description: s.role.description };
  const explanation = s.answer.explanation?.trim() ? s.answer.explanation.slice(0, 1000) : null;
  return { roleId, answerId, requirement, role, explanation, dates };
}

/** The candidate: the Stage F pipeline as the app runs it with STRUCTURED_MATCHING_ENABLED on, then the validator. */
export function candidateFor(s: R4Scenario, asOf: string): CandidateOutput {
  const { roleId, answerId, requirement, role, explanation } = context(s, asOf);
  const key = keyForRequirement(requirement);
  const mapping: string[] = [];
  let involvement = s.answer.involvement;
  const alsoDidSome = s.answer.also_did_some;
  // As the form stores it: "led it, and also did some" is PART with alsoDidSome.
  if (LEADS.includes(involvement) && alsoDidSome === true) { involvement = "PART"; mapping.push("lead_also_as_part"); }
  const denial = involvement === "NOT_DONE";
  // As the app stores answers: a denial keeps no words; parts are stored only for "did it myself" / "did some of it".
  if (denial && explanation) mapping.push("denial_text_dropped");
  const doing = DOING.includes(involvement);
  if (!doing && s.answer.parts?.length) mapping.push("parts_not_stored_for_choice");
  const detail = denial ? null : explanation;
  const row: StructuredRow = {
    id: answerId, status: "ACTIVE", formVersion: 2, outcome: denial ? "DENIED" : "ROLE_DETAIL_ADDED", involvement, alsoDidSome,
    frequency: s.answer.frequency, recency: s.answer.recency, claimedMonths: s.answer.claimed_months,
    experienceId: denial ? null : roleId, detail, evidenceId: denial ? null : `experience:${answerId}`, questionKey: key, coveredKeys: [key],
    parts: doing ? (s.answer.parts ?? []).map((p, partIndex) => ({ partIndex, partText: p.part, checked: p.checked })) : [],
  };
  const evidence: Evidence[] = [role, ...(detail ? [{ ...role, id: `experience:${answerId}`, description: detail, source: "clarification" as const }] : [])];
  const choice = buildChoiceEvidence(row);
  const denials: LinkedAnswer[] = structuredDenials([row], new Set());
  const request: MatchRequest = {
    request_id: uuidFrom(`request:${s.id}`), provider: "rules", as_of_month: asOf, requirements: [requirement], evidence,
    ...(denials.length ? { linked_answers: denials } : {}), ...(choice ? { structured_choices: [choice as ChoiceEvidence] } : {}),
  };
  const rulesOnly = fromApp(rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }).findings[0].verdict);
  let applied: ReturnType<typeof applyStructuredAnswers> | null = null;
  const body = rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => {
    applied = applyStructuredAnswers(request, applyAnswers(request, f, denials, keyForRequirement), denial ? [] : [row], new Set(), keyForRequirement);
    return applied.findings;
  });
  let finding: Finding | null = null;
  let validatorRejected = false;
  try { finding = validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider: "rules", model: null }).findings[0]; }
  catch { validatorRejected = true; }
  const match = (applied as ReturnType<typeof applyStructuredAnswers> | null)?.results[0]?.match ?? null;
  const verdict = finding ? fromApp(finding.verdict) : rulesOnly;
  const quote = finding?.citations.find(c => c.evidenceId === `experience:${answerId}`)?.quote ?? null;
  return {
    verdict, rulesOnly, basis: finding?.basis ?? null,
    quoteVerbatim: !!quote && !!detail && detail.includes(quote),
    citesAnswerWords: !!finding?.citations.some(c => c.evidenceId === `experience:${answerId}`),
    englishExplanation: !!detail && s.language === "en",
    consistency: detail && !denial ? assessConsistency({ requirement, involvement: involvement as Involvement, explanation: detail }).consistency.state : null,
    split: !!match?.split, partsShown: match?.split ? match.split.parts.map(p => p.shown) : null,
    limits: match?.reading?.limits ?? [], ignored: match?.ignored ?? null, validatorRejected, mapping,
  };
}

/** The frozen v20 baseline (G9): the explanation read as a free-text answer with rules-v20; no structured-choice credit;
 * the same requirement and role context. */
export function baselineFor(s: R4Scenario, asOf: string): R4Verdict {
  const { answerId, requirement, role, explanation } = context(s, asOf);
  const evidence: Evidence[] = [role, ...(explanation ? [{ ...role, id: `experience:${answerId}`, description: explanation, source: "clarification" as const }] : [])];
  const linked: LinkedAnswer[] = explanation ? [{ action: "confirm", questionKey: keyForRequirement(requirement), evidenceId: `experience:${answerId}`, detail: explanation }] : [];
  const request: MatchRequest = { request_id: uuidFrom(`baseline:${s.id}`), provider: "rules", as_of_month: asOf, requirements: [requirement], evidence, ...(linked.length ? { linked_answers: linked } : {}) };
  const body = rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => applyAnswers(request, f, linked, keyForRequirement, { textRules: "v20" }));
  return fromApp(body.findings[0].verdict);
}

// ---- G2: the seven objective safety checks (policy §4) -----------------------------------------------------------
export function safetyViolations(s: R4Scenario, l: R4Label, c: CandidateOutput, stage: "pre" | "post"): SafetyCheck[] {
  const labelVerdict = stage === "post" ? l.after_reply_verdict ?? l.verdict : l.verdict;
  const out: SafetyCheck[] = [];
  const supported = c.verdict === "supported";
  if (supported && labelVerdict !== "supported") out.push("SC1");
  if (supported && (!c.englishExplanation || c.basis !== "candidate_answer" || !c.quoteVerbatim)) out.push("SC2");
  const contradictedPartCounted = !!l.parts && !!s.answer.parts && l.parts.some((p, i) => p.contradicted && s.answer.parts![i]?.checked && c.partsShown?.[i] === true);
  if (contradictedPartCounted || (l.contradiction && RANK[c.verdict] > RANK[labelVerdict])) out.push("SC3");
  if (l.injection && CREDIT(c.verdict)) out.push("SC4");
  if (l.personally_did === "no" && CREDIT(c.verdict)) out.push("SC5");
  if (s.split_id !== null && supported && ((s.answer.parts ?? []).some(p => !p.checked) || (l.parts ?? []).some(p => !p.shown_by_own_text || p.done !== "yes"))) out.push("SC6");
  if (s.language !== "en" && (supported || c.citesAnswerWords || (c.consistency !== null && c.consistency !== "text_unread") || (c.partsShown ?? []).some(Boolean))) out.push("SC7");
  return out;
}

// ---- Scoring -------------------------------------------------------------------------------------------------------
const VERDICTS: R4Verdict[] = ["supported", "possible", "not_enough", "not_supported"];
const emptyMatrix = () => Object.fromEntries(VERDICTS.map(a => [a, Object.fromEntries(VERDICTS.map(b => [b, 0]))])) as Record<R4Verdict, Record<R4Verdict, number>>;
export const G4_THRESHOLD = 0.9;

export type R4Report = ReturnType<typeof score>;

/** The systems under evaluation. Tests may substitute synthetic outputs to prove each gate fails; the runner
 *  (parts.eval.ts) never passes this argument, so the frozen candidate and baseline are always used there. */
export type Systems = { candidate: (s: R4Scenario, asOf: string) => CandidateOutput; baseline: (s: R4Scenario, asOf: string) => R4Verdict };
const FROZEN_SYSTEMS: Systems = { candidate: candidateFor, baseline: baselineFor };

export function score(scenarios: R4Scenario[], labels: R4Label[], asOf: string, systems: Systems = FROZEN_SYSTEMS) {
  const byId = new Map(labels.map(l => [l.id, l]));
  const missing = scenarios.filter(s => !byId.has(s.id)).map(s => s.id);
  if (missing.length || labels.length !== scenarios.length) throw new Error(`Refusing: labels don't match scenarios (${missing.length} missing).`);
  // 1. Classes first, from stored fields only.
  const classes = new Map(scenarios.map(s => [s.id, classify(s, byId.get(s.id)!)]));
  // 2. Then the systems.
  const rows = scenarios.map(s => {
    const l = byId.get(s.id)!;
    const candidate = systems.candidate(s, asOf);
    const baseline = systems.baseline(s, asOf);
    return { s, l, cls: classes.get(s.id)!, candidate, baseline };
  });
  const confusion: Record<CaseClass, ReturnType<typeof emptyMatrix>> = { clear: emptyMatrix(), disagreement: emptyMatrix(), unsure: emptyMatrix() };
  for (const r of rows) confusion[r.cls][r.l.verdict][r.candidate.verdict]++;
  // 3. Safety: every scenario, both stages for those with a reply (G8). Stage F reads no follow-up reply for a
  // structured answer, so the candidate's post-reply verdict is its pre-reply verdict.
  const safety = rows.flatMap(r => [
    ...safetyViolations(r.s, r.l, r.candidate, "pre").map(check => ({ id: r.s.id, class: r.cls, stage: "pre" as const, check })),
    ...(r.s.reply && r.l.after_reply_verdict ? safetyViolations(r.s, r.l, r.candidate, "post").map(check => ({ id: r.s.id, class: r.cls, stage: "post" as const, check })) : []),
  ]);
  // G4 (clear only): labeled Supported or Possible, recognized as Supported or Possible; not_enough never counts.
  const g4Pool = rows.filter(r => r.cls === "clear" && CREDIT(r.l.verdict));
  const recognized = g4Pool.filter(r => CREDIT(r.candidate.verdict)).length;
  const supportedLabeled = rows.filter(r => r.cls === "clear" && r.l.verdict === "supported");
  // G6: a loss is any baseline credit the candidate lowers; justified only when the label is at or below the candidate.
  const losses = rows.filter(r => CREDIT(r.baseline) && RANK[r.candidate.verdict] < RANK[r.baseline]).map(r => ({
    id: r.s.id, class: r.cls, label: r.l.verdict, baseline: r.baseline, candidate: r.candidate.verdict,
    justified: RANK[r.l.verdict] <= RANK[r.candidate.verdict], limits: r.candidate.limits,
  }));
  const unjustifiedGated = losses.filter(x => !x.justified && x.class !== "unsure");
  // A5: unsplit controls never take split recognition.
  const controls = rows.filter(r => r.s.split_id === null);
  const controlsSplitFree = controls.every(r => !r.candidate.split && r.candidate.partsShown === null);
  const replies = rows.filter(r => r.s.reply && r.l.after_reply_verdict).map(r => ({ id: r.s.id, class: r.cls, preLabel: r.l.verdict, postLabel: r.l.after_reply_verdict!, candidate: r.candidate.verdict }));
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const report = {
    scorer: SCORER_VERSION, asOf, scenarios: scenarios.length,
    classes: { clear: count(r => r.cls === "clear"), disagreement: count(r => r.cls === "disagreement"), unsure: count(r => r.cls === "unsure") },
    confusion,
    g4: { pool: g4Pool.length, recognized, rate: g4Pool.length ? recognized / g4Pool.length : null, threshold: G4_THRESHOLD, pass: g4Pool.length > 0 && recognized / g4Pool.length >= G4_THRESHOLD,
      exactSupported: { labeled: supportedLabeled.length, agreed: supportedLabeled.filter(r => r.candidate.verdict === "supported").length } },
    g6: { losses, unjustifiedGated: unjustifiedGated.length, unjustifiedUnsure: losses.filter(x => !x.justified && x.class === "unsure").length, pass: unjustifiedGated.length === 0 },
    safety: { violations: safety, pass: safety.length === 0 },
    a5: { controls: controls.length, splitFree: controlsSplitFree, pass: controlsSplitFree },
    replies: { count: replies.length, rows: replies, candidatePostEqualsPre: true },
    validatorRejected: rows.filter(r => r.candidate.validatorRejected).map(r => r.s.id),
    perScenario: rows.map(r => ({ id: r.s.id, class: r.cls, label: r.l.verdict, candidate: r.candidate.verdict, baseline: r.baseline, rulesOnly: r.candidate.rulesOnly, basis: r.candidate.basis, ignored: r.candidate.ignored, mapping: r.candidate.mapping })),
    limited: {
      mappingLimited: count(r => r.candidate.mapping.length > 0),
      byMapping: rows.reduce<Record<string, number>>((m, r) => { for (const k of r.candidate.mapping) m[k] = (m[k] ?? 0) + 1; return m; }, {}),
      recencyRequirements: count(r => explicitRecency(r.s.requirement.text).asks),
      syntheticRoleDates: true,
    },
  };
  return { ...report, pass: report.g4.pass && report.g6.pass && report.safety.pass && report.a5.pass && report.validatorRejected.length === 0 };
}

// ---- Integrity and the unseal gate (pure, so they can be tested without sealed data) --------------------------------
export const lfSha256 = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
export function integrityOf(contents: Record<string, string>, manifest: { files: Record<string, string>; combined: string }, files: readonly string[]) {
  const actual = Object.fromEntries(files.map(f => [f, lfSha256(contents[f] ?? "")]));
  const combined = lfSha256(files.map(f => `${f}:${actual[f]}`).join("\n"));
  return { actual, combined, ok: files.every(f => contents[f] !== undefined && manifest.files[f] === actual[f]) && manifest.combined === combined };
}

export const APPROVAL_FILE = "docs/PHASE5_3_STAGE_G_APPROVAL.json";
export type UnsealInput = {
  unsealFlag: boolean; freezeCommit: string | undefined; dirty: boolean; changedSinceFreeze: string[];
  integrityOk: boolean; policySha256: string; approval: { freezeCommit: string; policySha256: string } | null;
};
/** Null when every gate passes; otherwise why it refuses. The approval record is written only after the owner's explicit
 * approval, in a commit after the freeze that changes nothing but that file. */
export function unsealRefusal(g: UnsealInput): string | null {
  if (!g.unsealFlag) return "Refusing: PARTS_UNSEAL=1 is required.";
  if (!g.freezeCommit || !/^[0-9a-f]{40}$/.test(g.freezeCommit)) return "Refusing: PARTS_FREEZE_COMMIT must name the frozen commit (full hash).";
  if (g.dirty) return "Refusing: the working tree must be clean at the freeze.";
  if (g.changedSinceFreeze.some(f => f !== APPROVAL_FILE)) return "Refusing: code changed since the freeze commit.";
  if (!g.integrityOk) return "Refusing: the sealed files don't match MANIFEST.json.";
  if (!g.approval) return `Refusing: Stage G scoring needs the owner's recorded approval (${APPROVAL_FILE}).`;
  if (g.approval.freezeCommit !== g.freezeCommit) return "Refusing: the approval names a different freeze commit.";
  if (g.approval.policySha256 !== g.policySha256) return "Refusing: the approval names a different policy version.";
  return null;
}
