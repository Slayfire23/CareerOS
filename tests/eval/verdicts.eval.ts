import { readFileSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { RULES_VERSION, assessRequirements } from "@/lib/ai/rules/engine";

// Writes the rules-only verdict for every requirement, so two engine versions can be compared one by one.
//   VERDICT_CASES=a.json,b.json VERDICT_OUT=out.json npx vitest run --config vitest.eval.config.mts verdicts

type Raw = { as_of_month: string; cases: { id: string; requirements: { text: string; category: string; priority: string }[]; evidence: (Partial<Evidence> & { id: string; kind: string })[] }[] };
const DEFAULTS: Record<string, Record<string, unknown>> = {
  skill: { proficiency: null },
  experience: { end_month: null, description: null },
  education: { field_of_study: null, end_month: null, description: null },
  project: { description: null, contribution: null, results: null, skills: [] },
};
const expand = (short: string) => `${short.split(":")[0]}:00000000-0000-4000-8000-${short.split(":")[1].padStart(12, "0")}`;

it("verdicts", () => {
  const out: Record<string, string> = { engine: RULES_VERSION };
  for (const file of process.env.VERDICT_CASES!.split(",")) {
    const data = JSON.parse(readFileSync(file, "utf8")) as Raw;
    for (const c of data.cases) {
      const evidence = c.evidence.map(e => ({ ...DEFAULTS[e.kind], ...e, id: expand(e.id) })) as Evidence[];
      const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: data.as_of_month, evidence, requirements: c.requirements.map((r, index) => ({ index, text: r.text, category: r.category as never, priority: "Required" as never })) };
      for (const f of assessRequirements(request)) out[`${c.id}/${f.requirement_index}`] = f.verdict;
    }
  }
  writeFileSync(process.env.VERDICT_OUT!, `${JSON.stringify(out)}\n`);
});
