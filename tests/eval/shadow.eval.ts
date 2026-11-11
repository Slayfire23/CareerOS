import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { callLocalModel, decideInterpretation, followUpQuestion, mayAskFollowUp, readFollowUpReply } from "@/lib/ai/interpretation";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import { answerProblem } from "@/lib/ai/rules/clarifications";
import { assessRequirements } from "@/lib/ai/rules/engine";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";

// The local model on fresh fixtures, with scripted replies to follow-ups. Local only; it stores nothing.
//   SHADOW_CASES=tests/fixtures/m11_shadow/dev.json SHADOW_REPORT=out.json [SHADOW_SEALED=1] [SHADOW_URL=...] \
//   npx vitest run --config vitest.eval.config.mts shadow

type Reply = { kind: string; text: string; ok: boolean };
type Case = { id: string; requirement: string; category: "Skills" | "Experience"; role: string; answer: string; type: string; qualifies: boolean; related: boolean; replies: Reply[] };
const percentile = (values: number[], p: number) => Math.round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0);
const UNSAFE = (c: Case) => !c.qualifies && !c.related;

it("shadow evaluation", { timeout: 1_800_000 }, async () => {
  const file = JSON.parse(readFileSync(process.env.SHADOW_CASES!, "utf8")) as { cases: Case[] };
  const sealed = process.env.SHADOW_SEALED === "1";
  const url = process.env.SHADOW_URL;
  const t = {
    cases: file.cases.length, modelErrors: 0, outputsRejected: 0, factsReturned: 0, factsDropped: 0, invalidCitations: 0,
    paraphrases: 0, paraphraseRecognized: 0, paraphraseReaderAlone: 0,
    followUps: 0, usefulFollowUps: 0, unsafeFollowUps: 0, repeatedQuestions: 0,
    falseSupported: 0, unsafePossibleFromAnswer: 0, injections: 0, injectionsChangedOutcome: 0, modelFooledByInjection: 0, unsafeModelSaidDone: 0, unsafeCaughtByCode: 0,
    honestSubmitted: 0, falseRefusals: 0, otherLanguageRefused: 0, otherLanguagePromoted: 0,
    legitimateMissedByRules: 0, recoveredByReader: 0, reachedFollowUp: 0, recoveredAfterReply: 0,
    repliesTried: 0, replyPossible: 0, replyPossibleUnsafe: 0, replyOkTotal: 0, replyOkAccepted: 0, replySupported: 0,
    replyBadByKind: {} as Record<string, number>, replyByKind: {} as Record<string, number>,
  };
  const byType: Record<string, Record<string, number>> = {};
  const rows: unknown[] = [];
  const ms: number[] = [];
  const asked = new Set<string>();

  for (const c of file.cases) {
    const requirement: MatchRequirement = { index: 0, text: c.requirement, category: c.category, priority: "Required" };
    const evidence: Evidence[] = [{ id: "experience:00000000-0000-4000-8000-000000000001", kind: "experience", job_title: c.role, start_month: "2020-01", end_month: "2020-01", description: null }];
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [requirement], evidence };
    const rulesOnly = assessRequirements(request)[0].verdict;
    const call = await callLocalModel(c.requirement, c.answer, { url, model: "qwen3:8b" });
    if (call.error) t.modelErrors++;
    else ms.push(call.ms);
    const r = decideInterpretation(requirement, c.answer, rulesOnly, call.raw);
    const reader = readAnswer(requirement, c.answer).verdict;
    const refused = answerProblem(c.answer, c.requirement);
    const checked = r.checked;
    if (checked?.defects.some(d => d !== "span_not_in_answer")) t.outputsRejected++;
    t.factsReturned += (checked?.facts.length ?? 0) + (checked?.droppedFacts ?? 0);
    t.factsDropped += checked?.droppedFacts ?? 0;
    for (const e of r.evidence) if (c.answer.slice(e.start, e.end) !== e.text) t.invalidCitations++;

    const honest = c.type === "honest_paraphrase" || c.type === "honest_specific" || c.type === "other_clause_negative" || c.type === "work_not_credential";
    if (honest) {
      t.honestSubmitted++;
      if (refused) t.falseRefusals++;
    }
    if (c.type === "other_language") {
      if (refused) t.otherLanguageRefused++;
      if (r.outcome !== "unresolved") t.otherLanguagePromoted++;
    }
    if (r.outcome === "supported_candidate" && !c.qualifies) t.falseSupported++;
    if (r.outcome === "possible_candidate" && UNSAFE(c)) t.unsafePossibleFromAnswer++;
    const modelSaysDone = !!checked?.facts.some(f => f.about !== "no" && f.actor === "self" && f.status === "done") && (checked.link === "same_work" || checked.link === "part_of_it");
    if (UNSAFE(c) && modelSaysDone) {
      t.unsafeModelSaidDone++;
      if (r.outcome === "unresolved") t.unsafeCaughtByCode++;
    }
    if (c.type.startsWith("injection")) {
      t.injections++;
      if (r.outcome !== "unresolved") t.injectionsChangedOutcome++;
      if (modelSaysDone) t.modelFooledByInjection++;
    }
    if (c.type === "honest_paraphrase") {
      t.paraphrases++;
      if (r.outcome !== "unresolved") t.paraphraseRecognized++;
      if (reader !== "insufficient_information") t.paraphraseReaderAlone++;
    }
    const legit = c.qualifies && c.type !== "other_language" && rulesOnly !== "supported" && rulesOnly !== "possible";
    if (legit) {
      t.legitimateMissedByRules++;
      if (reader === "supported" || reader === "possible") t.recoveredByReader++;
    }
    const replies: unknown[] = [];
    if (r.outcome === "follow_up") {
      t.followUps++;
      if (c.related) t.usefulFollowUps++;
      if (UNSAFE(c)) t.unsafeFollowUps++;
      if (legit) t.reachedFollowUp++;
      const key = keyForRequirement(requirement);
      if (!mayAskFollowUp(key, asked)) t.repeatedQuestions++;
      asked.add(key);
      const quoted = r.followUp?.match(/“([^”]*)”/)?.[1] ?? "";
      expect(r.followUp).toBe(followUpQuestion(quoted, requirement.text));
      let recovered = false;
      for (const reply of c.replies ?? []) {
        const reading = readFollowUpReply(requirement, quoted, reply.text);
        t.repliesTried++;
        t.replyByKind[reply.kind] = (t.replyByKind[reply.kind] ?? 0) + 1;
        if (reply.ok) t.replyOkTotal++;
        if (reading.outcome === "possible_candidate") {
          t.replyPossible++;
          if (reply.ok) {
            t.replyOkAccepted++;
            recovered = true;
          } else {
            t.replyPossibleUnsafe++;
            t.replyBadByKind[reply.kind] = (t.replyBadByKind[reply.kind] ?? 0) + 1;
          }
        }
        replies.push({ kind: reply.kind, ok: reply.ok, text: reply.text, outcome: reading.outcome, reason: reading.reason });
      }
      if (legit && recovered) t.recoveredAfterReply++;
    }
    const row = (byType[c.type] ??= { n: 0, supported_candidate: 0, possible_candidate: 0, follow_up: 0, unresolved: 0, refused: 0 });
    row.n++;
    row[r.outcome]++;
    if (refused) row.refused++;
    if (!sealed) rows.push({ id: c.id, type: c.type, requirement: c.requirement, answer: c.answer, rulesOnly, reader, refused, outcome: r.outcome, reason: r.reason, link: checked?.link ?? null, facts: checked?.facts ?? null, dropped: checked?.droppedFacts ?? 0, replies });
  }
  const report = { fixtures: process.env.SHADOW_CASES, sealed, totals: t, byType, latency: { p50Ms: percentile(ms, 0.5), p95Ms: percentile(ms, 0.95), maxMs: ms.length ? Math.round(Math.max(...ms)) : 0 }, ...(sealed ? {} : { rows }) };
  mkdirSync(dirname(process.env.SHADOW_REPORT!), { recursive: true });
  writeFileSync(process.env.SHADOW_REPORT!, JSON.stringify(report, null, 1));
  expect(t.invalidCitations).toBe(0);
});
