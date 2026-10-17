import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    careerProfile: {
      updateMany: mocks.updateMany,
      findFirst: mocks.findFirst,
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { saveProfile } from "@/app/dashboard/actions";
import { getCurrentProfile } from "@/lib/profile";

function validForm() {
  const form = new FormData();
  form.set("displayName", "Alex");
  form.set("headline", "Developer");
  form.set("careerGoals", "Build useful software");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-a" } }, error: null });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findFirst.mockResolvedValue({
    displayName: "Alex", headline: "Developer", careerGoals: "Build useful software",
  });
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`);
  });
});

describe("profile access", () => {
  it.each([
    ["signed out", null, null],
    ["invalid session", null, { message: "Invalid JWT" }],
    ["user accompanied by an auth error", { id: "auth-a" }, { message: "Expired" }],
  ])("rejects %s reads and writes before querying the database", async (_label, user, error) => {
    mocks.getUser.mockResolvedValue({ data: { user }, error });
    const result = await saveProfile({}, validForm());
    expect(result.error).toBeTruthy();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    await expect(getCurrentProfile()).rejects.toThrow("redirect:/login");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it.each(["auth-a", "auth-b"])("scopes reads to verified identity %s and selects only public profile fields", async (id) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
    await getCurrentProfile();
    expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { user: { supabaseAuthId: id } },
      select: { displayName: true, headline: true, careerGoals: true, targetRoles: true, industries: true, workArrangements: true, employmentTypes: true, preferredLocations: true, relocationWillingness: true, maxCommuteMinutes: true, salaryMinCents: true, salaryMaxCents: true, salaryCurrency: true, salaryPeriod: true, professionalExperiences: { select: { id: true, jobTitle: true, company: true, startMonth: true, endMonth: true, description: true }, orderBy: [{ startMonth: "desc" }, { id: "asc" }] }, technicalSkills: { select: { id: true, name: true, proficiency: true }, orderBy: { normalizedName: "asc" } } },
    });
  });

  it("does not fall back to another profile when the current user's profile is absent", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await getCurrentProfile()).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each(["auth-a", "auth-b"])("ignores forged ownership fields and previous state for %s", async (id) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
    const form = validForm();
    form.set("id", "other-profile");
    form.set("profileId", "other-profile");
    form.set("userId", "other-user");
    form.set("supabaseAuthId", "other-auth-user");
    const forgedState = { message: "fake success", userId: "other-user" };
    expect((await saveProfile(forgedState, form)).message).toBe("Profile saved.");
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { user: { supabaseAuthId: id } },
      data: {
        displayName: "Alex", headline: "Developer", careerGoals: "Build useful software",
      },
    });
  });
});

describe("profile validation and persistence results", () => {
  it.each([
    ["displayName", ""],
    ["displayName", "   "],
    ["displayName", "x".repeat(101)],
    ["headline", "x".repeat(201)],
    ["careerGoals", "x".repeat(5001)],
  ])("rejects invalid %s before a database write (%#)", async (field, value) => {
    const form = validForm();
    form.set(field, value);
    expect((await saveProfile({}, form)).error).toBeTruthy();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["displayName", "headline", "careerGoals"])("rejects a missing %s", async (field) => {
    const form = validForm();
    form.delete(field);
    expect((await saveProfile({}, form)).error).toBeTruthy();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["displayName", "headline", "careerGoals"])("rejects a file submitted as %s", async (field) => {
    const form = validForm();
    form.set(field, new Blob(["not text input"]), "input.txt");
    expect((await saveProfile({}, form)).error).toBeTruthy();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("accepts the maximum allowed lengths", async () => {
    const form = validForm();
    form.set("displayName", "n".repeat(100));
    form.set("headline", "h".repeat(200));
    form.set("careerGoals", "g".repeat(5000));
    expect((await saveProfile({}, form)).message).toBe("Profile saved.");
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("trims text and clears blank optional fields using null", async () => {
    const form = validForm();
    form.set("displayName", "  Alex  ");
    form.set("headline", "  ");
    form.set("careerGoals", "\n\t");
    await saveProfile({}, form);
    expect(mocks.updateMany.mock.calls[0][0].data).toEqual({
      displayName: "Alex", headline: null, careerGoals: null,
    });
  });

  it("reports a missing profile instead of claiming a successful save", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const result = await saveProfile({}, validForm());
    expect(result.error).toContain("profile was not found");
    expect(result.message).toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not expose database details or claim success after a failed write", async () => {
    mocks.updateMany.mockRejectedValue(new Error("sensitive database connection details"));
    const result = await saveProfile({}, validForm());
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(result.message).toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
