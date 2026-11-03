import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { MatchRequest } from "@/lib/ai/evidence";
import { validateMatchResponse } from "@/lib/ai/match-validation";
import { RULES_VERSION, assessRequirements, rulesResponse } from "@/lib/ai/rules/engine";

// The TypeScript engine against what the frozen Python engine (rules-v5) decided on every evaluation
// case seen so far (ai-service/devtools/export_rules_golden.py). Any difference must be listed below
// with its reason. Fictional data only.

type Golden = {
  set: string;
  id: string;
  allowed: Record<string, string[]>;
  request: MatchRequest;
  findings: { requirement_index: number; verdict: string; basis: string; explanation: string; citations: unknown[]; caveats: string[]; review?: string }[];
};
const golden = JSON.parse(readFileSync("tests/fixtures/rules_v5_golden.json", "utf8")) as { method_version: string; cases: Golden[] };

/** Requirements where the engine deliberately decides differently: "<set>/<case>/<index>" -> why. */
const SAME_FIELD = "Years now count only in the field asked for, and a role naming that field and covering the time is supported.";
const INTENDED_VERDICT_CHANGES: Record<string, string> = {
  "F/f-inj-prof-field-note/0": "A field of study holding a claim is not evidence (set F's false supported).",
  "F/f-legit-as-a/0": "A requirement naming a role exactly is matched against that job title.",
  "F/f-syn-redshift/0": "\"AWS Redshift\" and \"Amazon Redshift\" are now the same name in the reviewed table.",
  "A/cicd-in-role/0": "A related technology named in free text, used in work, and in the reviewed table is possible.",
  "D/d-large-fullstack/7": "A related technology named in free text, used in work, and in the reviewed table is possible.",
  "A/freelance-is-employment/0": SAME_FIELD,
  "A/years-two-roles/0": SAME_FIELD,
  "B/b-large-data-engineer/5": SAME_FIELD,
  "C/c-yrs-python-met/0": SAME_FIELD,
  "D/d-yrs-python-roles/0": SAME_FIELD,
  "F/f-yrs-months/0": SAME_FIELD,
  "F/f-yrs-domain/0": "Sales Lead shows nothing about fintech, so the years don't count toward it.",
  "C/c-inject-override-mode/0": "Same verdict; instruction-like text is now recognized as such.",
  "A/cert-not-a-skill/0": "Listing the skill behind a credential doesn't show the credential.",
  "A/large-platform-engineer/13": "Listing the skill behind a credential doesn't show the credential.",
  "F/f-large-data-engineer/4": "Terraform modules described in a role are related to infrastructure as code, per the reviewed table.",
};
/** Experience requirements stating a duration: same verdict, but explained and cited by field now. */
const durationRewording = (c: Golden, index: number) => {
  const r = c.request.requirements[index];
  return (r.category === "Experience" && /\b(year|month|decade)/i.test(r.text))
    // Credentials: same verdict, with wording saying what's shown and what isn't.
    || /\b(certif|licen[cs]e|clearance|card|permit|cdl|cpa|pmp|security\+)/i.test(r.text);
};

const key = (c: Golden, index: number) => `${c.set}/${c.id}/${index}`;
/** Python and JavaScript round .x5 differently; this only appears in explanations. */
const normalized = (text: string) => text.replace(/\d+\.\d+/g, "N");

describe("TypeScript rules engine preserves the frozen Python engine's decisions", () => {
  it("has the golden cases", () => {
    expect(golden.method_version).toBe("rules-v5");
    expect(golden.cases.length).toBeGreaterThan(250);
  });

  it.each(golden.cases.map(c => [`${c.set}/${c.id}`, c] as const))("%s", (_name, c) => {
    const findings = assessRequirements(c.request);
    expect(findings.map(f => f.requirement_index)).toEqual(c.findings.map(f => f.requirement_index));
    for (const [i, expected] of c.findings.entries()) {
      const actual = findings[i];
      if (INTENDED_VERDICT_CHANGES[key(c, expected.requirement_index)]) continue;
      // The human review of Set H: a role stating direct use, or naming the field, is direct evidence.
      if (actual.verdict === "supported" && ["described_in_work", "role_description", "employment_dates"].includes(actual.basis)) {
        expect(c.allowed[String(expected.requirement_index)], "a label on this case rejects Supported").toContain("supported");
        continue;
      }
      if (durationRewording(c, expected.requirement_index)) {
        expect(actual.verdict).toBe(expected.verdict);
        continue;
      }
      expect({ verdict: actual.verdict, basis: actual.basis, review: actual.review, citations: actual.citations, caveats: actual.caveats })
        .toEqual({ verdict: expected.verdict, basis: expected.basis, review: expected.review, citations: expected.citations, caveats: expected.caveats });
      expect(normalized(actual.explanation)).toBe(normalized(expected.explanation));
    }
  });

  it("every result passes the independent validator", () => {
    for (const c of golden.cases) {
      const body = rulesResponse(c.request, { provider: "rules", model: null, methodVersion: RULES_VERSION });
      expect(() => validateMatchResponse(c.request, JSON.parse(JSON.stringify(body)), { provider: "rules", model: null })).not.toThrow();
    }
  });
});
