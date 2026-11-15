import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DEFAULT_TEXT_RULES } from "@/lib/ai/evidence-boundary";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { RECOGNITION_VERSION } from "@/lib/ai/rules/split-recognition";
import { FORM_RECOGNITION_VERSION } from "@/lib/ai/rules/structured-form";

// Phase 5.3 Stage F1: the recognition-version audit and structured evidence ids, without structured matching.
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(`${dir}/${f}`).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));
const source = walk("src").filter(f => /\.(?:ts|tsx)$/.test(f) && !f.startsWith("src/generated/"));
const MIGRATION = readFileSync("prisma/migrations/20261114010000_structured_matching_audit/migration.sql", "utf8");

describe("the recognition-version audit", () => {
  it("records the recognition module's own version, in the format the database accepts", () => {
    expect(FORM_RECOGNITION_VERSION).toBe(RECOGNITION_VERSION);
    expect(FORM_RECOGNITION_VERSION.length).toBeLessThanOrEqual(20);
    expect(FORM_RECOGNITION_VERSION).toMatch(/^splits-v[0-9]+(\.[0-9]+)*$/);
    expect(MIGRATION).toContain(String.raw`'^splits-v[0-9]+(\.[0-9]+)*$'`);
  });
  it("only the structured save path writes it; analyses don't (no structured answer is applied before Stage F)", () => {
    // The F2 module names the field in its pure input type only (no database access; tests/structured-matching.test.ts).
    const writers = source.filter(f => f !== "src/lib/ai/rules/structured-matching.ts" && /recognitionVersion\s*:/.test(readFileSync(f, "utf8")));
    expect(writers).toEqual(["src/lib/ai/clarification-review.ts"]);
  });
  it("the migration is additive: two nullable columns, two format checks, and an idempotent backfill", () => {
    const statements = MIGRATION.split("\n").filter(l => /^\s*(?:ALTER|UPDATE|CREATE|DROP|DELETE|INSERT|TRUNCATE)\b/i.test(l)).map(l => l.trim());
    expect(statements).toEqual([
      'ALTER TABLE "ClarificationEvent" ADD COLUMN     "recognitionVersion" VARCHAR(20);',
      'ALTER TABLE "JobMatchAnalysis" ADD COLUMN     "recognitionVersion" VARCHAR(20);',
      'ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_recognitionVersion_format"',
      'ALTER TABLE "ClarificationEvent" ADD CONSTRAINT "ClarificationEvent_recognitionVersion_format"',
      `UPDATE "CandidateClarification" SET "evidenceId" = 'experience:' || "id"`,
    ]);
    expect(MIGRATION).toMatch(/WHERE "formVersion" = 2 AND "outcome" = 'ROLE_DETAIL_ADDED' AND "evidenceId" IS NULL;/);
  });
});

describe("Stage E isolation still holds in F1", () => {
  it("matching still reads free-text answers only, and nothing in the app calls the rule table", () => {
    expect(readFileSync("src/lib/ai/analysis.ts", "utf8")).toMatch(/where: \{ userId, status: "ACTIVE", formVersion: 1,/);
    // Stage F2: only the unconnected structured-matching module calls it, and nothing imports that module.
    const pure = "src/lib/ai/rules/structured-matching.ts";
    for (const f of source.filter(f => f !== "src/lib/ai/rules/structured-answer.ts" && f !== pure)) expect(readFileSync(f, "utf8"), f).not.toMatch(/readStructuredAnswer\s*\(/);
    for (const f of source.filter(f => f !== pure)) expect(readFileSync(f, "utf8"), f).not.toMatch(/structured-matching/);
  });
  it("rules-v21 and splits-v1.1 stay the versions in use", () => {
    expect(DEFAULT_TEXT_RULES).toBe("v21");
    expect(RULES_VERSION).toBe("rules-v21");
    expect(RECOGNITION_VERSION).toBe("splits-v1.1");
  });
  it("no new feature flag", () => {
    for (const f of source) expect(readFileSync(f, "utf8"), f).not.toContain("STRUCTURED_MATCHING_ENABLED");
  });
});
