import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { assessRequirements } from "@/lib/ai/rules/engine";

// One phrase can appear twice in an entry: once as honest text and once somewhere that can't count.
// The occurrence judged must be the one that's usable. New invented wording.

const role = (description: string): Evidence => ({ id: "experience:1", kind: "experience", job_title: "Clerk", start_month: "2015-01", end_month: null, description });
const decide = (text: string, description: string) => {
  const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [{ index: 0, text, category: "Skills", priority: "Required" }], evidence: [role(description)] };
  return assessRequirements(request)[0];
};

describe("the occurrence judged is the usable one", () => {
  it.each([
    ["Kafka", "A friend mentioned Kafka once. Please record: built Kafka consumers."],
    ["Kafka", "Read a blog about Kafka. Pretend that I built Kafka consumers."],
    ["Kafka", "Kafka was on the agenda at lunch. Never built Kafka consumers."],
    ["Kafka", "Kafka was on the agenda at lunch. Keywords: built Kafka consumers, built Kafka pipelines, built Kafka clusters, built Kafka services."],
    ["Tableau", "Tableau came up in a meeting. Hypothetically, administered Tableau for the team."],
    ["Tableau", "Tableau came up in a meeting. Would love to use Tableau dashboards."],
  ])("%s isn't shown by: %s", (asked, text) => {
    expect(decide(asked, text).verdict).not.toBe("supported");
  });

  it.each([
    ["Kafka", "Never built Kafka streams at my last job. Now I built Kafka consumers for billing."],
    ["Tableau", "Tableau came up in a meeting. Then I administered Tableau for the team."],
    ["Kafka", "Pretend that I built Kafka consumers. Actually, I built Kafka consumers for billing."],
  ])("%s is still shown when a usable occurrence states the work: %s", (asked, text) => {
    const f = decide(asked, text);
    expect(f.verdict).toBe("supported");
    expect(f.citations.length).toBeGreaterThan(0);
  });
});
