import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Structured ownership, Stage 1: the schema only. Earlier answers keep every value and are read as before; the database
// accepts only the shapes the form can produce; parts can't cross accounts; and nothing reads a structured answer yet.
// Fictional data only.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import { readAiConfig } from "@/lib/ai/config";
import { runJobAnalysis } from "@/lib/ai/analysis";
import type { Finding } from "@/lib/ai/match-validation";
import { answerWithRoleDetail } from "@/app/jobs/clarification-actions";

let identities: string[] = [];
let verifiedDatabase = false;
const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
const config = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200" });
const SPECIFIC = "Administered Salesforce for 80 sales staff across three offices.";

async function account() {
  const id = randomUUID();
  identities.push(id);
  signIn(id);
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({
    data: { userId: user.id, title: "Coordinator", company: "Invented Co", description, reviewedDescription: description, reviewVersion: 1,
      requirements: [{ text: "Salesforce", category: "Skills", priority: "Required", source: "Fictional listing." }] } as never,
  });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Clinic Assistant", company: "Invented Clinic", startMonth: "2020-01", endMonth: null, description: "Answered phones." } });
  const run = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config });
  if (!run.ok) throw new Error(run.error);
  return { id, user, job, role, analysisId: run.analysisId };
}
type Account = Awaited<ReturnType<typeof account>>;
const verdict = async (a: Account) => ((await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId: a.user.id, savedJobId: a.job.id }, orderBy: { createdAt: "desc" } })).findings as Finding[])[0].verdict;
const structured = (a: Account, data: Record<string, unknown>) =>
  prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: "Salesforce", outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, formVersion: 2, ...data } as never });
/** Postgres check violations surface from Prisma as errors naming the constraint or code 23514. */
const rejected = (p: Promise<unknown>) => expect(p).rejects.toThrow();

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

describe("earlier answers are unchanged", () => {
  it("a free-text answer is stored exactly as before: no structured field, form version 1, read by the rules as before", async () => {
    const a = await account();
    const form = new FormData();
    form.set("analysisId", a.analysisId); form.set("requirementIndex", "0"); form.set("experienceId", a.role.id); form.set("detail", SPECIFIC);
    expect((await answerWithRoleDetail({}, form)).error).toBeFalsy();
    const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
    expect(row).toMatchObject({ detail: SPECIFIC, formVersion: 1, involvement: null, alsoDidSome: null, frequency: null, recency: null, claimedMonths: null, consistency: null });
    expect(await verdict(a)).toBe("supported");
    const events = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id } });
    for (const e of events) expect(e.involvement).toBeNull();
  });
});

describe("the database accepts only the shapes the form can produce", () => {
  it("accepts every valid structured shape, including the approved O1 and O2 choices", async () => {
    const a = await account();
    await structured(a, { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" });
    await structured(a, { involvement: "PART", alsoDidSome: true, frequency: "MONTHLY", recency: "OVER_THREE_YEARS", claimedMonths: 30, detail: "Ran the monthly reports." });
    await structured(a, { involvement: "TAUGHT", alsoDidSome: false, consistency: "no_text" });
    await structured(a, { involvement: "REQUESTED" });
    await structured(a, { involvement: "SUPERVISED" });
    await structured(a, { involvement: "ASSISTED", alsoDidSome: false });
    await structured(a, { involvement: "OBSERVED_TRAINED", consistency: "text_unread", detail: "Observé el proceso." });
    await structured(a, { involvement: "NOT_DONE", outcome: "DENIED", experienceId: null });
    expect(await prisma.candidateClarification.count({ where: { userId: a.user.id, formVersion: 2 } })).toBe(8);
  });

  it("rejects malformed structured answers instead of storing them", async () => {
    const a = await account();
    await rejected(structured(a, { involvement: "PERFORMED", recency: "CURRENT" }));
    await rejected(structured(a, { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", experienceId: null }));
    await rejected(structured(a, { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", formVersion: 1 }));
    await rejected(structured(a, { detail: SPECIFIC }));
    await rejected(structured(a, { involvement: "SUPERVISED", alsoDidSome: true }));
    await rejected(structured(a, { involvement: "TAUGHT", frequency: "WEEKLY" }));
    await rejected(structured(a, { involvement: "NOT_DONE" }));
    await rejected(structured(a, { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", claimedMonths: 0 }));
    await rejected(structured(a, { involvement: "OBSERVED_TRAINED", consistency: "verified" }));
    await rejected(structured(a, { involvement: "VERIFIED" }));
    await rejected(prisma.candidateClarification.create({ data: { userId: a.user.id, requirementText: "x", outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, frequency: "WEEKLY", detail: "text" } }));
    await rejected(prisma.clarificationEvent.create({ data: { userId: a.user.id, action: "answered", rulesVersion: "rules-v19", involvement: "VERIFIED" } }));
    expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
  });
});

describe("compound parts belong to their answer's account", () => {
  it("stores parts for the owner, refuses a part on another account's answer, and deletes parts with their answer", async () => {
    const a = await account();
    const b = await account();
    const answer = await structured(a, { involvement: "PART", frequency: "WEEKLY", recency: "CURRENT" });
    await prisma.clarificationPart.createMany({ data: [
      { userId: a.user.id, clarificationId: answer.id, partIndex: 0, partText: "conduit bending", checked: true },
      { userId: a.user.id, clarificationId: answer.id, partIndex: 1, partText: "conduit installation", checked: false },
    ] });
    await rejected(prisma.clarificationPart.create({ data: { userId: b.user.id, clarificationId: answer.id, partIndex: 2, partText: "conduit sizing", checked: true } }));
    await rejected(prisma.clarificationPart.updateMany({ where: { clarificationId: answer.id }, data: { userId: b.user.id } }));
    await rejected(prisma.clarificationPart.create({ data: { userId: a.user.id, clarificationId: answer.id, partIndex: 0, partText: "duplicate", checked: true } }));
    await rejected(prisma.clarificationPart.create({ data: { userId: a.user.id, clarificationId: answer.id, partIndex: 10, partText: "eleventh", checked: true } }));
    await rejected(prisma.clarificationPart.create({ data: { userId: a.user.id, clarificationId: answer.id, partIndex: 3, partText: "   ", checked: true } }));
    expect(await prisma.clarificationPart.count({ where: { userId: b.user.id } })).toBe(0);
    await prisma.candidateClarification.delete({ where: { id: answer.id } });
    expect(await prisma.clarificationPart.count({ where: { clarificationId: answer.id } })).toBe(0);
  });

  it("deleting an account removes its parts", async () => {
    const a = await account();
    const answer = await structured(a, { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" });
    await prisma.clarificationPart.create({ data: { userId: a.user.id, clarificationId: answer.id, partIndex: 0, partText: "bending", checked: true } });
    await prisma.user.delete({ where: { id: a.user.id } });
    expect(await prisma.clarificationPart.count({ where: { clarificationId: answer.id } })).toBe(0);
  });
});

describe("protections stay in place", () => {
  it("row level security is on for every table, the new one included, with no policies", async () => {
    const off = await prisma.$queryRaw<{ relname: string }[]>`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity and relname <> '_prisma_migrations'`;
    expect(off).toEqual([]);
    const on = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`select relrowsecurity from pg_class where relname = 'ClarificationPart'`;
    expect(on[0].relrowsecurity).toBe(true);
    const policies = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) as n from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace`;
    expect(Number(policies[0].n)).toBe(0);
  });

  it("a structured answer gives no credit until the structured rule table exists (fails closed)", async () => {
    const a = await account();
    await structured(a, { involvement: "SUPERVISED", detail: SPECIFIC });
    await structured(a, { involvement: "PERFORMED", frequency: "MOST_DAYS", recency: "CURRENT", detail: SPECIFIC });
    const run = await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config });
    expect(run.ok).toBe(true);
    expect(await verdict(a)).toBe("insufficient_information");
  });
});
