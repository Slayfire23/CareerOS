import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "dotenv";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { callRetrieveService } from "@/lib/ai/claims/retrieve-client";
import type { Evidence, MatchRequest, Verdict } from "@/lib/ai/evidence";
import { semanticAllowed, passagesFrom, type Retrieve } from "@/lib/ai/claims/semantic";
import { shadowAssess } from "@/lib/ai/claims/shadow";
import { RULES_VERSION, assessRequirements } from "@/lib/ai/rules/engine";

// Compares today's rules with the shadow pipeline on development fixtures. Local only, and fictional data.
//
//   SHADOW_CASES=tests/fixtures/m11_dev/train.json SHADOW_MODE=rules|semantic SHADOW_REPORT=out.json \
//   SHADOW_SEALED=1 npx vitest run --config vitest.eval.config.mts shadow
//
// SHADOW_SEALED writes counts by category and nothing about any case, for the split kept unseen.

type RawRequirement = { text: string; category: string; priority: string; allowed: Verdict[]; injection_target?: boolean };
type RawCase = { id: string; category?: string; group?: string; language?: string; injection?: boolean; requirements: RawRequirement[]; evidence: (Partial<Evidence> & { id: string; kind: string })[] };
const STAGES = ["rulesOnly", "withCurated", "proposed", "table"] as const;
type Stage = (typeof STAGES)[number];
const RANK: Record<Verdict, number> = { insufficient_information: 0, gap: 0, possible: 1, supported: 2 };
const DEFAULTS: Record<string, Record<string, unknown>> = {
  skill: { proficiency: null },
  experience: { end_month: null, description: null },
  education: { field_of_study: null, end_month: null, description: null },
  project: { description: null, contribution: null, results: null, skills: [] },
};
const expand = (short: string) => `${short.split(":")[0]}:00000000-0000-4000-8000-${short.split(":")[1].padStart(12, "0")}`;
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
const blank = () => ({ n: 0, correct: 0, falseSupported: 0, tooFavorable: 0, tooCautious: 0, expectMatch: 0, missed: 0, attackTargets: 0, attackSucceeded: 0 });

it("shadow evaluation", { timeout: 1_800_000 }, async () => {
  const file = JSON.parse(readFileSync(process.env.SHADOW_CASES!, "utf8")) as { as_of_month: string; cases: RawCase[] };
  const semantic = process.env.SHADOW_MODE === "semantic";
  const sealed = process.env.SHADOW_SEALED === "1";
  const env = semantic ? parse(readFileSync(".env")) : {};
  const retrieve: Retrieve | null = semantic
    ? async body => (await callRetrieveService({ serviceUrl: env.AI_SERVICE_URL, secret: env.AI_SERVICE_SECRET }, body)) as Awaited<ReturnType<Retrieve>>
    : null;

  const totals = Object.fromEntries(STAGES.map(s => [s, blank()])) as Record<Stage, ReturnType<typeof blank>>;
  const byCategory: Record<string, Record<Stage, ReturnType<typeof blank>>> = {};
  const rows: unknown[] = [];
  const invalid: string[] = [];
  const rulesMs: number[] = [];
  const shadowMs: number[] = [];
  const statuses: Record<string, number> = {};
  const best: { similarity: number; allowed: Verdict[]; category: string }[] = [];
  let changedFromRules = 0;
  let semanticToSupported = 0;
  let passageTotal = 0;
  const memoryBefore = process.memoryUsage().heapUsed;

  for (const raw of file.cases) {
    const c = { ...raw, category: raw.category ?? raw.group ?? "uncategorized" };
    const evidence = c.evidence.map(e => ({ ...DEFAULTS[e.kind], ...e, id: expand(e.id) })) as Evidence[];
    const request: MatchRequest = {
      request_id: randomUUID(), provider: "rules", as_of_month: file.as_of_month, evidence,
      requirements: c.requirements.map((r, index) => ({ index, text: r.text, category: r.category as never, priority: (r.priority === "Required" || r.priority === "Preferred" ? r.priority : "Required") as never })),
    };
    const t0 = performance.now();
    const baseline = assessRequirements(request);
    rulesMs.push(performance.now() - t0);
    const t1 = performance.now();
    const { results, invalidClaims } = await shadowAssess(request, retrieve);
    shadowMs.push(performance.now() - t1);
    invalid.push(...invalidClaims);
    passageTotal += passagesFrom(request).length;
    results.forEach((result, i) => {
      const asked = c.requirements[i];
      const allowed = asked.allowed;
      // The promise that matters: the verdict a person sees is exactly today's.
      expect(result.rulesOnly).toBe(baseline.find(f => f.requirement_index === i)!.verdict);
      statuses[result.semanticStatus] = (statuses[result.semanticStatus] ?? 0) + 1;
      const semClaims = result.claims.filter(x => x.relationship.kind === "semantic_candidate");
      if (result.proposed === "supported" && result.withCurated !== "supported") semanticToSupported++;
      if (result.proposed !== result.withCurated) changedFromRules++;
      if (semanticAllowed(result.frame) && result.withCurated === "insufficient_information") {
        best.push({ similarity: Math.max(0, ...semClaims.filter(x => x.validation.status === "needs_clarification").map(x => x.relationship.similarity ?? 0)), allowed, category: c.category });
      }
      const verdicts = { rulesOnly: result.rulesOnly, withCurated: result.withCurated, proposed: result.proposed, table: result.table.verdict } as Record<Stage, Verdict>;
      for (const stage of STAGES) {
        const v = verdicts[stage];
        for (const bucket of [totals[stage], ((byCategory[c.category] ??= Object.fromEntries(STAGES.map(s => [s, blank()])) as never)[stage] as ReturnType<typeof blank>)]) {
          bucket.n++;
          if (allowed.includes(v)) bucket.correct++;
          else if (RANK[v] > Math.max(...allowed.map(a => RANK[a]))) bucket.tooFavorable++;
          else if (RANK[v] < Math.max(...allowed.map(a => RANK[a]))) bucket.tooCautious++;
          if (v === "supported" && !allowed.includes("supported")) bucket.falseSupported++;
          const expectsMatch = allowed.every(a => a === "supported" || a === "possible");
          if (expectsMatch) {
            bucket.expectMatch++;
            if (v !== "supported" && v !== "possible") bucket.missed++;
          }
          if (asked.injection_target) {
            bucket.attackTargets++;
            if (RANK[v] > Math.max(...allowed.map(a => RANK[a]))) bucket.attackSucceeded++;
          }
        }
      }
      if (!sealed) rows.push({
        case: c.id, category: c.category, language: c.language ?? "en", text: asked.text, allowed, ...verdicts, tableRule: result.table.rule,
        claims: result.claims.map(x => ({ text: x.source.text.slice(0, 80), rel: x.relationship.kind, sim: x.relationship.similarity, status: x.validation.status, reasons: x.validation.rejectionReasons })),
      });
    });
  }
  const report = {
    fixtures: process.env.SHADOW_CASES, mode: semantic ? "semantic" : "rules", engine: RULES_VERSION, cases: file.cases.length, sealed,
    totals, byCategory, invalidClaims: invalid.length, semanticStatus: statuses, semanticToSupported, verdictsThatWouldChange: changedFromRules,
    latencyMs: {
      rules: { p50: percentile(rulesMs, 0.5), p95: percentile(rulesMs, 0.95), max: Math.max(...rulesMs) },
      shadow: { p50: percentile(shadowMs, 0.5), p95: percentile(shadowMs, 0.95), max: Math.max(...shadowMs) },
    },
    heapGrowthMb: Math.round((process.memoryUsage().heapUsed - memoryBefore) / 1e5) / 10,
    passagesSent: passageTotal,
    ...(sealed ? {} : { rows, best }),
  };
  mkdirSync(dirname(process.env.SHADOW_REPORT!), { recursive: true });
  writeFileSync(process.env.SHADOW_REPORT!, `${JSON.stringify(report, null, 1)}\n`);
  expect(invalid).toEqual([]);
  expect(semanticToSupported).toBe(0);
});
