import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";

// The compound-split evaluation, R4 (docs/PHASE5_3_R4_EVAL_PROTOCOL.md). The ONLY code allowed to read
// tests/fixtures/m11_parts (enforced by tests/sealed-splits.test.ts).
//
//   validate (default): integrity, schema, coverage and label completeness. Writes COUNTS ONLY, never text or labels.
//     PARTS_REPORT=out.json npx vitest run --config vitest.eval.config.mts parts
//   unseal: Stage G only. Refuses unless PARTS_UNSEAL=1, PARTS_FREEZE_COMMIT is HEAD, and the working tree is clean.
//   Its scoring is defined at Stage G, with the acceptance criteria approved by the owner then; until that approval it
//   refuses after the gates.

const DIR = "tests/fixtures/m11_parts";
const FILES = ["scenarios.json", "for_labeling.json", "labels.json"] as const;

const INVOLVEMENT = ["PERFORMED", "PART", "SUPERVISED", "REQUESTED", "ASSISTED", "OBSERVED_TRAINED", "TAUGHT", "NOT_DONE"];
const FREQUENCY = ["MOST_DAYS", "WEEKLY", "MONTHLY", "FEW_TIMES", "ONCE"];
const RECENCY = ["CURRENT", "WITHIN_YEAR", "ONE_TO_THREE_YEARS", "OVER_THREE_YEARS"];
const VERDICT = ["supported", "possible", "not_enough", "not_supported"];
const DONE = ["yes", "partly", "no", "unclear"];
const COVERAGE: Record<string, number> = {
  full_standard: 33, full_natural: 33, shared_evidence: 20, partial: 35, supervision_delegation: 20, third_party: 15,
  correction_cancel: 15, correction_narrow: 15, contradictory_checkbox: 20, named_tool: 12, named_tool_cross_clause: 8,
  elided_pronoun: 12, ambiguous_antecedent: 8, aging_analysis_vs_reading: 8, hiring_vs_recommending: 8, clause_structure: 10,
  non_english: 10, injection: 10, unsplit_control: 20,
};
/** The 33 owner-approved splits: requirement and exact parts (docs/PHASE5_3_SPLIT_REVIEW.md). */
const SPLITS: Record<string, [string, string, string]> = {
  P1: ["Bookkeeping and month-end reconciliation", "Bookkeeping", "month-end reconciliation"],
  P2: ["Cash handling and till reconciliation", "Cash handling", "till reconciliation"],
  P3: ["Crane signaling and rigging", "Crane signaling", "Crane rigging"],
  P6: ["Experience with grant reporting and compliance", "grant reporting", "grant compliance"],
  P7: ["Handle patient scheduling and insurance verification", "Patient scheduling", "Insurance verification"],
  P8: ["Perform bookkeeping and monthly financial reporting", "Bookkeeping", "Monthly financial reporting"],
  P11: ["Pipe threading and fitting", "Pipe threading", "Pipe fitting"],
  P12: ["Pruning and tree felling", "Pruning", "tree felling"],
  P13: ["Recruiting and hiring staff", "Recruiting staff", "Hiring staff"],
  P14: ["Recruiting and onboarding new staff", "Recruiting new staff", "onboarding new staff"],
  A19: ["Conduct inventory cycle counts and reconcile variances", "Inventory cycle counts", "Reconciling inventory variances"],
  A20: ["Hands-on brake and suspension repair", "Brake repair", "Suspension repair"],
  A21: ["Install drywall and finish joints", "Drywall installation", "Drywall joint finishing"],
  A22: ["Manage executive calendars and coordinate travel arrangements", "Executive calendar management", "Travel coordination"],
  A23: ["Manage social media accounts and create content", "Social media account management", "Content creation"],
  A24: ["Perform venipuncture and start IV lines", "Venipuncture", "Starting IV lines"],
  A25: ["Schedule service appointments and dispatch technicians", "Scheduling service appointments", "Dispatching technicians"],
  A26: ["Prepare tax returns for individuals and small businesses", "Individual tax return preparation", "Small-business tax return preparation"],
  A51: ["Pour and finish concrete flatwork", "Pouring concrete flatwork", "Finishing concrete flatwork"],
  A52: ["Verify and approve all invoices before payment", "Verifying invoices", "Approving invoices for payment"],
  A53: ["Build and maintain Excel financial models", "Building Excel financial models", "Maintaining Excel financial models"],
  A54: ["Configure and maintain AWS cloud infrastructure", "Configuring AWS cloud infrastructure", "Maintaining AWS cloud infrastructure"],
  A55: ["Design and develop RESTful APIs", "Designing RESTful APIs", "Developing RESTful APIs"],
  A56: ["Develop and deliver sales presentations to clients", "Developing sales presentations for clients", "Delivering sales presentations to clients"],
  A57: ["Install and maintain security camera systems", "Installing security camera systems", "Maintaining security camera systems"],
  A58: ["Install and repair residential plumbing", "Installing residential plumbing", "Repairing residential plumbing"],
  A59: ["Order and manage pharmacy inventory", "Ordering pharmacy inventory", "Managing pharmacy inventory"],
  A60: ["Plan and execute paid search campaigns in Google Ads", "Planning paid search campaigns in Google Ads", "Executing paid search campaigns in Google Ads"],
  A63: ["Cut and style hair", "Cutting hair", "Styling hair"],
  A67: ["Load and unload freight from trucks", "Loading freight onto trucks", "Unloading freight from trucks"],
  A76: ["CNC lathe setup and operation", "CNC lathe setup", "CNC lathe operation"],
  A77: ["Accounts receivable aging and collections", "Accounts receivable aging analysis", "Accounts receivable collections"],
  A93: ["Forecasting and budgeting", "Forecasting", "Budgeting"],
};
const CONTROLS = [
  "Perform welding and fabrication of steel structures", "Prepare and file court documents", "Wound care and dressing changes",
  "Process accounts payable and vendor invoices", "Pick, pack and ship customer orders", "Operate forklifts and pallet jacks safely",
  "Data engineering, building ETL pipelines", "Soil testing and analysis", "Prepare and teach daily lessons in high school mathematics",
  "Operate point-of-sale systems and process returns",
];
const TOOL_SPLITS = ["A53", "A60"];

type Verdict = "supported" | "possible" | "not_enough" | "not_supported";
type Scenario = {
  id: string; category: string; split_id: string | null; language: string;
  requirement: { text: string; category: "Skills" | "Experience" };
  role: { title: string; months: number; description: string | null };
  answer: { involvement: string; also_did_some: boolean | null; frequency: string | null; recency: string | null; claimed_months: number | null; parts: { part: string; checked: boolean }[] | null; explanation: string | null };
  reply: string | null;
  writer_intended: { verdict: Verdict; parts_done: string[] | null; note: string };
};
type Label = {
  id: string; verdict: Verdict; after_reply_verdict: Verdict | null;
  parts: { part: string; done: string; shown_by_own_text: boolean; contradicted: boolean }[] | null;
  personally_did: string; contradiction: boolean; needs_clarification: boolean; text_read: boolean; injection: boolean;
  named_tool_met: boolean | null; unsure: boolean; rationale: string;
};

// LF-normalized, as in MANIFEST.json and the guard, so Windows and Linux checkouts agree.
const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf.toString().replace(/\r\n/g, "\n")).digest("hex");
const load = <T>(f: string): T => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as T;

function integrity() {
  const manifest = load<{ files: Record<string, string>; combined: string; count: number }>("MANIFEST.json");
  const actual = Object.fromEntries(FILES.map(f => [f, sha256(readFileSync(`${DIR}/${f}`))]));
  const combined = sha256(FILES.map(f => `${f}:${actual[f]}`).join("\n"));
  return { manifest, actual, combined, ok: FILES.every(f => manifest.files[f] === actual[f]) && manifest.combined === combined };
}

export function problemsIn(scenarios: Scenario[], labels: Label[]): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  const parts = new Map<string, string[] | null>();
  for (const s of scenarios) {
    if (!/^mp-\d{3}$/.test(s.id) || ids.has(s.id)) p.push(`bad or duplicate id ${s.id}`);
    ids.add(s.id);
    const a = s.answer;
    if (!(s.category in COVERAGE)) p.push(`${s.id}: unknown category`);
    if (typeof s.language !== "string" || !/^[a-z]{2,3}(-[A-Za-z]+)?$/.test(s.language)) p.push(`${s.id}: language`);
    if (!["Skills", "Experience"].includes(s.requirement?.category)) p.push(`${s.id}: requirement category`);
    if (s.split_id === null) {
      if (!CONTROLS.includes(s.requirement?.text)) p.push(`${s.id}: control requirement text`);
      if (a?.parts !== null) p.push(`${s.id}: control parts must be null`);
      parts.set(s.id, null);
    } else {
      const sp = SPLITS[s.split_id];
      if (!sp) p.push(`${s.id}: unknown split_id`);
      else {
        if (s.requirement?.text !== sp[0]) p.push(`${s.id}: requirement text differs from the approved wording`);
        const names = (a?.parts ?? []).map(x => x.part);
        if (names.length !== 2 || names[0] !== sp[1] || names[1] !== sp[2] || !(a.parts ?? []).every(x => typeof x.checked === "boolean")) p.push(`${s.id}: parts differ from the approved parts`);
        parts.set(s.id, [sp[1], sp[2]]);
      }
    }
    if (!s.role?.title || !Number.isInteger(s.role.months)) p.push(`${s.id}: role`);
    if (!INVOLVEMENT.includes(a?.involvement)) p.push(`${s.id}: involvement`);
    const doing = a.involvement === "PERFORMED" || a.involvement === "PART";
    if (a.frequency !== null && (!doing || !FREQUENCY.includes(a.frequency))) p.push(`${s.id}: frequency`);
    if (a.recency !== null && (!doing || !RECENCY.includes(a.recency))) p.push(`${s.id}: recency`);
    if (a.also_did_some !== null && !["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT"].includes(a.involvement)) p.push(`${s.id}: also_did_some`);
    if (a.explanation !== null && (typeof a.explanation !== "string" || a.explanation.length > 1000)) p.push(`${s.id}: explanation`);
    if (s.reply !== null && typeof s.reply !== "string") p.push(`${s.id}: reply`);
    if (!VERDICT.includes(s.writer_intended?.verdict)) p.push(`${s.id}: writer_intended`);
  }
  const labelled = new Map<string, number>();
  const byId = new Map(scenarios.map(s => [s.id, s]));
  for (const l of labels) {
    labelled.set(l.id, (labelled.get(l.id) ?? 0) + 1);
    if (!ids.has(l.id)) { p.push(`label for unknown id ${l.id}`); continue; }
    if (!VERDICT.includes(l.verdict) || (l.after_reply_verdict !== null && !VERDICT.includes(l.after_reply_verdict))) p.push(`${l.id}: label verdict`);
    if (!DONE.includes(l.personally_did)) p.push(`${l.id}: personally_did`);
    for (const k of ["contradiction", "needs_clarification", "text_read", "injection", "unsure"] as const) if (typeof l[k] !== "boolean") p.push(`${l.id}: ${k}`);
    const want = parts.get(l.id);
    if (want === null) { if (l.parts !== null) p.push(`${l.id}: control label parts must be null`); }
    else if (want) {
      if (!Array.isArray(l.parts) || l.parts.length !== 2 || l.parts[0].part !== want[0] || l.parts[1].part !== want[1]) p.push(`${l.id}: label parts differ`);
      else for (const x of l.parts) if (!DONE.includes(x.done) || typeof x.shown_by_own_text !== "boolean" || typeof x.contradicted !== "boolean") p.push(`${l.id}: label part fields`);
    }
    const tool = TOOL_SPLITS.includes(byId.get(l.id)?.split_id ?? "");
    if (tool ? typeof l.named_tool_met !== "boolean" : l.named_tool_met !== null) p.push(`${l.id}: named_tool_met`);
    if (typeof l.rationale !== "string" || !l.rationale.trim()) p.push(`${l.id}: rationale`);
  }
  for (const id of ids) if (labelled.get(id) !== 1) p.push(`${id}: labeled ${labelled.get(id) ?? 0} times`);
  return p;
}

it.skipIf(process.env.PARTS_UNSEAL === "1")("compound-split evaluation: validate (counts only)", () => {
  const { ok, manifest, combined } = integrity();
  const scenarios = load<{ scenarios: Scenario[] }>("scenarios.json").scenarios;
  const blind = load<{ scenarios: Partial<Scenario>[] }>("for_labeling.json").scenarios;
  const labels = load<{ labels: Label[] }>("labels.json").labels;
  const problems = problemsIn(scenarios, labels);
  const byCategory: Record<string, number> = {};
  const bySplit: Record<string, number> = {};
  for (const s of scenarios) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    const k = s.split_id ?? "control";
    bySplit[k] = (bySplit[k] ?? 0) + 1;
  }
  const shortfalls = Object.entries(COVERAGE).filter(([c, min]) => (byCategory[c] ?? 0) < min).map(([c, min]) => `${c} ${byCategory[c] ?? 0}/${min}`);
  const thinSplits = Object.keys(SPLITS).filter(k => (bySplit[k] ?? 0) < 6).map(k => `${k} ${bySplit[k] ?? 0}/6`);
  const intended = new Map(scenarios.map(s => [s.id, s.writer_intended.verdict]));
  const count = (f: (l: Label) => boolean) => labels.filter(f).length;
  const blindIds = new Set(blind.map(b => b.id));
  const report = {
    integrity: ok, combined, manifestCount: manifest.count, scenarios: scenarios.length, labels: labels.length,
    blindCopyHasNoTags: blind.every(b => !("category" in b) && !("writer_intended" in b)) && blind.length === scenarios.length && scenarios.every(s => blindIds.has(s.id)),
    problems: problems.length, shortfalls, thinSplits, byCategory, bySplit,
    languages: scenarios.reduce<Record<string, number>>((m, s) => ((m[s.language] = (m[s.language] ?? 0) + 1), m), {}),
    labelVerdicts: Object.fromEntries(VERDICT.map(v => [v, count(l => l.verdict === v)])),
    withReply: scenarios.filter(s => s.reply).length,
    labelFlags: {
      contradiction: count(l => l.contradiction), needsClarification: count(l => l.needs_clarification), textNotRead: count(l => !l.text_read),
      injection: count(l => l.injection), unsure: count(l => l.unsure), contradictedParts: labels.reduce((n, l) => n + (l.parts ?? []).filter(x => x.contradicted).length, 0),
      namedToolMet: count(l => l.named_tool_met === true), namedToolNotMet: count(l => l.named_tool_met === false),
    },
    writerLabelerAgreement: labels.filter(l => intended.get(l.id) === l.verdict).length,
  };
  if (process.env.PARTS_REPORT) writeFileSync(process.env.PARTS_REPORT, JSON.stringify(report, null, 1));
  expect(report.integrity).toBe(true);
  expect(report.scenarios).toBe(manifest.count);
  expect(report.blindCopyHasNoTags).toBe(true);
  expect(problems).toHaveLength(0);
  expect(shortfalls).toEqual([]);
  expect(thinSplits).toEqual([]);
});

it.runIf(process.env.PARTS_UNSEAL === "1")("compound-split evaluation: Stage G (refuses until approved)", () => {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  if (!process.env.PARTS_FREEZE_COMMIT || head !== process.env.PARTS_FREEZE_COMMIT) throw new Error("Refusing: PARTS_FREEZE_COMMIT must equal HEAD (the frozen code).");
  if (execSync("git status --porcelain", { encoding: "utf8" }).trim()) throw new Error("Refusing: the working tree must be clean at the freeze.");
  if (!integrity().ok) throw new Error("Refusing: the sealed files don't match MANIFEST.json.");
  throw new Error("Refusing: Stage G scoring and its acceptance criteria are defined and approved at Stage G, not before.");
});
