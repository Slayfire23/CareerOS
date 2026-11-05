import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { quoteIsVerbatim, type Evidence, type MatchRequest, type MatchRequirement, type Verdict } from "@/lib/ai/evidence";
import { validateMatchResponse, type Finding } from "@/lib/ai/match-validation";
import { applyAnswers, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { answerProblem, entryProblem } from "@/lib/ai/rules/clarifications";
import { RULES_VERSION, rulesResponse } from "@/lib/ai/rules/engine";
import { buildReviewQueue, keyForRequirement, questionKey } from "@/lib/ai/rules/review-queue";

// Compares matching before and after clarification on scripted people. Pure: no database and no network.
//   REVIEW_CASES=tests/fixtures/m11_review/train.json REVIEW_REPORT=out.json [REVIEW_SEALED=1] \
//   npx vitest run --config vitest.eval.config.mts review
// REVIEW_SEALED writes counts only, for the split kept unseen.

type Answer = { type: string; action: "confirm" | "deny" | "skip"; detail: string | null; experience_id: string | null; credential: { qualification: string; institution: string; end_month: string } | null };
type Req = { text: string; category: string; priority: string; truly_qualified: boolean; answer?: Answer; acceptable_after: Verdict[] };
type Job = { id: string; persona: string; evidence: (Partial<Evidence> & { id: string; kind: string })[]; requirements: Req[]; second_job?: { text: string; category: string; priority: string; same_as: number | null }[] };
const DEFAULTS: Record<string, Record<string, unknown>> = {
  skill: { proficiency: null },
  experience: { end_month: null, description: null },
  education: { field_of_study: null, end_month: null, description: null },
  project: { description: null, contribution: null, results: null, skills: [] },
};
const expand = (short: string) => `${short.split(":")[0]}:00000000-0000-4000-8000-${short.split(":")[1].padStart(12, "0")}`;
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
const RANK: Record<Verdict, number> = { insufficient_information: 0, gap: 0, possible: 1, supported: 2 };
const matched = (v: Verdict) => v === "supported" || v === "possible";

function run(requirements: MatchRequirement[], evidence: Evidence[], answers: LinkedAnswer[], asOf: string) {
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: asOf, requirements, evidence, ...(answers.length ? { linked_answers: answers } : {}) };
  const body = rulesResponse(request, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => applyAnswers(request, f, answers, keyForRequirement));
  return validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider: "rules", model: null }).findings;
}

it("review evaluation", { timeout: 300_000 }, () => {
  const file = JSON.parse(readFileSync(process.env.REVIEW_CASES!, "utf8")) as { as_of_month: string; jobs: Job[] };
  const asOf = file.as_of_month;
  const sealed = process.env.REVIEW_SEALED === "1";
  const t = {
    jobs: file.jobs.length, requirements: 0,
    before: { acceptable: 0, supported: 0, falseSupported: 0, settled: 0, settledCorrect: 0 },
    after: { acceptable: 0, supported: 0, falseSupported: 0, overstatedSupported: 0, settled: 0 },
    truly: 0, trulyMissedBefore: 0, recoveredPossibleOrBetter: 0, recoveredSupported: 0, stillMissed: 0,
    questionsTotal: 0, questionsFirstScreen: [] as number[], answeredQuestions: 0, questionsResolved: 0, questionsMovedToSupportedOrNot: 0,
    honestSubmitted: 0, honestRefused: 0, vagueSubmitted: 0, vagueAccepted: 0, attacks: 0, attacksMovedVerdict: 0, attacksSaved: 0,
    invalidCitations: 0, repeatsPossible: 0, repeatsAvoided: 0, repeatsAskedAnyway: 0, differentQuestions: 0, wronglySuppressed: 0, notAskedOverLimit: 0,
  };
  const byType: Record<string, { n: number; acceptable: number; supported: number; falseSupported: number; before: number }> = {};
  const rows: unknown[] = [];

  for (const job of file.jobs) {
    const evidence: Evidence[] = job.evidence.map(e => ({ ...DEFAULTS[e.kind], ...e, id: expand(e.id) })) as Evidence[];
    const requirements: MatchRequirement[] = job.requirements.map((r, index) => ({ index, text: r.text, category: r.category as never, priority: (r.priority === "Required" || r.priority === "Preferred" ? r.priority : "Required") as never }));
    const baseline = run(requirements, evidence, [], asOf);
    const answers: LinkedAnswer[] = [];
    const answered = new Set<string>();
    const skipped = new Set<string>();
    let extra = 0;
    let findings: Finding[] = baseline;
    let screen = 0;
    for (let round = 0; round < 20; round++) {
      const queue = buildReviewQueue(requirements, findings, answered, skipped);
      if (round === 0) {
        screen = queue.questions.length;
        t.questionsFirstScreen.push(screen);
      }
      if (!queue.questions.length) break;
      const question = queue.questions[0];
      t.questionsTotal++;
      const before = findings;
      const scripted = question.requirementIndexes.map(i => job.requirements[i].answer).find(Boolean);
      const covered = question.keys;
      if (!scripted || scripted.action === "skip") {
        covered.forEach(k => skipped.add(k));
        continue;
      }
      t.answeredQuestions++;
      const honest = scripted.type.startsWith("honest");
      if (scripted.action === "deny") {
        covered.forEach(k => { answers.push({ action: "deny", questionKey: k }); answered.add(k); });
      } else if (scripted.credential) {
        const problem = entryProblem(scripted.credential.qualification, asOf, scripted.credential.end_month);
        if (problem) {
          if (honest || scripted.type === "credential") t.honestRefused += honest ? 1 : 0;
          covered.forEach(k => skipped.add(k));
        } else {
          evidence.push({ id: `education:00000000-0000-4000-8000-${String(900000 + extra++).padStart(12, "0")}`, kind: "education", qualification: scripted.credential.qualification, field_of_study: null, start_month: scripted.credential.end_month, end_month: scripted.credential.end_month, description: null, source: "clarification" });
          covered.forEach(k => answered.add(k));
        }
      } else {
        const detail = scripted.detail ?? "";
        if (honest) t.honestSubmitted++;
        if (scripted.type === "vague") t.vagueSubmitted++;
        const problem = answerProblem(detail, question.requirementTexts.join(" "));
        const role = evidence.find(e => e.id === (scripted.experience_id ? expand(scripted.experience_id) : "")) ?? evidence.find(e => e.kind === "experience");
        if (problem || !role || role.kind !== "experience") {
          if (honest && problem) t.honestRefused++;
          if (!sealed && honest && problem) rows.push({ refused: job.id, detail, problem });
          covered.forEach(k => skipped.add(k));
        } else {
          if (scripted.type === "vague") t.vagueAccepted++;
          if (scripted.type === "injection") t.attacksSaved++;
          const id = `experience:00000000-0000-4000-8000-${String(900000 + extra++).padStart(12, "0")}`;
          evidence.push({ id, kind: "experience", job_title: role.job_title, start_month: role.start_month, end_month: role.end_month, description: detail.trim().slice(0, 1000), source: "clarification" });
          covered.forEach(k => { answers.push({ action: "confirm", questionKey: k, evidenceId: id, detail }); answered.add(k); });
        }
      }
      findings = run(requirements, evidence, answers, asOf);
      const moved = question.requirementIndexes.filter(i => findings[i].verdict !== before[i].verdict);
      if (moved.length) t.questionsResolved++;
      if (moved.some(i => findings[i].verdict === "supported" || findings[i].verdict === "gap")) t.questionsMovedToSupportedOrNot++;
    }
    const lastQueue = buildReviewQueue(requirements, findings, answered, skipped, Number.MAX_SAFE_INTEGER);
    t.notAskedOverLimit += lastQueue.notShown;
    const byId = new Map(evidence.map(e => [e.id, e]));
    job.requirements.forEach((r, i) => {
      const b = baseline[i].verdict;
      const a = findings[i].verdict;
      t.requirements++;
      if (r.acceptable_after.includes(b)) t.before.acceptable++;
      if (b === "supported") t.before.supported++;
      if (b === "supported" && !r.acceptable_after.includes("supported")) t.before.falseSupported++;
      if (b === "supported" || b === "gap") {
        t.before.settled++;
        if (r.acceptable_after.includes(b) || !r.answer) t.before.settledCorrect++;
      }
      if (r.acceptable_after.includes(a)) t.after.acceptable++;
      if (a === "supported") t.after.supported++;
      if (a === "supported" || a === "gap") t.after.settled++;
      if (a === "supported" && !r.acceptable_after.includes("supported")) t.after.falseSupported++;
      if (a === "supported" && r.acceptable_after.includes("supported") && !r.truly_qualified) t.after.overstatedSupported++;
      if (r.truly_qualified) {
        t.truly++;
        if (!matched(b)) {
          t.trulyMissedBefore++;
          if (matched(a)) t.recoveredPossibleOrBetter++;
          if (a === "supported") t.recoveredSupported++;
          if (!matched(a)) t.stillMissed++;
        }
      }
      if (r.answer?.type === "injection") {
        t.attacks++;
        if (RANK[a] > RANK[b] && !r.acceptable_after.includes(a)) t.attacksMovedVerdict++;
      }
      for (const c of findings[i].citations) if (!quoteIsVerbatim(byId.get(c.evidenceId)!, c.quote)) t.invalidCitations++;
      const type = r.answer?.type ?? "no_answer";
      const row = (byType[type] ??= { n: 0, acceptable: 0, supported: 0, falseSupported: 0, before: 0 });
      row.n++;
      if (r.acceptable_after.includes(a)) row.acceptable++;
      if (r.acceptable_after.includes(b)) row.before++;
      if (a === "supported") row.supported++;
      if (a === "supported" && !r.acceptable_after.includes("supported")) row.falseSupported++;
      if (!sealed) rows.push({ job: job.id, persona: job.persona, text: r.text, category: r.category, type, detail: r.answer?.detail ?? null, truly: r.truly_qualified, before: b, after: a, basis: findings[i].basis, acceptable: r.acceptable_after, quote: findings[i].citations[0]?.quote ?? null });
    });
    // A later job: the same qualification in other words shouldn't be asked; a different one must be.
    for (const s of job.second_job ?? []) {
      const later: MatchRequirement = { index: 0, text: s.text, category: s.category as never, priority: "Required" };
      const key = keyForRequirement(later);
      if (s.same_as !== null) {
        const first = job.requirements[s.same_as];
        if (first?.answer?.action === "skip" || !first?.answer) continue;
        const firstKey = keyForRequirement({ index: 0, text: first.text, category: first.category as never, priority: "Required" });
        if (!answered.has(firstKey)) continue;
        t.repeatsPossible++;
        if (answered.has(key)) t.repeatsAvoided++;
        else {
          t.repeatsAskedAnyway++;
          if (!sealed) rows.push({ repeat: job.id, first: first.text, later: s.text });
        }
      } else {
        t.differentQuestions++;
        if (answered.has(key)) {
          t.wronglySuppressed++;
          if (!sealed) rows.push({ suppressed: job.id, later: s.text });
        }
      }
    }
  }
  void questionKey;
  mkdirSync(dirname(process.env.REVIEW_REPORT!), { recursive: true });
  const report = { fixtures: process.env.REVIEW_CASES, engine: RULES_VERSION, sealed, totals: t, questionsPerJob: { median: median(t.questionsFirstScreen), max: Math.max(...t.questionsFirstScreen) }, byType, ...(sealed ? {} : { rows }) };
  writeFileSync(process.env.REVIEW_REPORT!, `${JSON.stringify(report, null, 1)}\n`);
  expect(t.invalidCitations).toBe(0);
});
