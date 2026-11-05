import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { callLocalModel, decideInterpretation } from "@/lib/ai/claims/interpret";
import type { Evidence, MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import { assessRequirements } from "@/lib/ai/rules/engine";

// Proof of concept: a local model on fresh fixtures, in shadow. Loopback only, and it stores nothing.
//   INTERPRET_CASES=tests/fixtures/m11_interpret/dev.json INTERPRET_REPORT=out.json [INTERPRET_SEALED=1] [INTERPRET_MODEL=qwen3:8b] \
//   npx vitest run --config vitest.eval.config.mts interpret

type Case = { id: string; requirement: string; category: "Skills" | "Experience"; role: string; role_months: number; answer: string; type: string; qualifies: boolean; related: boolean; must_not_claim: string[] };

const percentile = (values: number[], p: number) => Math.round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0);
const shell = (command: string) => {
  try { return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim(); } catch { return null; }
};
const gpuUsedMb = () => Number(shell("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits")?.split("\n")[0] ?? NaN);
const ollamaRamMb = () => Number(shell(`powershell -NoProfile -Command "(Get-Process ollama* | Measure-Object WorkingSet64 -Sum).Sum / 1MB"`) ?? NaN);

it("interpretation proof of concept", { timeout: 1_800_000 }, async () => {
  const file = JSON.parse(readFileSync(process.env.INTERPRET_CASES!, "utf8")) as { cases: Case[] };
  const sealed = process.env.INTERPRET_SEALED === "1";
  const model = process.env.INTERPRET_MODEL ?? "qwen3:8b";
  const idleGpu = gpuUsedMb();
  const coldStart = performance.now();
  await callLocalModel("warm up", "I did this.", { model, timeoutMs: 180_000 });
  const cold = Math.round(performance.now() - coldStart);
  const loaded = { gpuMb: gpuUsedMb(), ollamaRamMb: Math.round(ollamaRamMb()), ps: JSON.parse(shell("curl -s --max-time 5 http://127.0.0.1:11434/api/ps") ?? "{}") };

  const byType: Record<string, Record<string, number>> = {};
  const rows: unknown[] = [];
  const ms: number[] = [];
  const t = {
    cases: file.cases.length, droppedFields: {} as Record<string, number>, modelErrors: 0, outputsRejected: 0, factsReturned: 0, factsDropped: 0, casesWithDroppedFacts: 0, invalidEvidenceSpans: 0,
    honestParaphrases: 0, paraphraseFollowUp: 0, paraphrasePossible: 0, paraphraseSupported: 0, paraphraseReaderAlone: 0, paraphraseUnresolved: 0,
    qualifying: 0, missedByRules: 0, recoveredByReaderAlone: 0, reachedByInterpretation: 0,
    falseSupported: 0, unsafePossible: 0, unsafeFollowUp: 0, followUps: 0, followUpsFromRelatedWork: 0, injections: 0, injectionsEffective: 0, modelFooledByInjection: 0,
    unsafeModelSaidDone: 0, unsafeCaughtByCode: 0, nonEnglishPromoted: 0, ifModelTrusted: { possible: 0, possibleQualifying: 0, possibleUnsafe: 0 }, identicalOnRerun: 0, reruns: 0,
  };

  for (const [position, c] of file.cases.entries()) {
    const requirement: MatchRequirement = { index: 0, text: c.requirement, category: c.category, priority: "Required" };
    const evidence: Evidence[] = [{ id: "experience:00000000-0000-4000-8000-000000000001", kind: "experience", job_title: c.role, start_month: "2020-01", end_month: "2020-01", description: null }];
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [requirement], evidence };
    const rulesOnly = assessRequirements(request)[0].verdict;
    const call = await callLocalModel(c.requirement, c.answer, { model, url: process.env.INTERPRET_URL });
    if (call.error) t.modelErrors++;
    else ms.push(call.ms);
    const r = decideInterpretation(requirement, c.answer, rulesOnly, call.raw);
    const reader = readAnswer(requirement, c.answer).verdict;
    const checked = r.checked;
    if (checked?.defects.some(d => d !== "span_not_in_answer")) t.outputsRejected++;
    t.factsReturned += checked?.facts.length ?? 0;
    t.factsDropped += checked?.droppedFacts ?? 0;
    if (checked?.droppedFacts) t.casesWithDroppedFacts++;
    for (const [name, count] of Object.entries(checked?.droppedFields ?? {})) t.droppedFields[name] = (t.droppedFields[name] ?? 0) + count;
    for (const e of r.evidence) if (c.answer.slice(e.start, e.end) !== e.text) t.invalidEvidenceSpans++;

    const unsafe = !c.qualifies && !c.related;
    const modelSaysDone = !!checked?.facts.some(f => f.about !== "no" && f.actor === "self" && f.status === "done") && (checked.link === "same_work" || checked.link === "part_of_it");
    if (r.outcome === "supported_candidate" && !c.qualifies) t.falseSupported++;
    if (r.outcome === "possible_candidate" && unsafe) t.unsafePossible++;
    if (r.outcome === "follow_up") {
      t.followUps++;
      if (c.related) t.followUpsFromRelatedWork++;
      if (unsafe) t.unsafeFollowUp++;
    }
    if (unsafe && modelSaysDone) {
      t.unsafeModelSaidDone++;
      if (r.outcome === "unresolved") t.unsafeCaughtByCode++;
    }
    if (c.type === "injection") {
      t.injections++;
      if (r.outcome !== "unresolved") t.injectionsEffective++;
      if (modelSaysDone) t.modelFooledByInjection++;
    }
    if (c.type === "multilingual" && r.outcome !== "unresolved") t.nonEnglishPromoted++;
    if (c.type === "honest_paraphrase") {
      t.honestParaphrases++;
      if (r.outcome === "follow_up") t.paraphraseFollowUp++;
      else if (r.outcome === "possible_candidate") t.paraphrasePossible++;
      else if (r.outcome === "supported_candidate") t.paraphraseSupported++;
      else t.paraphraseUnresolved++;
      if (reader !== "insufficient_information") t.paraphraseReaderAlone++;
    }
    if (c.qualifies) {
      t.qualifying++;
      if (rulesOnly !== "supported" && rulesOnly !== "possible") {
        t.missedByRules++;
        if (reader === "supported" || reader === "possible") t.recoveredByReaderAlone++;
        if (r.outcome !== "unresolved") t.reachedByInterpretation++;
      }
    }
    // Never proposed, and never used: what would happen if the model's link were believed, for the owner's decision.
    if (r.reason === "only_the_model_says_so") {
      t.ifModelTrusted.possible++;
      if (c.qualifies) t.ifModelTrusted.possibleQualifying++;
      if (unsafe) t.ifModelTrusted.possibleUnsafe++;
    }
    if (position % 5 === 0) {
      t.reruns++;
      const again = await callLocalModel(c.requirement, c.answer, { model });
      if (again.raw === call.raw) t.identicalOnRerun++;
    }
    const row = (byType[c.type] ??= { n: 0, supported_candidate: 0, possible_candidate: 0, follow_up: 0, unresolved: 0, modelSaysDone: 0 });
    row.n++;
    row[r.outcome]++;
    if (modelSaysDone) row.modelSaysDone++;
    if (!sealed) rows.push({ id: c.id, type: c.type, requirement: c.requirement, answer: c.answer, rulesOnly, reader, outcome: r.outcome, reason: r.reason, followUp: r.followUp, link: checked?.link ?? null, facts: checked?.facts ?? null, dropped: checked?.droppedFacts ?? 0, ms: Math.round(call.ms) });
  }

  const report = {
    fixtures: process.env.INTERPRET_CASES, model, sealed, totals: t, byType,
    latency: { coldStartMs: cold, p50Ms: percentile(ms, 0.5), p95Ms: percentile(ms, 0.95), maxMs: Math.round(Math.max(...ms)) },
    memory: { idleGpuMb: idleGpu, loadedGpuMb: loaded.gpuMb, ollamaRamMb: loaded.ollamaRamMb, peakAfterRunGpuMb: gpuUsedMb(), loadedModel: (loaded.ps as { models?: { name: string; size: number; size_vram: number }[] }).models?.map(m => ({ name: m.name, sizeMb: Math.round(m.size / 1e6), vramMb: Math.round(m.size_vram / 1e6) })) ?? [] },
    ...(sealed ? {} : { rows }),
  };
  mkdirSync(dirname(process.env.INTERPRET_REPORT!), { recursive: true });
  writeFileSync(process.env.INTERPRET_REPORT!, JSON.stringify(report, null, 1));
  expect(t.invalidEvidenceSpans).toBe(0);
});
