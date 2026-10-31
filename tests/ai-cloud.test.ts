import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CLOUD_MODEL, readAiConfig } from "@/lib/ai/config";
import { callMatchService } from "@/lib/ai/client";
import { CLOUD_CONSENT_VERSION, hasCurrentCloudConsent } from "@/lib/ai/consent";
import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { validateMatchResponse } from "@/lib/ai/match-validation";
import { costMicroUsd, formatUsd, reservationMicroUsd } from "@/lib/ai/pricing";
import { redactForCloud, type RedactionTerms } from "@/lib/ai/redaction";

// Phase 3 unit tests. All names, companies, schools, and contact details are fictional.

const contract = (name: string) => JSON.parse(readFileSync(`contracts/match/${name}`, "utf8"));
const SECRET = "unit-test-secret-0123456789abcdefghijklmnop";
const USER = "11111111-1111-4111-8111-111111111111";
const ok = { AI_SERVICE_URL: "http://127.0.0.1:8000", AI_SERVICE_SECRET: SECRET };
const cloudEnv = {
  ...ok,
  AI_CLOUD_ENABLED: "true",
  AI_COST_USER_DAILY_USD: "1",
  AI_COST_GLOBAL_DAILY_USD: "3",
  AI_COST_GLOBAL_MONTHLY_USD: "25",
  AI_CLOUD_ALLOWED_USERS: USER,
};

describe("pricing (verified Sonnet 5.5 rates)", () => {
  it("computes confirmed cost from usage, rounding up to a micro-USD", () => {
    // 1M input ($2) + 1M output ($10) + 1M cache read ($0.10) + 1M cache write ($2.50)
    expect(costMicroUsd(CLOUD_MODEL, { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 })).toBe(14_600_000);
    expect(costMicroUsd(CLOUD_MODEL, { input_tokens: 3000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(11_000);
    expect(costMicroUsd(CLOUD_MODEL, { input_tokens: 1, output_tokens: 0, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 })).toBe(3);
  });

  it("reserves the worst case: every input token at the highest input rate plus full output", () => {
    expect(reservationMicroUsd(CLOUD_MODEL, 40_000, 6_000)).toBe(160_000); // $0.10 + $0.06
    expect(formatUsd(160_000)).toBe("$0.16");
  });

  it("refuses models without a verified price", () => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    expect(() => costMicroUsd("claude-opus-5-5", usage)).toThrow();
    expect(() => reservationMicroUsd("constructor", 1, 1)).toThrow();
  });
});

describe("cloud configuration (off unless fully configured)", () => {
  it("is off by default and the rules engine stays enabled", () => {
    const config = readAiConfig(ok);
    expect(config).toMatchObject({ enabled: true, cloud: null, cloudReason: "Cloud analysis is turned off." });
  });

  it("parses budgets to micro-USD and the allow-list", () => {
    const config = readAiConfig(cloudEnv);
    expect(config.enabled && config.cloud).toMatchObject({
      provider: "anthropic", model: "claude-sonnet-5-5", userDailyMicroUsd: 1_000_000, globalDailyMicroUsd: 3_000_000, globalMonthlyMicroUsd: 25_000_000,
    });
    expect(config.enabled && config.cloud?.allowedUserIds.has(USER)).toBe(true);
  });

  it.each([
    [{ AI_COST_USER_DAILY_USD: "" }, "limits"],
    [{ AI_COST_GLOBAL_DAILY_USD: "0" }, "limits"],
    [{ AI_COST_GLOBAL_MONTHLY_USD: "-5" }, "limits"],
    [{ AI_COST_USER_DAILY_USD: "1.005" }, "limits"],
    [{ AI_COST_GLOBAL_MONTHLY_USD: "lots" }, "limits"],
    [{ AI_CLOUD_ALLOWED_USERS: "" }, "AI_CLOUD_ALLOWED_USERS"],
    [{ AI_CLOUD_ALLOWED_USERS: `${USER},someone@example.test` }, "AI_CLOUD_ALLOWED_USERS"],
    [{ AI_CLOUD_ENABLED: "yes" }, "turned off"],
  ])("fails closed for %j", (override, reason) => {
    const config = readAiConfig({ ...cloudEnv, ...override });
    expect(config.enabled && config.cloud).toBe(null);
    expect(config.enabled && config.cloudReason).toContain(reason);
  });
});

describe("versioned consent", () => {
  it("is current only for the current version with a date", () => {
    expect(hasCurrentCloudConsent({ aiCloudConsentAt: new Date(), aiCloudConsentVersion: CLOUD_CONSENT_VERSION })).toBe(true);
    expect(hasCurrentCloudConsent({ aiCloudConsentAt: new Date(), aiCloudConsentVersion: CLOUD_CONSENT_VERSION + 1 })).toBe(false);
    expect(hasCurrentCloudConsent({ aiCloudConsentAt: null, aiCloudConsentVersion: CLOUD_CONSENT_VERSION })).toBe(false);
  });
});

describe("cloud redaction", () => {
  const terms: RedactionTerms = {
    names: ["Avery Quillfeather"],
    companies: ["Contoso Fictional Labs", "Contoso"],
    schools: ["Fictional State Polytechnic"],
    employers: ["Northwind Imaginary"],
    emails: ["avery.q@example.test"],
  };
  const evidence: Evidence[] = [
    { id: "skill:00000000-0000-4000-8000-000000000001", kind: "skill", name: "SolidWorks", proficiency: null },
    {
      id: "experience:00000000-0000-4000-8000-000000000002", kind: "experience", job_title: "Engineer at contoso fictional labs", start_month: "2020-01", end_month: null,
      description: "Avery led tooling at Contoso. Email AVERY.Q@example.test or other.person@example.test, call +1 (555) 010-4477, see www.example.test/a. Ran 2019-2023 builds; 3 years. Contosoville is a town.",
    },
    { id: "education:00000000-0000-4000-8000-000000000003", kind: "education", qualification: "B.S.", field_of_study: null, start_month: "2016-08", end_month: "2020-05", description: "Fictional State Polytechnic honors" },
    { id: "project:00000000-0000-4000-8000-000000000004", kind: "project", title: "Quillfeather drone", description: null, contribution: null, results: null, skills: ["Python", "Northwind Imaginary SDK"] },
  ];
  const requirements = [{ index: 0, text: "Experience at Northwind Imaginary or Contoso", category: "Experience" as const, priority: "Required" as const }];
  const result = redactForCloud(evidence, requirements, terms);
  const text = JSON.stringify(result);

  it("removes known names, employers, schools, and the account email, case-insensitively", () => {
    for (const value of ["Avery", "Quillfeather", "Contoso Fictional Labs", "contoso fictional labs", "Fictional State Polytechnic", "Northwind Imaginary", "AVERY.Q@example.test"]) {
      expect(text).not.toContain(value);
    }
    expect(result.evidence[1]).toMatchObject({ job_title: "Engineer at [company]" });
    expect(result.requirements[0].text).toBe("Experience at [employer] or [company]");
    expect(result.evidence[3]).toMatchObject({ title: "[name] drone", skills: ["Python", "[employer] SDK"] });
  });

  it("removes other email addresses, phone numbers, and links, but keeps dates and durations", () => {
    const description = (result.evidence[1] as { description: string }).description;
    expect(description).toContain("[email] or [email]");
    expect(description).toContain("call [phone]");
    expect(description).toContain("see [link]");
    expect(description).toContain("Ran 2019-2023 builds; 3 years.");
  });

  it("matches whole words only and keeps ids, kinds, and structure", () => {
    expect((result.evidence[1] as { description: string }).description).toContain("Contosoville is a town.");
    expect(result.evidence.map(e => [e.id, e.kind])).toEqual(evidence.map(e => [e.id, e.kind]));
    expect(result.evidence[0]).toEqual(evidence[0]);
  });
});

describe("cloud response validation", () => {
  const request: MatchRequest = { ...contract("request.example.json"), provider: "anthropic", budget: { max_input_tokens: 20000, max_output_tokens: 6000 } };
  const response = () => ({
    ...structuredClone(contract("response.rules.example.json")),
    provider: "anthropic", model: CLOUD_MODEL, method_version: `${CLOUD_MODEL}/prompt-v1`,
    usage: { input_tokens: 3000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, provider_request_id: "req_fictional_1",
  });
  const expected = { provider: "anthropic", model: CLOUD_MODEL };

  it("accepts a cloud response from the requested model and returns its usage", () => {
    const result = validateMatchResponse(request, response(), expected);
    expect(result).toMatchObject({ provider: "anthropic", model: CLOUD_MODEL, providerRequestId: "req_fictional_1", usage: { input_tokens: 3000 } });
  });

  it.each([
    ["a different model", (r: Record<string, unknown>) => { r.model = "claude-opus-5-5"; }],
    ["the rules provider", (r: Record<string, unknown>) => { r.provider = "rules"; r.model = null; }],
    ["no usage", (r: Record<string, unknown>) => { r.usage = null; }],
  ])("rejects %s", (_label, mutate) => {
    const body = response();
    mutate(body);
    expect(() => validateMatchResponse(request, body, expected)).toThrow();
  });
});

describe("billing classification in the client", () => {
  const config = { serviceUrl: "http://127.0.0.1:8000", secret: SECRET };
  const request: MatchRequest = { ...contract("request.example.json"), provider: "anthropic" };
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it.each([
    [respond(502, { error: { code: "provider_refused", billed: "yes", usage: { input_tokens: 10, output_tokens: 2 }, provider_request_id: "req_x" } }), "provider_refused", "yes", 10],
    [respond(503, { error: { code: "provider_busy", billed: "no", usage: null } }), "provider_busy", "no", null],
    [respond(504, { error: { code: "provider_timeout", billed: "unknown" } }), "provider_timeout", "unknown", null],
    [respond(500, { error: { code: "something_new", billed: "maybe" } }), "service_unavailable", "unknown", null],
    [respond(401, { nothing: true }), "service_rejected", "no", null],
    [(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch, "provider_output_rejected", "unknown", null],
    [(async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }); }) as unknown as typeof fetch, "service_unavailable", "no", null],
    [(async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); }) as unknown as typeof fetch, "service_unavailable", "unknown", null],
    [(async () => { throw new DOMException("t", "TimeoutError"); }) as unknown as typeof fetch, "service_timeout", "unknown", null],
  ])("maps outcome %# to its code and billing state", async (fetchImpl, code, billed, inputTokens) => {
    const error = await callMatchService(config, request, fetchImpl).then(() => null, e => e);
    expect(error).toMatchObject({ code, billed });
    expect(error.usage?.input_tokens ?? null).toBe(inputTokens);
  });

  it("sends the provider and budget inside the signed body", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await callMatchService(config, { ...request, budget: { max_input_tokens: 15000, max_output_tokens: 6000 } }, fetchImpl as unknown as typeof fetch);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ provider: "anthropic", budget: { max_input_tokens: 15000, max_output_tokens: 6000 } });
  });
});

describe("consent wording stays honest about redaction", () => {
  it("states the cleaning limits and does not promise that all names are removed", async () => {
    const consent = await import("@/lib/ai/consent");
    const all = [...consent.CLOUD_SENT, ...consent.CLOUD_NOT_SENT, consent.CLOUD_TEXT_CLEANING, consent.CLOUD_TEXT_LIMITS].join(" ");
    expect(all).not.toMatch(/also removed from descriptions|all names|every name|guaranteed to remove/i);
    expect(consent.CLOUD_TEXT_LIMITS).toMatch(/not guaranteed/);
    expect(consent.CLOUD_TEXT_LIMITS).toMatch(/colleagues, clients, products, or other organizations/);
    expect(consent.CLOUD_CONSENT_VERSION).toBe(2); // consent text changed, so everyone consents again
  });

  it("documents the limit: names that aren't in the user's records are not removed", () => {
    const evidence: Evidence[] = [{
      id: "experience:00000000-0000-4000-8000-000000000009", kind: "experience", job_title: "Engineer", start_month: "2021-01", end_month: null,
      description: "Worked with Morgan Fictitious on the Zephyrline account.",
    }];
    const result = redactForCloud(evidence, [], { names: ["Avery Quill"], companies: [], schools: [], employers: [], emails: [] });
    expect((result.evidence[0] as { description: string }).description).toBe("Worked with Morgan Fictitious on the Zephyrline account.");
  });
});
