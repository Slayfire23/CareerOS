import { readFileSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { RULES_VERSION, assessRequirements } from "@/lib/ai/rules/engine";

// Phase 5.3 baseline: every engine verdict with its basis and the role titles it cites, so credit that comes from a job
// title or employment dates can be measured apart from everything else. Spent and opened sets only; never Set K.
//   ENGINE_CASES=a.json,b.json ENGINE_FOLLOWUP=m11_followup,m11_followup2 ENGINE_OUT=out.json \
//   npx vitest run --config vitest.eval.config.mts engine-basis

type Raw = { as_of_month: string; cases: { id: string; requirements: { text: string; category: string; allowed?: string[] }[]; evidence: (Partial<Evidence> & { id: string; kind: string })[] }[] };
const DEFAULTS: Record<string, Record<string, unknown>> = {
  skill: { proficiency: null },
  experience: { end_month: null, description: null },
  education: { field_of_study: null, end_month: null, description: null },
  project: { description: null, contribution: null, results: null, skills: [] },
};
const expand = (short: string) => `${short.split(":")[0]}:00000000-0000-4000-8000-${short.split(":")[1].padStart(12, "0")}`;
const month = (asOf: string, back: number) => {
  const [y, m] = asOf.split("-").map(Number);
  const index = y * 12 + (m - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

type Row = { verdict: string; basis: string; titles: string[]; quotes: string[]; requirement: string; category: string; allowed: string[] | null; label?: unknown; descriptions: boolean };

it.skipIf(!process.env.ENGINE_OUT)("engine basis", () => {
  const out: Record<string, Row | string> = { engine: RULES_VERSION };
  const record = (key: string, request: MatchRequest, allowed: (i: number) => string[] | null, label?: unknown) => {
    for (const f of assessRequirements(request)) {
      const requirement = request.requirements[f.requirement_index];
      const titles = f.citations.map(c => request.evidence.find(e => e.id === c.evidence_id)).filter(e => e?.kind === "experience").map(e => (e as { job_title: string }).job_title);
      out[`${key}/${f.requirement_index}`] = { verdict: f.verdict, basis: f.basis, titles, quotes: f.citations.map(c => c.quote), requirement: requirement.text, category: requirement.category, allowed: allowed(f.requirement_index), label, descriptions: request.evidence.some(e => e.kind === "experience" && !!(e as { description: string | null }).description) };
    }
  };
  for (const file of (process.env.ENGINE_CASES ?? "").split(",").filter(Boolean)) {
    const data = JSON.parse(readFileSync(file, "utf8")) as Raw;
    for (const c of data.cases) {
      const evidence = c.evidence.map(e => ({ ...DEFAULTS[e.kind], ...e, id: expand(e.id) })) as Evidence[];
      const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: data.as_of_month, evidence, requirements: c.requirements.map((r, index) => ({ index, text: r.text, category: r.category as never, priority: "Required" as never })) };
      record(`${file.split("/").pop()}:${c.id}`, request, i => c.requirements[i].allowed ?? null);
    }
  }
  // The follow-up splits: the engine sees only the job title and its months, exactly as the follow-up harness gives it.
  for (const dir of (process.env.ENGINE_FOLLOWUP ?? "").split(",").filter(Boolean)) {
    const scenarios = JSON.parse(readFileSync(`tests/fixtures/${dir}/scenarios.json`, "utf8")).scenarios as { id: string; requirement: string; category: string; role: string; role_months: number }[];
    const labels = new Map((JSON.parse(readFileSync(`tests/fixtures/${dir}/labels.json`, "utf8")).labels as { id: string }[]).map(l => [l.id, l]));
    for (const s of scenarios) {
      const evidence = [{ id: "experience:00000000-0000-4000-8000-000000000001", kind: "experience", job_title: s.role, start_month: month("2026-11", Math.max(0, s.role_months - 1)), end_month: null, description: null }] as Evidence[];
      const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", evidence, requirements: [{ index: 0, text: s.requirement, category: s.category as never, priority: "Required" as never }] };
      record(`${dir}:${s.id}`, request, () => null, labels.get(s.id));
    }
  }
  writeFileSync(process.env.ENGINE_OUT!, `${JSON.stringify(out)}\n`);
});
