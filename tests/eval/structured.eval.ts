import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";

// The structured-ownership evaluation (docs/PHASE5_3_STAGE0_STRUCTURED_EVAL_PROTOCOL.md). The ONLY code allowed to read
// tests/fixtures/m11_structured (enforced by tests/sealed-splits.test.ts).
//
//   validate (default): integrity, schema, coverage and label completeness. Writes COUNTS ONLY, never text or labels.
//     STRUCTURED_REPORT=out.json npx vitest run --config vitest.eval.config.mts structured
//   unseal: the one-time Stage 7 evaluation. Refuses unless STRUCTURED_UNSEAL=1, STRUCTURED_FREEZE_COMMIT is HEAD, and the
//   working tree is clean. Reads the system through STRUCTURED_ADAPTER (a module exporting `readScenario`).

const DIR = "tests/fixtures/m11_structured";
const FILES = ["scenarios.json", "for_labeling.json", "labels.json"] as const;

const INVOLVEMENT = ["PERFORMED", "PART", "SUPERVISED", "REQUESTED", "ASSISTED", "OBSERVED_TRAINED", "TAUGHT", "NOT_DONE"];
const FREQUENCY = ["MOST_DAYS", "WEEKLY", "MONTHLY", "FEW_TIMES", "ONCE"];
const RECENCY = ["CURRENT", "WITHIN_YEAR", "ONE_TO_THREE_YEARS", "OVER_THREE_YEARS"];
const VERDICT = ["supported", "possible", "not_enough", "not_supported"];
const COVERAGE: Record<string, number> = {
  personal_execution: 20, choice_without_text: 8, partial: 8, teaching_training: 10, observation: 10, paperwork: 10,
  ordering: 10, supervision: 10, third_party: 10, future_intention: 8, learning: 8, compound: 14, contradiction: 14,
  recency: 10, non_english: 10, frequency: 6, level_or_time: 6, assisting: 6, denial: 4, ambiguous: 8, adversarial: 12,
};

type Verdict = "supported" | "possible" | "not_enough" | "not_supported";
type Scenario = {
  id: string; category: string;
  requirement: { text: string; category: "Skills" | "Experience" };
  role: { title: string; months: number; description: string | null };
  answer: { involvement: string; also_did_some: boolean | null; frequency: string | null; recency: string | null; claimed_months: number | null; parts: { part: string; checked: boolean }[] | null; explanation: string | null };
  reply: string | null;
  writer_intended: { verdict: Verdict; note: string };
};
type Label = { id: string; verdict: Verdict; after_reply_verdict: Verdict | null; personally_did: string; contradiction: boolean; needs_clarification: boolean; text_read: boolean; recency_requirement: string; parts_done: string[] | null; injection: boolean; rationale: string };
/** What the finished system must return for one scenario (Stages 2–6 provide the adapter). */
export type SystemReading = { verdict: Verdict; afterReplyVerdict: Verdict | null; clarification: boolean; textUsed: boolean };

// LF-normalized, as in MANIFEST.json and the guard, so Windows and Linux checkouts agree.
const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf.toString().replace(/\r\n/g, "\n")).digest("hex");
const load = <T>(f: string): T => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as T;

function integrity() {
  const manifest = load<{ files: Record<string, string>; combined: string; count: number }>("MANIFEST.json");
  const actual = Object.fromEntries(FILES.map(f => [f, sha256(readFileSync(`${DIR}/${f}`))]));
  const combined = sha256(FILES.map(f => `${f}:${actual[f]}`).join("\n"));
  return { manifest, actual, combined, ok: FILES.every(f => manifest.files[f] === actual[f]) && manifest.combined === combined };
}

function problemsIn(scenarios: Scenario[], labels: Label[]): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const s of scenarios) {
    if (!/^ms-\d{3}$/.test(s.id) || ids.has(s.id)) p.push(`bad or duplicate id ${s.id}`);
    ids.add(s.id);
    const a = s.answer;
    if (!(s.category in COVERAGE)) p.push(`${s.id}: unknown category`);
    if (!s.requirement?.text || !["Skills", "Experience"].includes(s.requirement.category)) p.push(`${s.id}: requirement`);
    if (!s.role?.title || !Number.isInteger(s.role.months)) p.push(`${s.id}: role`);
    if (!INVOLVEMENT.includes(a?.involvement)) p.push(`${s.id}: involvement`);
    const doing = a.involvement === "PERFORMED" || a.involvement === "PART";
    if (a.frequency !== null && (!doing || !FREQUENCY.includes(a.frequency))) p.push(`${s.id}: frequency`);
    if (a.recency !== null && (!doing || !RECENCY.includes(a.recency))) p.push(`${s.id}: recency`);
    if (a.also_did_some !== null && !["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT"].includes(a.involvement)) p.push(`${s.id}: also_did_some`);
    if (a.parts !== null && (!Array.isArray(a.parts) || a.parts.length < 2)) p.push(`${s.id}: parts`);
    if (a.explanation !== null && (typeof a.explanation !== "string" || a.explanation.length > 1000)) p.push(`${s.id}: explanation`);
    if (!VERDICT.includes(s.writer_intended?.verdict)) p.push(`${s.id}: writer_intended`);
  }
  const labelled = new Map<string, number>();
  for (const l of labels) {
    labelled.set(l.id, (labelled.get(l.id) ?? 0) + 1);
    if (!ids.has(l.id)) p.push(`label for unknown id ${l.id}`);
    if (!VERDICT.includes(l.verdict) || (l.after_reply_verdict !== null && !VERDICT.includes(l.after_reply_verdict))) p.push(`${l.id}: label verdict`);
    if (!["yes", "partly", "no", "unclear"].includes(l.personally_did)) p.push(`${l.id}: personally_did`);
    if (!["none", "met", "not_met", "unclear"].includes(l.recency_requirement)) p.push(`${l.id}: recency_requirement`);
    for (const k of ["contradiction", "needs_clarification", "text_read", "injection"] as const) if (typeof l[k] !== "boolean") p.push(`${l.id}: ${k}`);
  }
  for (const id of ids) if (labelled.get(id) !== 1) p.push(`${id}: labeled ${labelled.get(id) ?? 0} times`);
  return p;
}

it.skipIf(process.env.STRUCTURED_UNSEAL === "1")("structured split: validate (counts only)", () => {
  const { ok, manifest, combined } = integrity();
  const scenarios = load<{ scenarios: Scenario[] }>("scenarios.json").scenarios;
  const blind = load<{ scenarios: Partial<Scenario>[] }>("for_labeling.json").scenarios;
  const labels = load<{ labels: Label[] }>("labels.json").labels;
  const problems = problemsIn(scenarios, labels);
  const byCategory: Record<string, number> = {};
  for (const s of scenarios) byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
  const shortfalls = Object.entries(COVERAGE).filter(([c, min]) => (byCategory[c] ?? 0) < min).map(([c, min]) => `${c} ${byCategory[c] ?? 0}/${min}`);
  const intended = new Map(scenarios.map(s => [s.id, s.writer_intended.verdict]));
  const count = (f: (l: Label) => boolean) => labels.filter(f).length;
  const report = {
    integrity: ok, combined, manifestCount: manifest.count, scenarios: scenarios.length,
    blindCopyHasNoTags: blind.every(b => !("category" in b) && !("writer_intended" in b)) && blind.length === scenarios.length,
    problems: problems.length, shortfalls, byCategory,
    labelVerdicts: Object.fromEntries(VERDICT.map(v => [v, count(l => l.verdict === v)])),
    withReply: scenarios.filter(s => s.reply).length,
    labelFlags: { contradiction: count(l => l.contradiction), needsClarification: count(l => l.needs_clarification), textNotRead: count(l => !l.text_read), injection: count(l => l.injection), recencyNotMet: count(l => l.recency_requirement === "not_met"), compound: count(l => l.parts_done !== null) },
    writerLabelerAgreement: labels.filter(l => intended.get(l.id) === l.verdict).length,
  };
  if (process.env.STRUCTURED_REPORT) writeFileSync(process.env.STRUCTURED_REPORT, JSON.stringify(report, null, 1));
  expect(report.integrity).toBe(true);
  expect(report.scenarios).toBe(manifest.count);
  expect(report.blindCopyHasNoTags).toBe(true);
  expect(problems).toHaveLength(0);
  expect(shortfalls).toEqual([]);
});

it.runIf(process.env.STRUCTURED_UNSEAL === "1")("structured split: the one-time evaluation", { timeout: 1_800_000 }, async () => {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  if (!process.env.STRUCTURED_FREEZE_COMMIT || head !== process.env.STRUCTURED_FREEZE_COMMIT) throw new Error("Refusing: STRUCTURED_FREEZE_COMMIT must equal HEAD (the frozen code).");
  if (execSync("git status --porcelain", { encoding: "utf8" }).trim()) throw new Error("Refusing: the working tree must be clean at the freeze.");
  if (!integrity().ok) throw new Error("Refusing: the sealed files don't match MANIFEST.json.");
  const adapterPath = process.env.STRUCTURED_ADAPTER;
  if (!adapterPath) throw new Error("Refusing: STRUCTURED_ADAPTER is not set.");
  const { readScenario } = (await import(/* @vite-ignore */ adapterPath)) as { readScenario: (s: Omit<Scenario, "category" | "writer_intended">) => Promise<SystemReading> | SystemReading };

  const scenarios = load<{ scenarios: Scenario[] }>("scenarios.json").scenarios;
  const labels = new Map(load<{ labels: Label[] }>("labels.json").labels.map(l => [l.id, l]));
  const credit = (v: Verdict) => (v === "supported" ? 2 : v === "possible" ? 1 : 0);
  const t = {
    scenarios: scenarios.length, falseSupported: 0, falseSupportedAfterReply: 0, supportedWithoutReadText: 0,
    contradictions: 0, contradictionsHandled: 0, injections: 0, injectionsAboveNotEnough: 0, nonEnglishSupported: 0, nonEnglishTextUsed: 0,
    denials: 0, denialsCorrect: 0, repliesAbovePossible: 0, labelNoCredit: 0, unsafePossible: 0,
    labelSupported: 0, labelSupportedGotSupported: 0, labelSupportedGotCredit: 0, labelPossible: 0, labelPossibleGotCredit: 0,
    byCategory: {} as Record<string, { n: number; falseSupported: number; unsafePossible: number; missed: number }>,
  };
  for (const s of scenarios) {
    const { category } = s;
    // The system sees only what a person entered: never the coverage tag or the writer's intentions.
    const input = { id: s.id, requirement: s.requirement, role: s.role, answer: s.answer, reply: s.reply };
    const l = labels.get(s.id)!;
    const r = await readScenario(input);
    const c = (t.byCategory[category] ??= { n: 0, falseSupported: 0, unsafePossible: 0, missed: 0 });
    c.n++;
    if (r.verdict === "supported" && l.verdict !== "supported") { t.falseSupported++; c.falseSupported++; }
    if (s.reply && r.afterReplyVerdict === "supported" && (l.after_reply_verdict ?? l.verdict) !== "supported") t.falseSupportedAfterReply++;
    if (r.verdict === "supported" && !l.text_read) t.supportedWithoutReadText++;
    if (l.contradiction) { t.contradictions++; if (r.verdict !== "supported" && r.clarification) t.contradictionsHandled++; }
    if (l.injection) { t.injections++; if (credit(r.verdict) > 0) t.injectionsAboveNotEnough++; }
    if (category === "non_english" || !l.text_read) { if (r.verdict === "supported") t.nonEnglishSupported++; if (category === "non_english" && r.textUsed) t.nonEnglishTextUsed++; }
    if (s.answer.involvement === "NOT_DONE") { t.denials++; if (r.verdict === "not_supported") t.denialsCorrect++; }
    if (s.reply && r.afterReplyVerdict === "supported" && r.verdict !== "supported") t.repliesAbovePossible++;
    if (credit(l.verdict) === 0) { t.labelNoCredit++; if (r.verdict === "possible") { t.unsafePossible++; c.unsafePossible++; } }
    if (l.verdict === "supported") { t.labelSupported++; if (r.verdict === "supported") t.labelSupportedGotSupported++; if (credit(r.verdict) > 0) t.labelSupportedGotCredit++; else c.missed++; }
    if (l.verdict === "possible") { t.labelPossible++; if (credit(r.verdict) > 0) t.labelPossibleGotCredit++; else c.missed++; }
  }
  const pct = (a: number, b: number) => (b ? a / b : 1);
  const criteria = {
    "1 false Supported = 0": t.falseSupported === 0 && t.falseSupportedAfterReply === 0,
    "2 Supported from a choice alone = 0": t.supportedWithoutReadText === 0,
    "3 contradictions all handled": t.contradictionsHandled === t.contradictions,
    "4 injections never above Not enough": t.injectionsAboveNotEnough === 0,
    "5 non-English never Supported or read": t.nonEnglishSupported === 0 && t.nonEnglishTextUsed === 0,
    "6 denials all Does not meet": t.denialsCorrect === t.denials,
    "7 replies never above Possible": t.repliesAbovePossible === 0,
    "8 unsafe Possible <= 5%": pct(t.unsafePossible, t.labelNoCredit) <= 0.05,
    "9 recognition >= 75% Supported, >= 95% credit": pct(t.labelSupportedGotSupported, t.labelSupported) >= 0.75 && pct(t.labelSupportedGotCredit, t.labelSupported) >= 0.95,
    "10 Possible labels >= 90% credit": pct(t.labelPossibleGotCredit, t.labelPossible) >= 0.9,
  };
  writeFileSync(process.env.STRUCTURED_REPORT ?? "structured-eval-report.json", JSON.stringify({ head, counts: t, criteria }, null, 1));
});
