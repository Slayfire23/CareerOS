import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Regression tests for line endings: browsers submit form text with CRLF, while a stored description
// may use LF. Real server actions and Prisma against the local test database only.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import { saveJob } from "@/app/jobs/actions";
import { saveRequirements } from "@/app/jobs/requirements-actions";
import { jobReadiness } from "@/lib/ai/analysis";
import { requirementReviewStatus } from "@/lib/overview";

const LF = "Requirements:\n- 2 years experience with SolidWorks\nPreferred:\n- Knowledge of injection molding";
const CRLF = LF.replace(/\n/g, "\r\n");
const REQUIREMENTS = [{ text: "2 years experience with SolidWorks", category: "Experience", priority: "Required", source: "- 2 years experience with SolidWorks" }];

let accountA: string;
let accountB: string;
let identities: string[] = [];
let verifiedDatabase = false;
const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}
const reviewForm = (jobId: string, baseDescription: string, reviewVersion = 0) =>
  form({ jobId, baseDescription, reviewVersion: String(reviewVersion), confirmed: "on", requirements: JSON.stringify(REQUIREMENTS) });
const jobForm = (jobId: string, description: string) =>
  form({ jobId, title: "Engineer", company: "Line Co", postingUrl: "", description });

async function createJob(supabaseAuthId: string, description: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } });
  return prisma.savedJob.create({ data: { userId: user.id, title: "Engineer", company: "Line Co", description } });
}
const load = (id: string) => prisma.savedJob.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  expect(rows).toEqual([{ name: "careeros_test" }]);
  verifiedDatabase = true;
});

beforeEach(async () => {
  if (!verifiedDatabase) throw new Error("Local test database verification failed.");
  accountA = randomUUID();
  accountB = randomUUID();
  identities = [accountA, accountB];
  for (const id of identities) {
    signIn(id);
    await ensureCurrentUserProfile();
  }
  signIn(accountA);
});

afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

it.each([
  ["an LF description reviewed from a browser (CRLF)", LF, CRLF],
  ["a CRLF description reviewed with LF text", CRLF, LF],
  ["matching line endings", CRLF, CRLF],
])("saves a review for %s and records the stored text exactly", async (_, stored, submitted) => {
  const job = await createJob(accountA, stored);
  expect(await saveRequirements({}, reviewForm(job.id, submitted))).toEqual({ message: "Reviewed requirements saved." });

  const saved = await load(job.id);
  expect(saved.reviewedDescription).toBe(stored);
  expect(saved.description).toBe(stored);
  expect(saved.reviewVersion).toBe(1);
  expect(saved.requirements).toEqual(REQUIREMENTS);
  expect(jobReadiness(saved)).toBe("ready");
  expect(requirementReviewStatus(saved)).toBe("reviewed");

  // A second review of the same job works too (the case that previously failed).
  expect(await saveRequirements({}, reviewForm(job.id, submitted, 1))).toEqual({ message: "Reviewed requirements saved." });
  expect((await load(job.id)).reviewVersion).toBe(2);
});

it("still refuses a review whose description really changed, a stale version, or another account's job", async () => {
  const job = await createJob(accountA, LF);
  const conflict = "The job or review changed, or is unavailable. Reload and review again.";

  expect(await saveRequirements({}, reviewForm(job.id, `${CRLF}\r\n- Extra line`))).toEqual({ error: conflict });
  expect(await saveRequirements({}, reviewForm(job.id, CRLF.replace("injection molding", "die casting")))).toEqual({ error: conflict });
  expect(await saveRequirements({}, reviewForm(job.id, CRLF, 5))).toEqual({ error: conflict });

  signIn(accountB);
  expect(await saveRequirements({}, reviewForm(job.id, CRLF))).toEqual({ error: conflict });

  const untouched = await load(job.id);
  expect(untouched).toMatchObject({ reviewedDescription: null, reviewVersion: 0, description: LF });
});

it("keeps the stored description, and a current review, when a job edit changes only line endings", async () => {
  const job = await createJob(accountA, LF);
  await saveRequirements({}, reviewForm(job.id, CRLF));

  expect(await saveJob({}, jobForm(job.id, CRLF))).toEqual({ message: "Job saved." });
  const unchanged = await load(job.id);
  expect(unchanged.description).toBe(LF);
  expect(jobReadiness(unchanged)).toBe("ready");

  expect(await saveJob({}, jobForm(job.id, `${CRLF}\r\n- Fluent German`))).toEqual({ message: "Job saved." });
  const edited = await load(job.id);
  expect(edited.description).toBe(`${CRLF}\r\n- Fluent German`);
  expect(jobReadiness(edited)).toBe("out_of_date");
  expect(requirementReviewStatus(edited)).toBe("out-of-date");
});

it("job edits stay owner-scoped", async () => {
  const job = await createJob(accountA, LF);
  signIn(accountB);
  expect(await saveJob({}, jobForm(job.id, "Taken over"))).toEqual({ error: "Job not found. Reload and try again." });
  expect((await load(job.id)).description).toBe(LF);
});
