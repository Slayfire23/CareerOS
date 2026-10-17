import { beforeEach, expect, it, vi } from "vitest";
import { parseTechnicalSkill } from "@/lib/technical-skills";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/db", () => ({ prisma: { careerProfile: { findFirst: mocks.findFirst }, technicalSkill: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { saveTechnicalSkill, removeTechnicalSkill } from "@/app/dashboard/skills-actions";
const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
function form(name = "TypeScript", level = "") {
  const data = new FormData(); data.set("name", name); data.set("proficiency", level); data.set("skillId", id); return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-a" } }, error: null });
  mocks.findFirst.mockResolvedValue({ id: "profile-a" });
  mocks.deleteMany.mockResolvedValue({ count: 1 });
});
it("normalizes skill names and allows unspecified proficiency", () => {
  expect(parseTechnicalSkill(form("  SQL   Server  "))).toEqual({ name: "SQL Server", normalizedName: "sql server", proficiency: null });
});
it.each(["", " ", "x".repeat(101)])("rejects invalid names (%#)", (name) => {
  expect(() => parseTechnicalSkill(form(name))).toThrow();
});
it.each(["BEGINNER", "INTERMEDIATE", "ADVANCED"])("accepts %s", (level) => {
  expect(parseTechnicalSkill(form("x".repeat(100), level)).proficiency).toBe(level);
});
it("rejects unknown proficiency and non-text or duplicate name fields", () => {
  expect(() => parseTechnicalSkill(form("Skill", "EXPERT"))).toThrow();
  const data = form(); data.set("name", new Blob(["skill"]), "skill.txt");
  expect(() => parseTechnicalSkill(data)).toThrow();
  data.set("name", "Skill"); data.append("name", "Other");
  expect(() => parseTechnicalSkill(data)).toThrow();
});
it.each([null, { id: "auth-a" }])("rejects missing/invalid sessions for both actions (%#)", async (user) => {
  mocks.getUser.mockResolvedValue({ data: { user }, error: { message: "invalid" } });
  expect((await saveTechnicalSkill({}, form())).error).toBeTruthy();
  expect((await removeTechnicalSkill({}, form())).error).toBeTruthy();
  expect(mocks.findFirst).not.toHaveBeenCalled(); expect(mocks.deleteMany).not.toHaveBeenCalled();
});
it("ignores forged ownership and upserts only into the authenticated profile", async () => {
  const data = form("TypeScript", "ADVANCED"); data.set("profileId", "profile-b");
  expect((await saveTechnicalSkill({}, data)).message).toBe("Skill saved.");
  expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { user: { supabaseAuthId: "auth-a" } }, select: { id: true } });
  expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({
    where: { profileId_normalizedName: { profileId: "profile-a", normalizedName: "typescript" } },
    create: { profileId: "profile-a", name: "TypeScript", normalizedName: "typescript", proficiency: "ADVANCED" },
    update: { name: "TypeScript", normalizedName: "typescript", proficiency: "ADVANCED" },
  });
});
it("requires ownership when deleting a supplied skill ID", async () => {
  await removeTechnicalSkill({}, form());
  expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id, profile: { user: { supabaseAuthId: "auth-a" } } } });
});
it("rejects invalid deletion IDs", async () => {
  const data = form(); data.set("skillId", "invalid");
  expect((await removeTechnicalSkill({}, data)).error).toBeTruthy(); expect(mocks.deleteMany).not.toHaveBeenCalled();
});
it("does not create skills when the profile is absent", async () => {
  mocks.findFirst.mockResolvedValue(null);
  expect((await saveTechnicalSkill({}, form())).error).toBeTruthy(); expect(mocks.upsert).not.toHaveBeenCalled();
});
it("reports a failed deletion without claiming success", async () => {
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  expect((await removeTechnicalSkill({}, form())).error).toBeTruthy(); expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("hides database failures in both actions", async () => {
  mocks.upsert.mockRejectedValue(new Error("private connection")); mocks.deleteMany.mockRejectedValue(new Error("private connection"));
  for (const action of [saveTechnicalSkill, removeTechnicalSkill]) {
    const result = await action({}, form()); expect(result.error).toBeTruthy(); expect(JSON.stringify(result)).not.toContain("private connection");
  }
});
