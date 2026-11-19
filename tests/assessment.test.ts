import { describe, expect, it } from "vitest";
import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import type { Finding } from "@/lib/ai/match-validation";
import { approvalRefusal, assessmentSnapshot, carriedFeedback, decisionFor, type DecisionInputs } from "@/lib/ai/assessment";

// V1 (D4): decisions and the approval snapshot. Synthetic data.
const req = (index: number, text: string): MatchRequirement => ({ index, text, category: "Skills", priority: "Required" });
const finding = (requirementIndex: number, verdict: Verdict, evidenceId?: string): Finding => ({
  requirementIndex, verdict, explanation: "x", citations: evidenceId ? [{ evidenceId, quote: "q" }] : [], caveats: [], basis: verdict === "supported" ? "listed_skill" : "no_evidence", evidenceSources: [],
} as unknown as Finding);
const keyFor = (r: MatchRequirement) => `key:${r.text.toLowerCase()}`;
const none: DecisionInputs = { feedback: {}, answeredKeys: new Set(), deniedKeys: new Set(), skippedKeys: new Set(), answeredTexts: new Set(), declinedTexts: new Set() };

describe("decisionFor", () => {
  const r = req(0, "Forklift operation");
  it("feedback first: agree is confirmed; disagree is not claimed (credited) or disputed (not credited)", () => {
    expect(decisionFor(r, finding(0, "supported"), { ...none, feedback: { "0": { choice: "agree", note: null } } }, keyFor)).toBe("confirmed");
    expect(decisionFor(r, finding(0, "possible"), { ...none, feedback: { "0": { choice: "disagree", note: null } } }, keyFor)).toBe("not_claimed");
    expect(decisionFor(r, finding(0, "insufficient_information"), { ...none, feedback: { "0": { choice: "disagree", note: null } } }, keyFor)).toBe("disputed");
  });
  it("otherwise the review's denial, answer or skip (or basic mode's answer or No)", () => {
    expect(decisionFor(r, finding(0, "insufficient_information"), { ...none, deniedKeys: new Set(["key:forklift operation"]), answeredKeys: new Set(["key:forklift operation"]) }, keyFor)).toBe("denied");
    expect(decisionFor(r, finding(0, "possible"), { ...none, answeredKeys: new Set(["key:forklift operation"]) }, keyFor)).toBe("answered");
    expect(decisionFor(r, finding(0, "insufficient_information"), { ...none, skippedKeys: new Set(["key:forklift operation"]) }, keyFor)).toBe("skipped");
    expect(decisionFor(r, finding(0, "possible"), { ...none, answeredTexts: new Set(["forklift operation"]) }, keyFor)).toBe("answered");
    expect(decisionFor(r, finding(0, "insufficient_information"), { ...none, declinedTexts: new Set(["forklift operation"]) }, keyFor)).toBe("denied");
  });
  it("no decision yet", () => expect(decisionFor(r, finding(0, "supported"), none, keyFor)).toBeNull());
});

describe("assessmentSnapshot: never raises a verdict", () => {
  const view = { requirements: [req(0, "Forklift operation"), req(1, "Payroll processing"), req(2, "Welding")], findings: [finding(0, "supported", "skill:a"), finding(1, "insufficient_information"), finding(2, "possible", "experience:b")] };
  it("records CareerOS's verdicts unchanged; a person's decision can only lower what's claimed", () => {
    const inputs: DecisionInputs = { ...none, feedback: { "0": { choice: "agree", note: "Daily" }, "1": { choice: "agree", note: null }, "2": { choice: "disagree", note: "Not me" } } };
    const s = assessmentSnapshot(view, inputs, keyFor);
    expect(s.undecided).toEqual([]);
    expect(s.entries.map(e => [e.verdict, e.decision, e.recorded])).toEqual([["supported", "confirmed", "supported"], ["insufficient_information", "confirmed", "insufficient_information"], ["possible", "not_claimed", "not_claimed"]]);
    expect(s.entries[0]).toMatchObject({ evidenceIds: ["skill:a"], note: "Daily", requirement: "Forklift operation" });
    expect(s.summary).toMatchObject({ total: 3, recorded: { supported: 1, insufficient_information: 1, not_claimed: 1, possible: 0 } });
  });
  it("agreeing with Not enough information, or disputing it, never makes it Supported or Possible", () => {
    for (const choice of ["agree", "disagree"] as const) {
      const s = assessmentSnapshot(view, { ...none, feedback: { "0": { choice: "agree", note: null }, "1": { choice, note: null }, "2": { choice: "agree", note: null } } }, keyFor);
      expect(s.entries[1].recorded).toBe("insufficient_information");
    }
  });
  it("lists every undecided requirement", () => {
    expect(assessmentSnapshot(view, { ...none, feedback: { "0": { choice: "agree", note: null } } }, keyFor).undecided).toEqual([1, 2]);
  });
});

describe("approvalRefusal: stale, changed or incomplete assessments can't be approved", () => {
  const ok = { latestId: "a", analysisId: "a", outOfDate: { requirements: false, profile: false, rules: false }, feedbackVersion: 3, seenFeedbackVersion: 3, undecided: 0, total: 2 };
  it("refuses each case and accepts a current, fully decided one", () => {
    expect(approvalRefusal(ok)).toBeNull();
    expect(approvalRefusal({ ...ok, analysisId: "b" })).toBe("not_latest");
    expect(approvalRefusal({ ...ok, latestId: null })).toBe("not_latest");
    for (const k of ["requirements", "profile", "rules"] as const) expect(approvalRefusal({ ...ok, outOfDate: { ...ok.outOfDate, [k]: true } })).toBe("out_of_date");
    expect(approvalRefusal({ ...ok, seenFeedbackVersion: 2 })).toBe("changed");
    expect(approvalRefusal({ ...ok, undecided: 1 })).toBe("undecided");
    expect(approvalRefusal({ ...ok, total: 0 })).toBe("empty");
  });
});

describe("carriedFeedback: decisions survive a recalculation only where nothing changed", () => {
  it("keeps a decision for the same requirement and result; drops it when the result changed or the requirement is new", () => {
    const previous = { requirements: [req(0, "A"), req(1, "B")], findings: [finding(0, "supported"), finding(1, "insufficient_information")], feedback: { "0": { choice: "agree" }, "1": { choice: "disagree" } } };
    const next = { requirements: [req(0, "A"), req(1, "B"), req(2, "C")], findings: [finding(0, "supported"), finding(1, "possible"), finding(2, "possible")] };
    expect(carriedFeedback(previous, next)).toEqual({ "0": { choice: "agree" } });
  });
});
