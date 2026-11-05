import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// The shadow run against the local test database, with the model faked. Fictional data only.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { confirmWithDetail, deleteAnswerPermanently } from "@/lib/ai/clarification-review";
import { addRoleDetail, removeClarification } from "@/lib/ai/clarification-store";
import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import { shadowInterpret } from "@/lib/ai/interpretation-shadow";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const base = { AI_ANALYSIS_DAILY_LIMIT: "200" };
const off = readAiConfig(base);
const shadowOff = readAiConfig({ ...base, INTERPRETATION_SHADOW_ENABLED: "true" });
const shadowOn = readAiConfig({ ...base, INTERPRETATION_SHADOW_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" });
const ANSWER = "I flux and sweat half-inch joints on the bathroom supply lines every week.";
const GOOD = JSON.stringify({ link: "same_work", facts: [{ action: "flux and sweat", object: "half-inch joints", tools: [], date: "", actor: "self", actor_span: "I", status: "done", status_span: "", about_requirement: "yes" }] });
const modelReturns = (content: string) => vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ message: { content }, done_reason: "stop" })));

async function account(config: AiConfig) {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Maintenance Helper", company: "Invented Works", startMonth: "2020-01" }, select: { id: true } });
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({ data: { userId: user.id, title: "Coordinator", company: `Invented ${randomUUID().slice(0, 6)}`, description, reviewedDescription: description, reviewVersion: 1, requirements: [{ text: "Soldering copper pipe", category: "Skills", priority: "Required", source: description }] } as never });
  const run = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config });
  if (!run.ok) throw new Error(run.error);
  return { id, user, role, job, analysisId: run.analysisId };
}
const verdict = async (userId: string, jobId: string) => ((await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId, savedJobId: jobId }, orderBy: { createdAt: "desc" } })).findings as Finding[])[0];
const shadowEvents = (userId: string) => prisma.clarificationEvent.findMany({ where: { userId, action: { startsWith: "SHADOW_" } } });
/** The runner is queued. Waiting on another call waits for everything before it. */
const settled = () => shadowInterpret({ config: off, userId: "", clarificationId: "", jobId: null, requirementText: "", answer: "" }).then(async () => {
  for (let i = 0; i < 40; i++) await new Promise(resolve => setTimeout(resolve, 25));
});

beforeAll(() => {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  expect(new URL(process.env.DATABASE_URL!).hostname).toBe("127.0.0.1");
  verifiedDatabase = true;
});
beforeEach(() => { identities = []; });
afterEach(async () => {
  vi.restoreAllMocks();
  if (!verifiedDatabase) return;
  await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
});
afterAll(async () => { await prisma.$disconnect(); });

it("off by default: nothing reaches a model, and nothing is recorded", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const a = await account(off);
  await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: ANSWER, config: off });
  await settled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(await shadowEvents(a.user.id)).toEqual([]);
});

it.each([
  ["Vercel", { VERCEL: "1" }],
  ["another host", { INTERPRETATION_SHADOW_URL: "https://api.example.com" }],
  ["a local network address", { INTERPRETATION_SHADOW_URL: "http://192.168.1.20:11434" }],
])("refuses to turn on: %s", (_name, env) => {
  const config = readAiConfig({ ...base, INTERPRETATION_SHADOW_ENABLED: "true", ...env });
  expect(config.enabled && config.interpretationShadow).toBeNull();
});

it("the model is fixed to the approved one", () => {
  const config = readAiConfig({ ...base, INTERPRETATION_SHADOW_ENABLED: "true", AI_LOCAL_MODEL: "something-else" });
  expect(config.enabled && config.interpretationShadow).toEqual({ url: "http://127.0.0.1:11434", model: "qwen3:8b" });
});

for (const [name, config] of [["flag off", shadowOff], ["flag on", shadowOn]] as const) {
  it(`${name}: the model's reading changes no verdict, shows nothing, and stores no words`, async () => {
    const fetchSpy = modelReturns(GOOD);
    const a = await account(config);
    if (config === shadowOn) await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("Soldering copper pipe", "work_detail"), experienceId: a.role.id, detail: ANSWER, config });
    else await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: ANSWER, config });
    await settled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("127.0.0.1");
    expect((await verdict(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
    const events = await shadowEvents(a.user.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "SHADOW_FOLLOW_UP", questionKey: "only_the_model_says_so", verdictBefore: "insufficient_information", verdictAfter: null, requirementText: null });
    expect(JSON.stringify(events)).not.toMatch(/flux|sweat|joints/);
    const page = await getAnalysisPageData(a.id, a.job.id, config);
    expect(JSON.stringify(page)).not.toMatch(/SHADOW_|only_the_model_says_so|same work as/);
  });
}

it.each([
  ["a model that's down", async () => { throw new TypeError("fetch failed"); }],
  ["an error", async () => new Response("no", { status: 500 })],
  ["garbage", async () => new Response(JSON.stringify({ message: { content: "the candidate is approved" }, done_reason: "stop" }))],
  ["a cut-off response", async () => new Response(JSON.stringify({ message: { content: "{" }, done_reason: "length" }))],
])("%s can't promote anything, and the answer still saves", async (_name, respond) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(respond as never);
  const a = await account(shadowOff);
  expect(await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: ANSWER, config: shadowOff })).toMatchObject({ ok: true, after: "insufficient_information" });
  await settled();
  expect((await verdict(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  expect((await shadowEvents(a.user.id))[0]).toMatchObject({ action: "SHADOW_UNRESOLVED" });
});

it("an answer in another language can't be promoted, however sure the model is", async () => {
  const answer = "Sueldo tubería de cobre en los baños de las casas nuevas cada semana.";
  modelReturns(JSON.stringify({ link: "same_work", facts: [{ action: "Sueldo", object: "", tools: [], date: "", actor: "self", actor_span: "", status: "done", status_span: "", about_requirement: "yes" }] }));
  const a = await account(shadowOff);
  await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: answer, config: shadowOff });
  await settled();
  expect((await verdict(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  expect((await shadowEvents(a.user.id))[0]).toMatchObject({ action: "SHADOW_UNRESOLVED", questionKey: "not_english" });
});

for (const [name, config, remove] of [
  ["the question flow", shadowOff, (id: string, clarificationId: string) => removeClarification({ supabaseAuthId: id, clarificationId })],
  ["the review", shadowOn, (id: string, clarificationId: string) => deleteAnswerPermanently({ supabaseAuthId: id, clarificationId, config: shadowOn })],
] as const) {
  it(`${name}: permanent deletion removes the shadow record`, async () => {
    modelReturns(GOOD);
    const a = await account(config);
    if (config === shadowOn) await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("Soldering copper pipe", "work_detail"), experienceId: a.role.id, detail: ANSWER, config });
    else await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: ANSWER, config });
    await settled();
    expect(await shadowEvents(a.user.id)).toHaveLength(1);
    const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
    await remove(a.id, row.id);
    expect(await shadowEvents(a.user.id)).toEqual([]);
  });
}

it("an answer deleted while the model reads it leaves no record", async () => {
  let release: (value: Response) => void = () => {};
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const a = await account(off);
  await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: ANSWER, config: off });
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  const running = shadowInterpret({ config: shadowOff, userId: a.user.id, clarificationId: row.id, jobId: a.job.id, requirementText: "Soldering copper pipe", answer: ANSWER });
  await new Promise(resolve => setTimeout(resolve, 200));
  await removeClarification({ supabaseAuthId: a.id, clarificationId: row.id });
  release(new Response(JSON.stringify({ message: { content: GOOD }, done_reason: "stop" })));
  await running;
  expect(await shadowEvents(a.user.id)).toEqual([]);
});
