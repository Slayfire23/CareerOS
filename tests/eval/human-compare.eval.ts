import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { RULES_VERSION, assessRequirements } from "@/lib/ai/rules/engine";

// Compares the engine with the human decisions on Set H. Set H is development data.
//
//   HUMAN_REPORT=ai-service/evals/reports/m9/set-h-human-before npx vitest run --config vitest.eval.config.mts human-compare
//
// Writes <HUMAN_REPORT>.json and <HUMAN_REPORT>.md.

const LABEL: Record<string, string> = { supported: "Supported", possible: "Possible", gap: "Not supported", insufficient_information: "Not enough information" };
const ORDER = ["supported", "possible", "gap", "insufficient_information"];
const DEFAULTS: Record<string, Record<string, unknown>> = {
  skill: { proficiency: null }, experience: { end_month: null, description: null },
  education: { field_of_study: null, end_month: null, description: null }, project: { description: null, contribution: null, results: null, skills: [] },
};
const expand = (short: string) => `${short.split(":")[0]}:00000000-0000-4000-8000-${short.split(":")[1].padStart(12, "0")}`;
type Raw = { text: string; category: string; priority: string; allowed: string[]; confirmed?: true };
type Case = { id: string; requirements: Raw[]; evidence: (Record<string, unknown> & { id: string; kind: string })[] };

it("compares", () => {
  const set = JSON.parse(readFileSync("ai-service/evals/holdout_h_cases.json", "utf8")) as { as_of_month: string; cases: Case[] };
  const second = JSON.parse(readFileSync("ai-service/evals/holdout_h_second_rater_labels.json", "utf8")) as Record<string, string[][]>;
  const review = JSON.parse(readFileSync("tests/fixtures/set_h_human_review.json", "utf8")) as { decisions: { case: string; source_case: string; requirement_index: number; verdict: string }[] };
  const rows = review.decisions.map(d => {
    const c = set.cases.find(x => x.id === d.source_case)!;
    const request: MatchRequest = {
      request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: set.as_of_month,
      requirements: c.requirements.map((r, index) => ({ index, text: r.text, category: r.category, priority: r.priority })) as MatchRequest["requirements"],
      evidence: c.evidence.map(e => ({ ...DEFAULTS[e.kind], ...e, id: expand(e.id) })) as unknown as Evidence[],
    };
    const f = assessRequirements(request)[d.requirement_index];
    return {
      case: d.case, source_case: d.source_case, requirement: c.requirements[d.requirement_index].text,
      human: d.verdict, engine: f.verdict, agree: d.verdict === f.verdict,
      rater1: c.requirements[d.requirement_index].allowed, rater2: second[d.source_case][d.requirement_index], basis: f.basis, explanation: f.explanation,
    };
  });
  const agree = rows.filter(r => r.agree).length;
  const confusion = Object.fromEntries(ORDER.map(h => [h, Object.fromEntries(ORDER.map(e => [e, rows.filter(r => r.human === h && r.engine === e).length]))]));
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "src"], { encoding: "utf8" }).trim().length > 0;
  const groups = {
    false_supported: rows.filter(r => r.engine === "supported" && r.human !== "supported"),
    supported_downgraded: rows.filter(r => r.human === "supported" && r.engine !== "supported"),
    not_supported_as_uncertain: rows.filter(r => r.human === "gap" && (r.engine === "possible" || r.engine === "insufficient_information")),
    disagrees_with_rater1: rows.filter(r => !r.rater1.includes(r.human)),
    disagrees_with_rater2: rows.filter(r => !r.rater2.includes(r.human)),
    engine_outside_rater1: rows.filter(r => !r.rater1.includes(r.engine)),
    engine_outside_rater2: rows.filter(r => !r.rater2.includes(r.engine)),
  };
  const out = process.env.HUMAN_REPORT;
  expect(out, "Set HUMAN_REPORT").toBeTruthy();
  mkdirSync(dirname(out!), { recursive: true });
  const summary = { engine: RULES_VERSION, commit, src_has_uncommitted_changes: dirty, cases: rows.length, exact_agreement: agree / rows.length, agree, confusion, ...Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(r => r.case)])), rows };
  writeFileSync(`${out}.json`, JSON.stringify(summary, null, 2) + "\n");
  const ids = (list: { case: string }[]) => list.map(r => r.case).join(", ") || "none";
  writeFileSync(`${out}.md`, [
    `# Set H: engine against human decisions (${RULES_VERSION}, ${commit}${dirty ? ", with uncommitted changes" : ""})`,
    "",
    "Set H is development data. These figures don't show how the engine performs on new cases.",
    "",
    `**Exact agreement: ${agree} of ${rows.length} (${((agree / rows.length) * 100).toFixed(1)}%)**`,
    "",
    "| Case | Requirement | Human | Engine | Agree | AI rater 1 accepted | AI rater 2 accepted |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(r => `| ${r.case} | ${r.requirement.replace(/\n/g, " ").replace(/\|/g, "/")} | ${LABEL[r.human]} | ${LABEL[r.engine]} | ${r.agree ? "Yes" : "**No**"} | ${r.rater1.map(v => LABEL[v]).join(", ")} | ${r.rater2.map(v => LABEL[v]).join(", ")} |`),
    "",
    "## Confusion matrix (rows: human; columns: engine)",
    "",
    `| Human \\ Engine | ${ORDER.map(v => LABEL[v]).join(" | ")} |`,
    `|---|${ORDER.map(() => "---").join("|")}|`,
    ...ORDER.map(h => `| ${LABEL[h]} | ${ORDER.map(e => confusion[h][e]).join(" | ")} |`),
    "",
    "## Groups",
    "",
    `- **False supported:** ${ids(groups.false_supported)}`,
    `- **Human Supported, engine lower:** ${ids(groups.supported_downgraded)}`,
    `- **Human Not supported, engine uncertain:** ${ids(groups.not_supported_as_uncertain)}`,
    `- **Human verdict outside AI rater 1:** ${ids(groups.disagrees_with_rater1)}`,
    `- **Human verdict outside AI rater 2:** ${ids(groups.disagrees_with_rater2)}`,
    `- **Engine verdict outside AI rater 1:** ${ids(groups.engine_outside_rater1)}`,
    `- **Engine verdict outside AI rater 2:** ${ids(groups.engine_outside_rater2)}`,
    "",
  ].join("\n"));
});
