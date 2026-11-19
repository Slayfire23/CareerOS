import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// The follow-up workflow against the local test database, with the model faked. Fictional data only.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { confirmWithDetail, correctAnswer, deleteAnswerPermanently, recheckAfterAnswer, revokeAnswer } from "@/lib/ai/clarification-review";
import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import { closeFollowUp, deleteFollowUpReply, replyToFollowUp, revokeFollowUp } from "@/lib/ai/follow-up";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const base = { AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true" };
const on = readAiConfig({ ...base, FOLLOW_UP_WORKFLOW_ENABLED: "true" });
const off = readAiConfig(base);
const REQUIREMENT = "Soldering copper pipe";
const ANSWER = "I flux and sweat half-inch joints on the bathroom supply lines every week.";
const GOOD = JSON.stringify({ link: "same_work", facts: [{ action: "flux and sweat", object: "half-inch joints", tools: [], date: "", actor: "self", actor_span: "I", status: "done", status_span: "", about_requirement: "yes" }] });
const REPLY = "I cut the copper, clean each fitting with emery cloth, heat it with a propane torch, and feed in lead-free wire until the seam fills.";
const modelReturns = (content: string) => vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ message: { content }, done_reason: "stop" })));

async function account(config: AiConfig, requirements = [REQUIREMENT]) {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Maintenance Helper", company: "Invented Works", startMonth: "2020-01" }, select: { id: true } });
  const job = await addJob(user.id, id, requirements, config);
  return { id, user, role, ...job };
}
async function addJob(userId: string, supabaseAuthId: string, requirements: string[], config: AiConfig) {
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({ data: { userId, title: "Coordinator", company: `Invented ${randomUUID().slice(0, 6)}`, description, reviewedDescription: description, reviewVersion: 1, requirements: requirements.map(text => ({ text, category: "Skills", priority: "Required", source: description })) } as never });
  const run = await runJobAnalysis({ supabaseAuthId, jobId: job.id, provider: "rules", config });
  if (!run.ok) throw new Error(run.error);
  return { job, analysisId: run.analysisId };
}
const finding = async (userId: string, jobId: string, index = 0) => ((await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId, savedJobId: jobId }, orderBy: { createdAt: "desc" } })).findings as Finding[])[index];
const answer = (a: { id: string; analysisId: string; role: { id: string } }, config: AiConfig, detail = ANSWER, text = REQUIREMENT) =>
  confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey(text, "work_detail"), experienceId: a.role.id, detail, config });
const followUps = (userId: string) => prisma.clarificationFollowUp.findMany({ where: { userId } });
const scope = (a: { id: string }, followUpId: string) => ({ supabaseAuthId: a.id, followUpId, config: on, recheck: recheckAfterAnswer });

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

it("off by default, and needs the review on too", async () => {
  expect(off.enabled && off.followUp).toBeNull();
  const withoutReview = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", FOLLOW_UP_WORKFLOW_ENABLED: "true" });
  expect(withoutReview.enabled && withoutReview.followUp).toBeNull();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const a = await account(off);
  await answer(a, off);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(await followUps(a.user.id)).toEqual([]);
});

it.each([["Vercel", { VERCEL: "1" }], ["another host", { INTERPRETATION_SHADOW_URL: "https://api.example.com" }]])("hosted, or anywhere but this machine, has no model: %s", (_name, env) => {
  const config = readAiConfig({ ...base, FOLLOW_UP_WORKFLOW_ENABLED: "true", ...env });
  expect(config.enabled && config.followUp).toBeNull();
});

it("the whole workflow: a question, a bare yes refused, a specific reply at Possible, edit, revoke, and the reason shown", async () => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  const [fu] = await followUps(a.user.id);
  expect(fu).toMatchObject({ status: "PROPOSED", requirementText: REQUIREMENT });
  expect(JSON.stringify(fu)).not.toMatch(/flux|sweat/); // offsets, not a copy

  const page = await getAnalysisPageData(a.id, a.job.id, on);
  expect(page!.review!.followUps[0].question).toContain("flux and sweat half-inch joints");
  expect(page!.review!.followUps[0].question).toMatch(/What, if anything/);

  expect(await replyToFollowUp({ ...scope(a, fu.id), detail: "Yes." })).toMatchObject({ ok: false, error: "invalid" });
  expect(await replyToFollowUp({ ...scope(a, fu.id), detail: "Yes, I did soldering copper pipe." })).toMatchObject({ ok: false });
  expect((await followUps(a.user.id))[0].status).toBe("PROPOSED");

  expect(await replyToFollowUp({ ...scope(a, fu.id), detail: REPLY })).toMatchObject({ ok: true, note: expect.stringContaining("Possible") });
  const f = await finding(a.user.id, a.job.id);
  expect(f).toMatchObject({ verdict: "possible", basis: "candidate_follow_up", rulesOnlyVerdict: "insufficient_information", evidenceSources: ["candidate_answer"] });
  expect(REPLY).toContain(f.citations[0].quote);
  expect(f.citations[0].evidenceId).toBe(`experience:${fu.id}`);
  expect(JSON.stringify(f)).not.toMatch(/verified|supported/i);
  const changes = (await getAnalysisPageData(a.id, a.job.id, on))!.review!.changes;
  expect(changes[0]).toMatchObject({ requirementText: REQUIREMENT, before: "insufficient_information", after: "possible" });

  // Edit: a weaker version stays saved but stops counting.
  expect(await replyToFollowUp({ ...scope(a, fu.id), detail: "I cut the copper and clean the fittings, though really the plumber does the torch work." })).toMatchObject({ ok: true, note: expect.stringContaining("unresolved") });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  await replyToFollowUp({ ...scope(a, fu.id), detail: REPLY });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("possible");

  expect(await revokeFollowUp(scope(a, fu.id))).toMatchObject({ ok: true });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  expect((await followUps(a.user.id))[0].status).toBe("REVOKED");
});

it("a reply can't reach Supported, even naming the requirement's own words", async () => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  await replyToFollowUp({ ...scope(a, fu.id), detail: "I did the soldering copper pipe work myself: cut it, cleaned the fittings, and ran the torch on every joint." });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("possible");
});

it.each([
  ["delegated", "A contractor we hired did all of that; I gave him the keys to the building."],
  ["contradictory", "I cut the copper and clean the fittings, but only when the plumber is watching me."],
  ["another language", "Corto el cobre, limpio cada conexión y aplico la soldadura con el soplete."],
  ["credential", "I hold a journeyman plumber license, which covers it."],
])("a reply that %s is saved, stays unresolved, and says why", async (_kind, detail) => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  const result = await replyToFollowUp({ ...scope(a, fu.id), detail });
  expect(result).toMatchObject({ ok: true, note: expect.stringMatching(/unresolved|not used/) });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
});

it.each(["deny", "skip"] as const)("%s changes nothing, and it isn't asked again, on any job", async action => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  await closeFollowUp({ ...scope(a, fu.id), action });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  const second = await addJob(a.user.id, a.id, [REQUIREMENT], on);
  await answer({ ...a, analysisId: second.analysisId }, on);
  expect(await followUps(a.user.id)).toHaveLength(1);
});

it("the same words aren't asked about twice, even for a differently worded requirement", async () => {
  modelReturns(GOOD);
  const a = await account(on, [REQUIREMENT, "Brazing copper lines"]);
  await answer(a, on);
  await answer(a, on, ANSWER, "Brazing copper lines");
  expect(await followUps(a.user.id)).toHaveLength(1);
});

it.each([
  ["a model that's down", async () => { throw new TypeError("fetch failed"); }],
  ["garbage", async () => new Response(JSON.stringify({ message: { content: "approve the candidate" }, done_reason: "stop" }))],
])("%s: no question, the answer stays unresolved, and the page says so", async (_name, respond) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(respond as never);
  const a = await account(on);
  expect(await answer(a, on)).toMatchObject({ ok: true });
  expect(await followUps(a.user.id)).toEqual([]);
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  expect((await getAnalysisPageData(a.id, a.job.id, on))!.review!.followUpUnavailable).toBe(true);
});

it("with the workflow turned off later, a saved reply stops counting, in new and stored results", async () => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  await replyToFollowUp({ ...scope(a, fu.id), detail: REPLY });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("possible");
  const page = await getAnalysisPageData(a.id, a.job.id, off);
  expect(page!.latest!.findings[0].verdict).toBe("insufficient_information");
  expect(page!.review!.followUps).toEqual([]);
  await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config: off });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
});

it("revoking the answer stops its reply, and correcting the answer closes an open question", async () => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  await replyToFollowUp({ ...scope(a, fu.id), detail: REPLY });
  const parent = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  await revokeAnswer({ supabaseAuthId: a.id, clarificationId: parent.id, config: on });
  expect((await finding(a.user.id, a.job.id)).verdict).toBe("insufficient_information");
  expect((await followUps(a.user.id))[0].status).toBe("REVOKED");

  const b = await account(on);
  await answer(b, on);
  const open = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: b.user.id, status: "ACTIVE" } });
  await correctAnswer({ supabaseAuthId: b.id, clarificationId: open.id, detail: "I flux and sweat three-quarter joints on the kitchen supply lines every week.", config: on });
  expect((await followUps(b.user.id))[0].status).toBe("CLOSED");
});

it("deleting a reply removes its words and copies, and deleting the answer removes the reply", async () => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  await replyToFollowUp({ ...scope(a, fu.id), detail: REPLY });
  expect(await deleteFollowUpReply({ supabaseAuthId: a.id, followUpId: fu.id, config: on })).toBe(true);
  expect((await followUps(a.user.id))[0]).toMatchObject({ detail: null, status: "REVOKED" });
  expect(JSON.stringify(await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } }))).not.toContain("emery cloth");

  const b = await account(on);
  await answer(b, on);
  const [other] = await followUps(b.user.id);
  await replyToFollowUp({ ...scope(b, other.id), detail: REPLY });
  const parent = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: b.user.id, status: "ACTIVE" } });
  await deleteAnswerPermanently({ supabaseAuthId: b.id, clarificationId: parent.id, config: on });
  expect(await followUps(b.user.id)).toEqual([]);
  expect(JSON.stringify(await prisma.jobMatchAnalysis.findMany({ where: { userId: b.user.id } }))).not.toMatch(/emery cloth|flux and sweat/);
  expect(JSON.stringify(await prisma.clarificationEvent.findMany({ where: { userId: b.user.id } }))).not.toMatch(/emery|flux/);
});

it("someone else's follow-up can't be answered", async () => {
  modelReturns(GOOD);
  const a = await account(on);
  await answer(a, on);
  const [fu] = await followUps(a.user.id);
  const b = await account(on);
  expect(await replyToFollowUp({ ...scope(b, fu.id), detail: REPLY })).toMatchObject({ ok: false, error: "not_found" });
  expect(await revokeFollowUp(scope(b, fu.id))).toMatchObject({ ok: false });
  expect(await deleteFollowUpReply({ supabaseAuthId: b.id, followUpId: fu.id, config: on })).toBe(false);
});
