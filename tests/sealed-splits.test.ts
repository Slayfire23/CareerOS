import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Guard for the sealed evaluation splits. They are read only by their evaluation runners, once, after a freeze; ordinary
// development, tests and matching logic must never read them, and their bytes must never change.
//   m11_structured: structured ownership (docs/PHASE5_3_STAGE0_STRUCTURED_EVAL_PROTOCOL.md), read only by tests/eval/structured.eval.ts.
//   m11_followup4: the free-text follow-up split, read only by tests/eval/followup.eval.ts through FOLLOWUP_DIR at the freeze.
//   m11_parts: the compound-split evaluation R4 (docs/PHASE5_3_R4_EVAL_PROTOCOL.md), read only by tests/eval/parts.eval.ts.
const STRUCTURED = ["m11", "structured"].join("_");
const FOLLOWUP4 = ["m11", "followup4"].join("_");
const PARTS = ["m11", "parts"].join("_");
// Hashes cover the content with line endings normalized to LF, so a checkout with CRLF endings (Windows) and one with LF
// (CI on Linux) agree. Any other byte change still fails.
const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf.toString().replace(/\r\n/g, "\n")).digest("hex");
const posix = (p: string) => p.split(sep).join("/");

// Recorded on 2026-11-10 before Stage 0 began (LF-normalized); the split was committed unopened in 52a26e8.
const FOLLOWUP4_HASHES: Record<string, string> = {
  "for_labeling.json": "5b708a29d95edd4737c7f61997da9e2ede5b0ecacf9df51b2e572bcbb7fe6fe6",
  "labels.json": "679292a90c41f7d14ef17c3f4f1f0a1d6ce49d8357cc4bf19f6cf4cf8c63d7f7",
  "scenarios.json": "3f86f577935c9eae551874270be2474a8a813aa560db1cd4499b929632986ca2",
};
const STRUCTURED_FILES = ["scenarios.json", "for_labeling.json", "labels.json"];
const PARTS_FILES = ["scenarios.json", "for_labeling.json", "labels.json"];

const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs|py|json)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", ".venv", "__pycache__", ".git", "fixtures", "reports", ".pytest_cache", ".ruff_cache"]);
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(path, out); }
    else if (CODE.test(name)) out.push(posix(relative(process.cwd(), path)));
  }
  return out;
}
const ROOT_CONFIGS = readdirSync(".").filter(f => /\.(ts|mts|mjs|js|json)$/.test(f) && f !== "package-lock.json");
const SCANNED = [...walk("src"), ...walk("scripts"), ...walk("tests"), ...walk("e2e"), ...walk("ai-service/app"), ...walk("ai-service/evals"), ...walk("ai-service/tests"), ...ROOT_CONFIGS];
const ALLOWED: Record<string, string[]> = {
  [STRUCTURED]: ["tests/eval/structured.eval.ts", "tests/sealed-splits.test.ts"],
  [FOLLOWUP4]: ["tests/sealed-splits.test.ts"],
  [PARTS]: ["tests/eval/parts.eval.ts", "tests/sealed-splits.test.ts"],
};

describe("sealed splits are read only by their evaluation runners", () => {
  it("scans a meaningful set of files", () => {
    expect(SCANNED.length).toBeGreaterThan(100);
    expect(SCANNED).toContain("src/lib/ai/rules/answer-review.ts");
  });

  it.each([STRUCTURED, FOLLOWUP4, PARTS])("no source, script, browser test or ordinary test names %s", name => {
    const offenders = SCANNED.filter(f => !ALLOWED[name].includes(f) && readFileSync(f, "utf8").includes(name));
    expect(offenders).toEqual([]);
  });

  it("application code never reaches into test fixtures", () => {
    // Code files only: two data files mention a shared fixture in their review comments, which reads nothing.
    expect(walk("src").filter(f => /\.(ts|tsx)$/.test(f) && /tests[\\/]fixtures/.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("ordinary unit tests never collect the evaluation runners or fixtures", () => {
    const config = readFileSync("vitest.config.mts", "utf8");
    expect(config).toContain('include: ["tests/**/*.test.ts"]');
    expect(readFileSync("vitest.integration.config.mts", "utf8")).toContain('include: ["tests/integration/**/*.integration.ts"]');
  });

  it("the structured runner refuses to unseal without an explicit, frozen, clean run", () => {
    const runner = readFileSync("tests/eval/structured.eval.ts", "utf8");
    for (const gate of ['process.env.STRUCTURED_UNSEAL === "1"', "STRUCTURED_FREEZE_COMMIT", "git status --porcelain", "integrity().ok"]) expect(runner).toContain(gate);
  });

  it("the compound-split runner refuses to unseal without an explicit, frozen, clean, approved run", () => {
    const runner = readFileSync("tests/eval/parts.eval.ts", "utf8");
    for (const gate of ['process.env.PARTS_UNSEAL === "1"', "PARTS_FREEZE_COMMIT", "git status --porcelain", "integrity().ok", "unsealRefusal(", "APPROVAL_FILE"]) expect(runner).toContain(gate);
    // The gates (tests/eval/parts-score.ts) refuse before any sealed file is parsed, and Stage G scoring needs the owner's
    // recorded approval. That record does not exist before the owner approves.
    const gates = readFileSync("tests/eval/parts-score.ts", "utf8");
    for (const gate of ["Refusing: PARTS_UNSEAL=1 is required.", "Refusing: the working tree must be clean", "Refusing: code changed since the freeze commit.", "Refusing: Stage G scoring needs the owner's recorded approval"]) expect(gates).toContain(gate);
    expect(runner.indexOf("if (refusal) throw")).toBeLessThan(runner.indexOf('load<{ as_of_month'));
  });

  // Stage G ran once (2026-11-16) under the owner's approval and FAILED; that result is final. The authorization is
  // recognized only as this exact, consumed historical record. Nothing here opens a sealed scenario: it hashes the approval
  // record, the counts-only report and the frozen runner and scorer, and reads only the two docs' own fields.
  it("Stage G R4: only the exact, consumed approval is recognized, and no second evaluation can run", () => {
    // Every authorization record in the repository: exactly the one Stage G record, nothing else.
    const records = walk("docs").concat(walk("tests"), walk("scripts")).filter(f => /approval/i.test(f.split("/").pop() ?? "") && f.endsWith(".json"));
    expect(records).toEqual([STAGE_G.approval]);
    expect(sha256(readFileSync(STAGE_G.approval)), "approval record changed").toBe(STAGE_G.approvalSha256);
    const approval = JSON.parse(readFileSync(STAGE_G.approval, "utf8")) as { freezeCommit: string; policySha256: string; singleUse: boolean };
    expect(approval).toMatchObject({ freezeCommit: STAGE_G.freezeCommit, policySha256: STAGE_G.policySha256, singleUse: true });
    // Consumed: the frozen counts-only report exists, unchanged, for the same freeze. Its commit changed a file other than
    // the approval record after the freeze, so the runner's "code changed since the freeze commit" gate refuses any rerun.
    expect(sha256(readFileSync(STAGE_G.report)), "Stage G report changed").toBe(STAGE_G.reportSha256);
    const report = JSON.parse(readFileSync(STAGE_G.report, "utf8")) as { freezeCommit: string; policySha256: string; pass: boolean };
    expect(report).toMatchObject({ freezeCommit: STAGE_G.freezeCommit, policySha256: STAGE_G.policySha256, pass: false });
    expect(STAGE_G.report).not.toBe(STAGE_G.approval);
    // The frozen runner and scorer are byte-identical to the scored versions (c18d555), so no gate can be weakened.
    expect(sha256(readFileSync("tests/eval/parts.eval.ts")), "runner changed").toBe(STAGE_G.runnerSha256);
    expect(sha256(readFileSync("tests/eval/parts-score.ts")), "scorer changed").toBe(STAGE_G.scorerSha256);
    const gates = readFileSync("tests/eval/parts-score.ts", "utf8");
    expect(gates).toContain('if (g.changedSinceFreeze.some(f => f !== APPROVAL_FILE)) return "Refusing: code changed since the freeze commit.";');
  });
});

const STAGE_G = {
  approval: "docs/PHASE5_3_STAGE_G_APPROVAL.json",
  approvalSha256: "1a409caf2a0bf3b2ade1a2b4e5c69509ab3101c66581fad851367c9d676c3a81", // 72f2b41
  report: "docs/PHASE5_3_STAGE_G_REPORT.json",
  reportSha256: "1c02cac69f03d5bec33603ebc6166ae4e325d80a7550484e0da084c703ff2e0d", // a99c734
  freezeCommit: "4a4ce2a64516d4b8e388afd96f2ec56fffd428ee",
  policySha256: "71e2e8c353408482bd5132274e643bb5218feb2683a3a2bfdf6bda5af9d1d324",
  runnerSha256: "9763c98dbc11f121d96a310e05fb2573882d20a341a963349ea73554ca3d41c4", // tests/eval/parts.eval.ts at c18d555
  scorerSha256: "1866a6ba440956fd478de9595281c39823b2c7f9780d13da1aaa76049450a7e3", // tests/eval/parts-score.ts at c18d555
} as const;

describe("sealed splits are frozen", () => {
  it(`${FOLLOWUP4} keeps its recorded bytes`, () => {
    for (const [file, hash] of Object.entries(FOLLOWUP4_HASHES)) expect(sha256(readFileSync(`tests/fixtures/${FOLLOWUP4}/${file}`)), file).toBe(hash);
  });

  it(`${STRUCTURED} matches its manifest (hashes only; the files are never parsed here)`, () => {
    const dir = `tests/fixtures/${STRUCTURED}`;
    const manifest = JSON.parse(readFileSync(`${dir}/MANIFEST.json`, "utf8")) as { files: Record<string, string>; combined: string; count: number; frozen: string };
    expect(Object.keys(manifest.files).sort()).toEqual([...STRUCTURED_FILES].sort());
    const actual = Object.fromEntries(STRUCTURED_FILES.map(f => [f, sha256(readFileSync(`${dir}/${f}`))]));
    for (const f of STRUCTURED_FILES) expect(actual[f], f).toBe(manifest.files[f]);
    expect(sha256(STRUCTURED_FILES.map(f => `${f}:${actual[f]}`).join("\n"))).toBe(manifest.combined);
    expect(manifest.count).toBeGreaterThanOrEqual(160);
    expect(readdirSync(dir).sort()).toEqual(["MANIFEST.json", ...STRUCTURED_FILES].sort());
  });

  it(`${PARTS} matches its manifest (hashes only; the files are never parsed here)`, () => {
    const dir = `tests/fixtures/${PARTS}`;
    const manifest = JSON.parse(readFileSync(`${dir}/MANIFEST.json`, "utf8")) as { files: Record<string, string>; combined: string; count: number; frozen: string };
    expect(Object.keys(manifest.files).sort()).toEqual([...PARTS_FILES].sort());
    const actual = Object.fromEntries(PARTS_FILES.map(f => [f, sha256(readFileSync(`${dir}/${f}`))]));
    for (const f of PARTS_FILES) expect(actual[f], f).toBe(manifest.files[f]);
    expect(sha256(PARTS_FILES.map(f => `${f}:${actual[f]}`).join("\n"))).toBe(manifest.combined);
    expect(manifest.count).toBeGreaterThanOrEqual(300);
    expect(readdirSync(dir).sort()).toEqual(["MANIFEST.json", ...PARTS_FILES].sort());
  });
});
