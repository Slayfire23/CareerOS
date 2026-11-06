import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest, MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { callLocalModel, decideInterpretation } from "@/lib/ai/interpretation";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import { answerProblem } from "@/lib/ai/rules/clarifications";
import { assessRequirements } from "@/lib/ai/rules/engine";
import { readFollowUpReply } from "@/lib/ai/rules/follow-up-reply";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";

// The follow-up workflow end to end on independent scenarios, scored against an independent labeler.
//   FOLLOWUP_SPLIT=dev|blind FOLLOWUP_REPORT=out.json [FOLLOWUP_SEALED=1] [FOLLOWUP_URL=...] \
//   npx vitest run --config vitest.eval.config.mts followup
// A sealed run writes counts only. The blind split is always run sealed until the owner's labels are in.

type Scenario = { id: string; split: string; requirement: string; category: "Skills" | "Experience"; role: string; role_months: number; answer: string; reply: string; type: string; reply_kind: string; evidence_group: string | null };
type Label = { id: string; answer_verdict: "supported" | "possible" | "not_enough" | "not_supported"; personally_did: boolean; reply_ok: boolean };
const percentile = (values: number[], p: number) => Math.round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0);
const month = (asOf: string, back: number) => {
  const [y, m] = asOf.split("-").map(Number);
  const index = y * 12 + (m - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

it("follow-up evaluation", { timeout: 1_800_000 }, async () => {
  const split = process.env.FOLLOWUP_SPLIT!;
  const sealed = process.env.FOLLOWUP_SEALED === "1" || split === "blind";
  const scenarios = (JSON.parse(readFileSync("tests/fixtures/m11_followup/scenarios.json", "utf8")).scenarios as Scenario[]).filter(s => s.split === split);
  const labels = new Map((JSON.parse(readFileSync("tests/fixtures/m11_followup/labels.json", "utf8")).labels as Label[]).map(l => [l.id, l]));
  const t = {
    scenarios: scenarios.length, modelErrors: 0, invalidCitations: 0,
    falseSupported: 0, unsafePossible: 0, unsafePossibleFromReply: 0,
    legitimate: 0, legitimateMissedByRules: 0, recoveredByReader: 0, recoveredByReply: 0, stillMissed: 0,
    honestSubmitted: 0, honestRefused: 0,
    followUps: 0, usefulFollowUps: 0, followUpsOnUnqualified: 0, repeatedQuestions: 0, repeatsAvoided: 0,
    replies: 0, repliesOk: 0, replyOkAccepted: 0, replyBadAccepted: 0, replyBadAcceptedByKind: {} as Record<string, number>,
    injections: 0, injectionsChangedOutcome: 0, nonEnglishPromoted: 0, paraphrases: 0, paraphrasesRecognized: 0,
    finalVerdicts: {} as Record<string, number>,
  };
  const ms: number[] = [];
  const rows: unknown[] = [];
  const askedKeys = new Set<string>();
  const askedGroups = new Set<string>();

  for (const s of scenarios) {
    const label = labels.get(s.id)!;
    const requirement: MatchRequirement = { index: 0, text: s.requirement, category: s.category, priority: "Required" };
    const evidence: Evidence[] = [{ id: "experience:00000000-0000-4000-8000-000000000001", kind: "experience", job_title: s.role, start_month: month("2026-11", Math.max(0, s.role_months - 1)), end_month: null, description: null }];
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [requirement], evidence };
    const rulesOnly = assessRequirements(request)[0].verdict;
    const refused = answerProblem(s.answer, s.requirement);
    const reader: Verdict = refused ? "insufficient_information" : readAnswer(requirement, s.answer).verdict;
    let final: Verdict = rulesOnly === "supported" || rulesOnly === "gap" ? rulesOnly : reader === "insufficient_information" ? rulesOnly : reader;
    let asked = false;
    let replyOutcome: string | null = null;
    let decision: string | null = null;
    if (!refused && final === "insufficient_information") {
      const call = await callLocalModel(s.requirement, s.answer, { url: process.env.FOLLOWUP_URL, model: "qwen3:8b" });
      if (call.error) t.modelErrors++;
      else ms.push(call.ms);
      const r = decideInterpretation(requirement, s.answer, rulesOnly, call.raw);
      decision = `${r.reason}/${r.checked?.link ?? "-"}/${(r.checked?.facts ?? []).map(f => `${f.actor}:${f.status}:${f.about}`).join(",")}/drop${r.checked?.droppedFacts ?? 0}`;
      for (const e of r.evidence) if (s.answer.slice(e.start, e.end) !== e.text) t.invalidCitations++;
      if (r.outcome === "follow_up" && r.followUpSpan) {
        const key = keyForRequirement(requirement);
        const group = s.evidence_group ? `group:${s.evidence_group}` : null;
        if (askedKeys.has(key) || (group && askedGroups.has(group))) t.repeatsAvoided++;
        else {
          asked = true;
          askedKeys.add(key);
          if (group) askedGroups.add(group);
        }
      }
      if (asked) {
        t.followUps++;
        if (label.personally_did || label.answer_verdict === "possible" || label.answer_verdict === "supported") t.usefulFollowUps++;
        else t.followUpsOnUnqualified++;
        if (s.reply.trim()) {
          const quoted = s.answer.slice(r.followUpSpan!.start, r.followUpSpan!.end);
          const reading = readFollowUpReply(requirement, quoted, s.reply);
          replyOutcome = reading.reason;
          t.replies++;
          if (label.reply_ok) t.repliesOk++;
          if (reading.outcome === "possible_candidate") {
            if (label.reply_ok) t.replyOkAccepted++;
            else {
              t.replyBadAccepted++;
              t.replyBadAcceptedByKind[s.reply_kind] = (t.replyBadAcceptedByKind[s.reply_kind] ?? 0) + 1;
            }
            final = "possible";
            if (!label.personally_did) t.unsafePossibleFromReply++;
          }
        }
      }
    }
    // A repeated question about the same work is one asked when it shouldn't be.
    if (asked && s.evidence_group && scenarios.some(o => o !== s && o.evidence_group === s.evidence_group && scenarios.indexOf(o) < scenarios.indexOf(s))) t.repeatedQuestions++;

    t.finalVerdicts[final] = (t.finalVerdicts[final] ?? 0) + 1;
    if (final === "supported" && label.answer_verdict !== "supported") t.falseSupported++;
    if (final === "possible" && !label.personally_did && (label.answer_verdict === "not_enough" || label.answer_verdict === "not_supported")) t.unsafePossible++;
    if (label.personally_did) {
      t.legitimate++;
      t.honestSubmitted++;
      if (refused) t.honestRefused++;
      if (rulesOnly !== "supported" && rulesOnly !== "possible") {
        t.legitimateMissedByRules++;
        if (reader === "supported" || reader === "possible") t.recoveredByReader++;
        else if (final === "possible") t.recoveredByReply++;
        else t.stillMissed++;
      }
    }
    if (s.type === "prompt_injection") {
      t.injections++;
      if (final !== rulesOnly) t.injectionsChangedOutcome++;
    }
    if (s.type === "multilingual" && final !== rulesOnly) t.nonEnglishPromoted++;
    if (s.type === "honest_paraphrase") {
      t.paraphrases++;
      if (final !== "insufficient_information" || asked) t.paraphrasesRecognized++;
    }
    if (!sealed) rows.push({ id: s.id, type: s.type, reply_kind: s.reply_kind, requirement: s.requirement, answer: s.answer, reply: s.reply, label, rulesOnly, refused, reader, asked, decision, replyOutcome, final });
  }
  const report = { split, sealed, totals: t, latency: { p50Ms: percentile(ms, 0.5), p95Ms: percentile(ms, 0.95), maxMs: ms.length ? Math.round(Math.max(...ms)) : 0, calls: ms.length }, ...(sealed ? {} : { rows }) };
  mkdirSync(dirname(process.env.FOLLOWUP_REPORT!), { recursive: true });
  writeFileSync(process.env.FOLLOWUP_REPORT!, JSON.stringify(report, null, 1));
  expect(t.invalidCitations).toBe(0);
});
