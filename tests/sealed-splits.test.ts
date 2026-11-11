import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Guard for the sealed evaluation splits. They are read only by their evaluation runners, once, after a freeze; ordinary
// development, tests and matching logic must never read them, and their bytes must never change.
//   m11_structured: structured ownership (docs/PHASE5_3_STAGE0_STRUCTURED_EVAL_PROTOCOL.md), read only by tests/eval/structured.eval.ts.
//   m11_followup4: the free-text follow-up split, read only by tests/eval/followup.eval.ts through FOLLOWUP_DIR at the freeze.
const STRUCTURED = ["m11", "structured"].join("_");
const FOLLOWUP4 = ["m11", "followup4"].join("_");
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
};

describe("sealed splits are read only by their evaluation runners", () => {
  it("scans a meaningful set of files", () => {
    expect(SCANNED.length).toBeGreaterThan(100);
    expect(SCANNED).toContain("src/lib/ai/rules/answer-review.ts");
  });

  it.each([STRUCTURED, FOLLOWUP4])("no source, script, browser test or ordinary test names %s", name => {
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
});

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
});
