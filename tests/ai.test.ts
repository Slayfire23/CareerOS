import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAiConfig } from "@/lib/ai/config";
import { AiServiceError, callMatchService } from "@/lib/ai/client";
import { EvidenceError, buildEvidence, buildRequirements, evidenceFingerprint, type MatchRequest } from "@/lib/ai/evidence";
import { MatchValidationError, PROJECT_NOT_EMPLOYMENT, statedYears, validateMatchResponse } from "@/lib/ai/match-validation";
import { canonicalString, sign } from "@/lib/ai/signing";

const contract = (name: string) => JSON.parse(readFileSync(`contracts/match/${name}`, "utf8"));
const exampleRequest = (): MatchRequest => ({ ...contract("request.example.json"), provider: "rules" });
const exampleResponse = () => structuredClone(contract("response.rules.example.json"));
const SECRET = "unit-test-secret-0123456789abcdefghijklmnop";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("request signing", () => {
  it("matches the shared Python test vector exactly", () => {
    const v = contract("signature.example.json");
    expect(canonicalString(v.timestamp, v.request_id, v.body)).toBe(v.canonical);
    expect(sign(v.secret, v.timestamp, v.request_id, v.body)).toBe(v.signature);
  });

  it("changes when any signed part changes", () => {
    const base = sign(SECRET, "1", uuid(1), "{}");
    expect(sign(SECRET, "2", uuid(1), "{}")).not.toBe(base);
    expect(sign(SECRET, "1", uuid(2), "{}")).not.toBe(base);
    expect(sign(SECRET, "1", uuid(1), "{ }")).not.toBe(base);
    expect(sign(`${SECRET}x`, "1", uuid(1), "{}")).not.toBe(base);
  });
});

describe("AI configuration", () => {
  const ok = { AI_SERVICE_URL: "http://127.0.0.1:8000", AI_SERVICE_SECRET: SECRET };
  it("is disabled unless both URL and secret are set", () => {
    expect(readAiConfig({}).enabled).toBe(false);
    expect(readAiConfig({ AI_SERVICE_URL: ok.AI_SERVICE_URL }).enabled).toBe(false);
  });
  it.each([
    [{ AI_SERVICE_SECRET: "short" }, "32"],
    [{ AI_SERVICE_URL: "http://ai.example.com" }, "HTTPS"],
    [{ AI_SERVICE_URL: "https://user:pw@ai.example.com" }, "credentials"],
    [{ AI_SERVICE_URL: "not a url" }, "valid URL"],
    [{ AI_ANALYSIS_DAILY_LIMIT: "0" }, "1 to 1000"],
    [{ AI_ANALYSIS_DAILY_LIMIT: "2.5" }, "1 to 1000"],
  ])("rejects unsafe settings %j", (override, reason) => {
    const config = readAiConfig({ ...ok, ...override });
    expect(config.enabled).toBe(false);
    if (!config.enabled) expect(config.reason).toContain(reason);
  });
  it("accepts localhost over HTTP, HTTPS elsewhere, and defaults to 20 per day, 60 attempts, and no cloud", () => {
    expect(readAiConfig(ok)).toMatchObject({ enabled: true, dailyLimit: 20, attemptLimit: 60, cloud: null, serviceUrl: "http://127.0.0.1:8000" });
    expect(readAiConfig({ ...ok, AI_SERVICE_URL: "https://ai.example.com/", AI_ANALYSIS_DAILY_LIMIT: "5" })).toMatchObject({
      enabled: true, serviceUrl: "https://ai.example.com", dailyLimit: 5,
    });
  });
});

const profile = {
  technicalSkills: [{ id: uuid(1), name: " SolidWorks ", proficiency: "ADVANCED" }],
  professionalExperiences: [{ id: uuid(2), jobTitle: "Engineer", startMonth: "2023-01", endMonth: null, description: "  " }],
  educationEntries: [{ id: uuid(3), qualification: "B.S.", fieldOfStudy: "Mechanical Engineering", startMonth: "2019-08", endMonth: "2023-05", description: null }],
  projects: [{ id: uuid(4), title: "Robot arm", description: "Built one.", contribution: null, results: null, skills: ["Python", " "] }],
};

describe("evidence builder (data minimization)", () => {
  it("sends only matching-relevant fields with prefixed ids", () => {
    const withExtras = {
      ...profile,
      professionalExperiences: [{ ...profile.professionalExperiences[0], company: "Secret Co" }],
      educationEntries: [{ ...profile.educationEntries[0], institution: "Private University" }],
      projects: [{ ...profile.projects[0], links: ["https://example.com/private"] }],
    };
    const evidence = buildEvidence(withExtras);
    const json = JSON.stringify(evidence);
    expect(json).not.toContain("Secret Co");
    expect(json).not.toContain("Private University");
    expect(json).not.toContain("example.com");
    expect(evidence.map(e => e.id)).toEqual([`education:${uuid(3)}`, `experience:${uuid(2)}`, `project:${uuid(4)}`, `skill:${uuid(1)}`]);
    expect(evidence.find(e => e.kind === "skill")).toMatchObject({ name: "SolidWorks" });
    expect(evidence.find(e => e.kind === "experience")).toMatchObject({ description: null });
    expect(evidence.find(e => e.kind === "project")).toMatchObject({ skills: ["Python"] });
  });

  it("refuses profiles over 200 entries and empty requirement lists", () => {
    const big = { ...profile, technicalSkills: Array.from({ length: 201 }, (_, i) => ({ id: uuid(i), name: `S${i}`, proficiency: null })) };
    expect(() => buildEvidence(big)).toThrow(EvidenceError);
    expect(() => buildRequirements([])).toThrow(EvidenceError);
  });

  it("fingerprints are stable and change when the profile changes", () => {
    const a = evidenceFingerprint(buildEvidence(profile));
    expect(evidenceFingerprint(buildEvidence(structuredClone(profile)))).toBe(a);
    const changed = { ...profile, technicalSkills: [{ ...profile.technicalSkills[0], proficiency: "BEGINNER" }] };
    expect(evidenceFingerprint(buildEvidence(changed))).not.toBe(a);
  });
});

describe("response validation", () => {
  const request = exampleRequest();
  const allowed = { provider: "rules", model: null };

  it("accepts the golden rules response from the Python service", () => {
    const result = validateMatchResponse(request, exampleResponse(), allowed);
    expect(result.findings).toHaveLength(6);
    expect(result.verdictCounts).toEqual(exampleResponse().verdict_counts);
  });

  const mutations: [string, (r: ReturnType<typeof exampleResponse>) => void][] = [
    ["foreign citation", r => { r.findings[1].citations[0].evidence_id = `skill:${uuid(999)}`; }],
    ["non-verbatim quote", r => { r.findings[1].citations[0].quote = "SolidWorks expert"; }],
    ["single-letter quote", r => { r.findings[1].citations[0].quote = "S"; }],
    ["project used as employment", r => {
      r.findings[0] = { ...r.findings[0], verdict: "supported", citations: [{ evidence_id: request.evidence[5].id, quote: "Low-cost prosthetic hand" }], caveats: [] };
      r.verdict_counts = { supported: 3, possible: 2, gap: 0, insufficient_information: 1 };
    }],
    ["project cited without caveat", r => {
      r.findings[0].citations.push({ evidence_id: request.evidence[5].id, quote: "Low-cost prosthetic hand" });
      r.findings[0].caveats = [];
    }],
    ["invented duration", r => { r.findings[0].explanation = "You have seven years of design experience."; }],
    ["missing finding", r => { r.findings.pop(); }],
    ["duplicate finding", r => { r.findings[5] = { ...r.findings[4] }; }],
    ["counts mismatch", r => { r.verdict_counts.supported = 9; }],
    ["provider not requested", r => { r.provider = "anthropic"; }],
    ["model not requested", r => { r.model = "claude-opus-5-5"; }],
    ["malformed usage", r => { r.usage = { input_tokens: -1, output_tokens: 2 }; }],
    ["malformed provider request id", r => { r.provider_request_id = "req id with spaces"; }],
    ["request id mismatch", r => { r.request_id = uuid(77); }],
    ["supported without evidence", r => { r.findings[1].citations = []; }],
    ["invalid verdict", r => { r.findings[1].verdict = "excellent"; }],
    ["not an object", r => { r.findings = "nope"; }],
  ];
  it.each(mutations)("rejects %s", (_, mutate) => {
    const response = exampleResponse();
    mutate(response);
    expect(() => validateMatchResponse(request, response, allowed)).toThrow(MatchValidationError);
  });

  it("rejects a gap for an empty profile area", () => {
    const empty = { ...request, evidence: request.evidence.filter(e => e.kind !== "education") };
    const response = exampleResponse();
    response.findings[2] = { requirement_index: 2, verdict: "gap", explanation: "No degree.", citations: [], caveats: [] };
    response.verdict_counts = { supported: 1, possible: 3, gap: 1, insufficient_information: 1 };
    expect(() => validateMatchResponse(empty, response, allowed)).toThrow("empty profile area");
  });

  it("keeps the project caveat text identical to the Python service", () => {
    expect(exampleResponse().findings[0].caveats).toContain(PROJECT_NOT_EMPLOYMENT);
  });

  it("reads durations in digits, words, and hyphenated form", () => {
    expect(statedYears("3+ years, a 7-year record, and five years")).toEqual([3, 7, 5]);
  });
});

describe("signed client", () => {
  const config = { serviceUrl: "http://127.0.0.1:8000", secret: SECRET };
  const request = exampleRequest();

  it("signs the exact body it sends and never includes the secret", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await callMatchService(config, request, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://127.0.0.1:8000/v1/match");
    expect(init.redirect).toBe("error");
    const body = init.body as string;
    const h = init.headers;
    expect(h["x-careeros-request-id"]).toBe(request.request_id);
    expect(h["x-careeros-signature"]).toBe(sign(SECRET, h["x-careeros-timestamp"], request.request_id, body));
    expect(body).not.toContain(SECRET);
    expect(JSON.stringify(h)).not.toContain(SECRET);
  });

  it.each([
    [() => Promise.reject(new TypeError("fetch failed")), "service_unavailable"],
    [() => Promise.reject(new DOMException("timeout", "TimeoutError")), "service_timeout"],
    [async () => new Response("{}", { status: 504 }), "provider_timeout"],
    [async () => new Response("{}", { status: 502 }), "provider_output_rejected"],
    [async () => new Response("{}", { status: 401 }), "service_rejected"],
    [async () => new Response("{}", { status: 409 }), "service_rejected"],
    [async () => new Response("{}", { status: 503 }), "service_unavailable"],
    [async () => new Response("not json", { status: 200 }), "invalid_response"],
  ])("maps failures to safe error codes (%#)", async (impl, code) => {
    await expect(callMatchService(config, request, impl as unknown as typeof fetch)).rejects.toMatchObject({ code });
    await expect(callMatchService(config, request, impl as unknown as typeof fetch)).rejects.toBeInstanceOf(AiServiceError);
  });
});
