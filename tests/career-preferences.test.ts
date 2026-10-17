import { beforeEach, expect, it, vi } from "vitest";
import { parseCareerPreferences } from "@/lib/career-preferences";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateMany: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/db", () => ({ prisma: { careerProfile: { updateMany: mocks.updateMany } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { saveCareerPreferences } from "@/app/dashboard/preferences-actions";

function form() {
  const data = new FormData();
  data.set("targetRoles", " Developer \n developer\nMechanical Engineer\n");
  data.set("industries", "Manufacturing\nHealth, science and technology");
  data.append("workArrangements", "remote");
  data.append("employmentTypes", "full_time");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "account-a" } }, error: null });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

it("normalizes lists without splitting commas or retaining duplicates", () => {
  expect(parseCareerPreferences(form())).toEqual({
    targetRoles: ["Developer", "Mechanical Engineer"],
    industries: ["Manufacturing", "Health, science and technology"],
    workArrangements: ["remote"], employmentTypes: ["full_time"],
  });
});
it("allows every preference to be cleared", () => {
  const data = new FormData(); data.set("targetRoles", " \n"); data.set("industries", "");
  expect(parseCareerPreferences(data)).toEqual({ targetRoles: [], industries: [], workArrangements: [], employmentTypes: [] });
});
it.each(["targetRoles", "industries"])("rejects missing, duplicate and file-valued %s", (field) => {
  const data = form(); data.delete(field);
  expect(() => parseCareerPreferences(data)).toThrow();
  data.set(field, new Blob(["text"]), "input.txt");
  expect(() => parseCareerPreferences(data)).toThrow();
  data.set(field, "one"); data.append(field, "two");
  expect(() => parseCareerPreferences(data)).toThrow();
});
it.each(["targetRoles", "industries"])("enforces item-count and length limits for %s", (field) => {
  const data = form(); data.set(field, Array.from({ length: 11 }, (_, i) => `Role ${i}`).join("\n"));
  expect(() => parseCareerPreferences(data)).toThrow();
  data.set(field, "x".repeat(101));
  expect(() => parseCareerPreferences(data)).toThrow();
  data.set(field, Array.from({ length: 10 }, (_, i) => `${i}${"x".repeat(99)}`).join("\n"));
  expect(parseCareerPreferences(data)[field as "targetRoles" | "industries"]).toHaveLength(10);
});
it.each(["workArrangements", "employmentTypes"])("rejects invented or file-valued %s", (field) => {
  const data = form(); data.set(field, "arbitrary-value");
  expect(() => parseCareerPreferences(data)).toThrow();
  data.set(field, new Blob(["remote"]), "input.txt");
  expect(() => parseCareerPreferences(data)).toThrow();
});
it.each([null, { id: "account-a" }])("rejects absent or errored sessions", async (user) => {
  mocks.getUser.mockResolvedValue({ data: { user }, error: { message: "expired" } });
  expect((await saveCareerPreferences({}, form())).error).toBeTruthy();
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it("scopes writes to the session and excludes forged ownership and basic-profile fields", async () => {
  const data = form(); data.set("userId", "account-b"); data.set("displayName", "Overwrite"); data.set("supabaseAuthId", "account-b");
  expect((await saveCareerPreferences({}, data)).message).toBe("Career preferences saved.");
  expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { user: { supabaseAuthId: "account-a" } }, data: parseCareerPreferences(data),
  });
  expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/dashboard");
});
it("rejects invalid data before a database write", async () => {
  const data = form(); data.set("employmentTypes", "invented");
  expect((await saveCareerPreferences({}, data)).error).toBeTruthy();
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it("does not report success for a missing profile", async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  expect((await saveCareerPreferences({}, form())).error).toBeTruthy();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("hides database failures", async () => {
  mocks.updateMany.mockRejectedValue(new Error("private details"));
  const result = await saveCareerPreferences({}, form());
  expect(result.error).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("private details");
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
