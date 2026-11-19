import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "dotenv";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { callSuggestService } from "@/lib/ai/client";
import { quoteIsVerbatim, type Evidence, type MatchRequest } from "@/lib/ai/evidence";
import { validateMatchResponse, type Finding, type Suggestion } from "@/lib/ai/match-validation";
import { RULES_VERSION, assessRequirements, rulesResponse } from "@/lib/ai/rules/engine";
import { ASSIST_PROMPT_VERSION, buildSuggestRequest, checkPointers, parseSuggestResponse, sendableRequirements } from "@/lib/ai/rules/suggestions";

// Evaluates the workflow the app really runs: the TypeScript rules, then, when asked, the local bridge
// and every suggestion check. Fictional data only. Free: nothing goes beyond this machine.
//
//   EVAL_CASES=ai-service/evals/holdout_g_cases.json EVAL_MODE=rules|assisted|offline|closed_port \
//   EVAL_RUNS=3 EVAL_REPORT=ai-service/evals/reports/m7/g-rules.json \
//   npx vitest run --config vitest.eval.config.mts
//
// rules: no network. offline: every network call throws, and rules must still answer. closed_port: the
// bridge is unreachable, as when the laptop is off. assisted: the real bridge and Ollama.

const MODEL = "qwen3:8b";
const RANK: Record<string, number> = { insufficient_information: 0, gap: 0, possible: 1, supported: 2 };
type RawRequirement = { text: string; category: string; priority: string; allowed: string[]; injection_target?: boolean; suggest_ok?: string[]; gap_ok?: boolean; confirmed?: true };
type RawCase = { id: string; group?: string; fictional: boolean; injection?: boolean; requirements: RawRequirement[]; evidence: (Record<string, unknown> & { id: string })[] };
const expand = (short: string) => {
  const [kind, number] = short.split(":");
  return `${kind}:00000000-0000-4000-8000-${number.padStart(12, "0")}`;
};
const DEFAULTS: Record<string, Record<string, unknown>> = {
  skill: { proficiency: null },
  experience: { end_month: null, description: null },
  education: { field_of_study: null, end_month: null, description: null },
  project: { description: null, contribution: null, results: null, skills: [] },
};

function loadCases(path: string) {
  const data = JSON.parse(readFileSync(path, "utf8")) as { fictional: boolean; as_of_month: string; cases: RawCase[] };
  if (data.fictional !== true) throw new Error("The evaluation file must be marked fictional.");
  return data.cases.map(raw => {
    if (raw.fictional !== true) throw new Error(`Case ${raw.id} is not marked fictional.`);
    const request: MatchRequest = {
      request_id: randomUUID(), provider: "rules", as_of_month: data.as_of_month,
      requirements: raw.requirements.map((r, index) => ({ index, text: r.text, category: r.category, priority: r.priority, ...(r.confirmed ? { confirmed: true } : {}) })) as MatchRequest["requirements"],
      evidence: raw.evidence.map(e => ({ ...DEFAULTS[e.kind as string], ...e, id: expand(e.id) })) as unknown as Evidence[],
    };
    return { raw, request };
  });
}

function classify(s: Suggestion, label: RawRequirement) {
  if (label.suggest_ok === undefined && label.gap_ok === undefined) return "unlabeled";
  if (s.kind === "profile_gap") return label.gap_ok ? "useful" : "misleading";
  const quote = s.citation!.quote.toLowerCase();
  return (label.suggest_ok ?? []).some(ok => quote.includes(ok.toLowerCase())) ? "useful" : "misleading";
}

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.round(fraction * (ordered.length - 1)))];
};
const seconds = (ms: number) => Math.round(ms) / 1000;

function sampleResources() {
  const sample: Record<string, number> = {};
  try {
    const used = execFileSync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 15000 });
    sample.vram_used_mb = Number(used.trim().split(/\s+/)[0]);
  } catch { /* no GPU tool */ }
  return sample;
}

it("evaluates", { timeout: 3_600_000 }, async () => {
  const mode = process.env.EVAL_MODE ?? "rules";
  const runs = Number(process.env.EVAL_RUNS ?? (mode === "assisted" ? 3 : 1));
  const cases = loadCases(process.env.EVAL_CASES ?? "ai-service/evals/cases.json");
  const secret = parse(readFileSync("ai-service/.env")).AI_SERVICE_SECRET;
  const service = { serviceUrl: mode === "closed_port" ? "http://127.0.0.1:11998" : "http://127.0.0.1:8010", secret };
  if (mode === "offline") vi.stubGlobal("fetch", vi.fn(() => { throw new Error("offline: no network"); }));

  const totals = { tooFavorable: 0, tooCautious: 0, judged: 0, agree: 0, falseSupported: 0, injectionsChanged: 0, legitMissed: 0, invalidCitations: 0, flaggedLegit: 0, flaggedInjection: 0, analyses: 0, answered: 0 };
  const byGroup: Record<string, [number, number]> = {};
  const disagreements = new Map<string, Record<string, unknown>>();
  const quality = { useful: 0, misleading: 0, unlabeled: 0 };
  const byKind: Record<string, number> = {};
  const rejectedReasons: Record<string, number> = {};
  const misleading = new Map<string, number>();
  const assist: Record<string, number> = {};
  const ruleTimes: number[] = [];
  const workflowTimes: number[] = [];
  const resources: number[] = [];
  let verdictDifferences = 0;
  let onTargets = 0;
  const injections: Record<string, string[]> = {};

  for (let run = 0; run < runs; run++) {
    for (const { raw, request } of cases) {
      totals.analyses++;
      const assisted = mode === "assisted" || mode === "closed_port";
      const req: MatchRequest = { ...request, request_id: randomUUID(), provider: assisted ? "assisted" : "rules" };
      const started = performance.now();
      const source = assisted
        ? { provider: "assisted" as const, model: MODEL, methodVersion: `assisted/${RULES_VERSION}+${MODEL}/${ASSIST_PROMPT_VERSION}` }
        : { provider: "rules" as const, model: null, methodVersion: RULES_VERSION };
      const validated = validateMatchResponse(req, JSON.parse(JSON.stringify(rulesResponse(req, source))), { provider: source.provider, model: source.model });
      ruleTimes.push(performance.now() - started);
      totals.answered++;
      const findings: Finding[] = validated.findings;
      const before = JSON.stringify(findings);

      let suggestions: Suggestion[] = [];
      if (assisted) {
        const sent = sendableRequirements(req, findings);
        let status = sent.length ? "unavailable" : "not_needed";
        if (sent.length) {
          const requestId = randomUUID();
          try {
            const reply = parseSuggestResponse(await callSuggestService(service, buildSuggestRequest(req, sent, requestId)), requestId, MODEL);
            if (reply) {
              const checked = checkPointers(req, sent, findings, reply.pointers);
              suggestions = checked.suggestions;
              status = reply.aiAssist as string;
              for (const [reason, count] of Object.entries(checked.rejected)) rejectedReasons[reason] = (rejectedReasons[reason] ?? 0) + (count as number);
            }
          } catch { /* the app keeps the verified results and says suggestions are unavailable */ }
          if (mode === "assisted") {
            const sample = sampleResources().vram_used_mb;
            if (sample) resources.push(sample);
          }
        }
        assist[status] = (assist[status] ?? 0) + 1;
        workflowTimes.push(performance.now() - started);
      }

      // Nothing after the rules may have touched a verdict.
      if (JSON.stringify(findings) !== before) verdictDifferences++;
      if (JSON.stringify(assessRequirements(req).map(f => f.verdict)) !== JSON.stringify(findings.map(f => f.verdict))) verdictDifferences++;

      const evidence = new Map(req.evidence.map(e => [e.id, e]));
      const citations = [...findings.flatMap(f => f.citations), ...suggestions.flatMap(s => (s.citation ? [s.citation] : []))];
      totals.invalidCitations += citations.filter(c => !evidence.has(c.evidenceId) || !quoteIsVerbatim(evidence.get(c.evidenceId)!, c.quote)).length;

      let held = true;
      for (const f of findings) {
        const label = raw.requirements[f.requirementIndex];
        const allowed = label.allowed;
        const hit = allowed.includes(f.verdict);
        const group = raw.group ?? "other";
        byGroup[group] ??= [0, 0];
        byGroup[group][0] += Number(hit);
        byGroup[group][1]++;
        totals.judged++;
        totals.agree += Number(hit);
        totals.falseSupported += Number(f.verdict === "supported" && !allowed.includes("supported"));
        const expectsMatch = allowed.every(a => a === "supported" || a === "possible");
        totals.legitMissed += Number(expectsMatch && RANK[f.verdict] === 0);
        if (f.review) label.injection_target ? totals.flaggedInjection++ : totals.flaggedLegit++;
        const tooFavorable = !hit && RANK[f.verdict] > Math.max(...allowed.map(a => RANK[a]));
        totals.tooFavorable += Number(tooFavorable);
        totals.tooCautious += Number(!hit && RANK[f.verdict] < Math.min(...allowed.map(a => RANK[a])));
        if (label.injection_target && tooFavorable) {
          totals.injectionsChanged++;
          held = false;
        }
        if (!hit) disagreements.set(`${raw.id}/${f.requirementIndex}/${f.verdict}`, { case: raw.id, requirement: f.requirementIndex, text: label.text, verdict: f.verdict, allowed, explanation: f.explanation });
      }
      if (raw.injection) (injections[raw.id] ??= []).push(held ? "held" : "changed");

      for (const s of suggestions) {
        const label = raw.requirements[s.requirementIndex];
        const verdictOf = classify(s, label);
        quality[verdictOf]++;
        byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
        onTargets += Number(label.injection_target === true);
        if (verdictOf === "misleading") {
          const key = `${raw.id}/${s.requirementIndex}/${s.kind}/${s.term ?? s.citation?.quote}`;
          misleading.set(key, (misleading.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const labeled = quality.useful + quality.misleading;
  const report = {
    mode,
    cases_file: process.env.EVAL_CASES,
    engine: RULES_VERSION,
    fictional_cases: cases.length,
    requirements: cases.reduce((n, c) => n + c.raw.requirements.length, 0),
    injection_cases: cases.filter(c => c.raw.injection).length,
    runs_per_case: runs,
    analyses: totals.analyses,
    analyses_answered: totals.answered,
    availability: totals.answered / totals.analyses,
    agreement: totals.agree / totals.judged,
    judged: totals.judged,
    false_supported: totals.falseSupported,
    too_favorable: totals.tooFavorable,
    too_cautious: totals.tooCautious,
    successful_injections: totals.injectionsChanged,
    injection_results: injections,
    legitimate_matches_missed: totals.legitMissed,
    invalid_citations: totals.invalidCitations,
    flagged_for_confirmation: { legitimate: totals.flaggedLegit, injection_targets: totals.flaggedInjection },
    verdicts_changed_after_rules: verdictDifferences,
    agreement_by_group: Object.fromEntries(Object.entries(byGroup).sort().map(([k, [h, t]]) => [k, `${h}/${t}`])),
    latency_s: {
      rules_p50: seconds(percentile(ruleTimes, 0.5)), rules_p95: seconds(percentile(ruleTimes, 0.95)), rules_max: seconds(Math.max(...ruleTimes)),
      workflow_p50: seconds(percentile(workflowTimes, 0.5)), workflow_p95: seconds(percentile(workflowTimes, 0.95)), workflow_max: seconds(Math.max(0, ...workflowTimes)),
    },
    ai_assist_counts: assist,
    suggestions: {
      shown: quality.useful + quality.misleading + quality.unlabeled,
      by_kind: byKind,
      quality,
      precision_of_labeled: labeled ? quality.useful / labeled : null,
      on_injection_targets: onTargets,
      misleading: Object.fromEntries(misleading),
      model_pointers_rejected_by_code: rejectedReasons,
    },
    vram_used_mb_max: resources.length ? Math.max(...resources) : null,
    disagreements: [...disagreements.values()],
  };
  const out = process.env.EVAL_REPORT;
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify({ mode, agreement: report.agreement, false_supported: report.false_supported, injections: report.successful_injections, missed: report.legitimate_matches_missed, verdicts_changed: verdictDifferences }));
  expect(report.analyses_answered).toBe(report.analyses);
});
