import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The human reviewer's decisions on Set H are kept apart from the cases and AI labels, and checked for
// completeness. Fictional data only.

type Decision = { case: string; source_case: string; requirement_index: number; verdict: string };
const review = JSON.parse(readFileSync("tests/fixtures/set_h_human_review.json", "utf8")) as {
  provenance: { type: string; worksheet: string };
  vocabulary: string[];
  decisions: Decision[];
};
const setH = JSON.parse(readFileSync("ai-service/evals/holdout_h_cases.json", "utf8")) as { cases: { id: string; requirements: { text: string }[] }[] };
const worksheet = readFileSync(review.provenance.worksheet, "utf8");

describe("Set H human review", () => {
  it("records its provenance as manual human review", () => {
    expect(review.provenance.type).toBe("manual_human_review");
  });

  it("has exactly 26 unique case ids, with none missing", () => {
    const expected = Array.from({ length: 26 }, (_, i) => `H-${String(i + 1).padStart(2, "0")}`);
    expect(review.decisions.map(d => d.case)).toEqual(expected);
    expect(new Set(review.decisions.map(d => d.case)).size).toBe(26);
  });

  it("uses only the four verdicts", () => {
    expect(review.vocabulary).toEqual(["supported", "possible", "gap", "insufficient_information"]);
    for (const d of review.decisions) expect(review.vocabulary).toContain(d.verdict);
  });

  it("points at real Set H requirements, in the worksheet's order", () => {
    const blocks = worksheet.split(/^### /m).slice(1);
    expect(blocks).toHaveLength(26);
    review.decisions.forEach((d, i) => {
      const source = setH.cases.find(c => c.id === d.source_case);
      expect(source?.requirements[d.requirement_index], d.case).toBeDefined();
      expect(blocks[i], d.case).toContain(`<sub>${d.source_case}</sub>`);
      expect(blocks[i].split("\n")[0], d.case).toBe(`${i + 1}. ${source!.requirements[d.requirement_index].text.replace(/\n/g, " ")}`);
    });
  });
});
