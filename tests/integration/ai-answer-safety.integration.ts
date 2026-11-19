import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Saved answers, read back from the database, in both workflows. Fictional data only.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { purgeRoleAnswers } from "@/lib/ai/answer-deletion";
import { confirmWithDetail, deleteAnswerPermanently, revokeAnswer } from "@/lib/ai/clarification-review";
import { addRoleDetail, editRoleDetail, removeClarification } from "@/lib/ai/clarification-store";
import { readAiConfig } from "@/lib/ai/config";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const on = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true" });
const off = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200" });
const HONEST = "I administered Salesforce for 80 sales staff across three offices.";

async function account(requirements: string[], config = off) {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Office Clerk", company: "Invented Works", startMonth: "2020-01" }, select: { id: true } });
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({ data: { userId: user.id, title: "Coordinator", company: `Invented ${randomUUID().slice(0, 6)}`, description, reviewedDescription: description, reviewVersion: 1, requirements: requirements.map(text => ({ text, category: "Skills", priority: "Required", source: description })) } as never });
  const run = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config });
  if (!run.ok) throw new Error(run.error);
  return { id, user, role, job, analysisId: run.analysisId };
}
const latest = (userId: string, jobId: string) => prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId, savedJobId: jobId }, orderBy: { createdAt: "desc" } });
const findings = async (userId: string, jobId: string) => (await latest(userId, jobId)).findings as Finding[];
const rerun = async (a: { id: string; job: { id: string } }, config = off) => {
  const run = await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config });
  if (!run.ok) throw new Error(run.error);
};

beforeAll(() => {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  expect(new URL(process.env.DATABASE_URL!).hostname).toBe("127.0.0.1");
  verifiedDatabase = true;
});
beforeEach(() => { identities = []; });
afterEach(async () => {
  if (!verifiedDatabase) return;
  await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
});
afterAll(async () => { await prisma.$disconnect(); });

const UNSAFE: [string, string][] = [
  ["third party", "Marcy administers Salesforce for the sales floor at our office."],
  ["negated", "I haven't touched Salesforce myself, only seen the reports it makes."],
  ["hypothetical", "I could administer Salesforce if needed since it looks easy enough."],
  ["vague", "Salesforce is something I have plenty of experience with over many years."],
  ["other language", "Administro Salesforce para ochenta vendedores en tres oficinas de la empresa."],
];

for (const [workflow, config] of [["question flow, flag off", off], ["review, flag on", on]] as const) {
  it.each(UNSAFE)(`${workflow}: %s, saved directly and analyzed twice, moves nothing`, async (_kind, detail) => {
    const a = await account(["Salesforce"], config);
    // As if it had been saved by an older version, past every check at the door.
    await prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: "Salesforce", outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, detail, questionKey: questionKey("Salesforce", "work_detail") } });
    await rerun(a, config);
    expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
    await rerun(a, config);
    expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  });

  it(`${workflow}: an answer from the other workflow, with no stored key, is read by the same rules`, async () => {
    const a = await account(["Salesforce"], config);
    const row = await prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: "Salesforce", outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, detail: HONEST }, select: { id: true } });
    await rerun(a, config);
    const [f] = await findings(a.user.id, a.job.id);
    expect(f).toMatchObject({ verdict: "supported", basis: "candidate_answer", evidenceSources: ["candidate_answer"], rulesOnlyVerdict: "insufficient_information" });
    expect(f.citations[0]).toEqual({ evidenceId: `experience:${row.id}`, quote: HONEST.replace(/\.$/, "") });
  });
}

it("an answer counts only for what it answers, in the saved flow too", async () => {
  const a = await account(["Salesforce", "Sales forecasting"]);
  await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: HONEST, config: off });
  const [salesforce, other] = await findings(a.user.id, a.job.id);
  expect(salesforce.verdict).toBe("supported");
  expect(other.verdict).toBe("insufficient_information");
});

it("flag off: an answer in another language is saved, explained as unresolved, editable, and then counts", async () => {
  const a = await account(["Salesforce"]);
  const spanish = "Administro Salesforce para ochenta vendedores en tres oficinas de la empresa.";
  const saved = await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: spanish, config: off });
  expect(saved).toMatchObject({ ok: true, after: "insufficient_information" });
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  expect(row.detail).toBe(spanish);
  expect(await editRoleDetail({ supabaseAuthId: a.id, clarificationId: row.id, detail: HONEST, config: off })).toMatchObject({ ok: true, after: "supported" });
  expect((await prisma.candidateClarification.findFirstOrThrow({ where: { id: row.id } })).detail).toBe(HONEST);
});

it("flag on: an answer in another language is saved and stays unresolved", async () => {
  const a = await account(["Salesforce"], on);
  const result = await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("Salesforce", "work_detail"), experienceId: a.role.id, detail: UNSAFE[4][1], config: on });
  expect(result.ok).toBe(true);
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  expect(await prisma.candidateClarification.count({ where: { userId: a.user.id, status: "ACTIVE" } })).toBe(1);
});

it("revoking stops an answer counting at once, in what's stored and what's shown, with the flag on or off", async () => {
  const a = await account(["Salesforce"], on);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("Salesforce", "work_detail"), experienceId: a.role.id, detail: HONEST, config: on });
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("supported");
  const stale = await latest(a.user.id, a.job.id);
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  await revokeAnswer({ supabaseAuthId: a.id, clarificationId: row.id, config: on });
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  await rerun(a);
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  // Even if the only analysis left is the one citing it.
  await prisma.jobMatchAnalysis.deleteMany({ where: { savedJobId: a.job.id, id: { not: stale.id } } });
  for (const config of [on, off]) {
    const page = await getAnalysisPageData(a.id, a.job.id, config);
    expect(page!.latest!.findings[0].verdict).toBe("insufficient_information");
    expect(JSON.stringify(page!.latest!.findings)).not.toContain("80 sales staff");
  }
});

for (const [name, config, remove] of [
  ["the review's delete", on, (id: string, clarificationId: string) => deleteAnswerPermanently({ supabaseAuthId: id, clarificationId, config: on })],
  ["the question flow's delete", off, (id: string, clarificationId: string) => removeClarification({ supabaseAuthId: id, clarificationId })],
] as const) {
  it(`${name} removes the words, stored copies, and what the audit said`, async () => {
    const a = await account(["Salesforce"], config);
    if (config === on) await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("Salesforce", "work_detail"), experienceId: a.role.id, detail: HONEST, config });
    else await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: HONEST, config });
    expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("supported");
    const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
    expect(await remove(a.id, row.id)).toBe(true);
    expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
    const stored = await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } });
    expect(JSON.stringify(stored)).not.toContain("80 sales staff");
    const events = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id } });
    expect(events.some(e => e.action === "DELETED")).toBe(true);
    for (const e of events) expect(e).toMatchObject({ requirementText: null, questionKey: null, verdictBefore: null, verdictAfter: null, savedJobId: null });
    expect(JSON.stringify(events)).not.toContain("80 sales staff");
    await rerun(a, config);
    expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  });
}

it("removing a role removes answers about it, and their copies", async () => {
  const a = await account(["Salesforce"]);
  await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: HONEST, config: off });
  expect(JSON.stringify(await latest(a.user.id, a.job.id))).toContain("80 sales staff");
  await prisma.$transaction(tx => purgeRoleAnswers(tx, a.role.id, a.id));
  expect(JSON.stringify(await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } }))).not.toContain("80 sales staff");
  expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
});

it("the question flow's limit can't be reset by deleting", async () => {
  const a = await account(["Salesforce"]);
  await prisma.clarificationEvent.createMany({ data: Array.from({ length: 30 }, () => ({ userId: a.user.id, action: "DELETED", rulesVersion: "test" })) });
  expect(await addRoleDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, requirementIndex: 0, experienceId: a.role.id, detail: HONEST, config: off })).toMatchObject({ ok: false, error: "rate_limited" });
});

it("no answer reaches any audit event, in any step", async () => {
  const a = await account(["Salesforce"], on);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("Salesforce", "work_detail"), experienceId: a.role.id, detail: HONEST, config: on });
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  await revokeAnswer({ supabaseAuthId: a.id, clarificationId: row.id, config: on });
  expect(JSON.stringify(await prisma.clarificationEvent.findMany({ where: { userId: a.user.id } }))).not.toContain("80 sales staff");
  expect(JSON.stringify(await prisma.aiAnalysisRun.findMany({ where: { userId: a.user.id } }))).not.toContain("80 sales staff");
});
