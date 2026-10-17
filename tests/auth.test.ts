import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  ensureProfile: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock("@/lib/ensure-profile", () => ({ ensureCurrentUserProfile: mocks.ensureProfile }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { signIn, signOut, signUp } from "@/app/auth/actions";

function credentials(email = "alex@example.test", password = "a-long-test-password") {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.ensureProfile.mockResolvedValue("career-user-a");
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe("authentication actions", () => {
  it.each([
    ["invalid-email", "long-enough-password"],
    ["alex@example.test", ""],
    ["alex@example.test", "x".repeat(129)],
  ])("rejects malformed credentials without calling Auth (%#)", async (email, password) => {
    expect((await signIn({}, credentials(email, password))).error).toBeTruthy();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it("does not provision or redirect after failed authentication", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: "user-specific information" } });
    const result = await signIn({}, credentials());
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("user-specific");
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserves intentional password spaces and provisions before redirecting", async () => {
    await expect(signIn({}, credentials("  alex@example.test  ", " password with spaces ")))
      .rejects.toThrow("redirect:/dashboard");
    expect(mocks.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: "alex@example.test", password: " password with spaces ",
    });
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
    expect(mocks.ensureProfile.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("reports profile provisioning failure without redirecting to the dashboard", async () => {
    mocks.ensureProfile.mockRejectedValue(new Error("private database details"));
    const result = await signIn({}, credentials());
    expect(result.error).toContain("profile setup failed");
    expect(JSON.stringify(result)).not.toContain("private database");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects a short registration password", async () => {
    expect((await signUp({}, credentials("alex@example.test", "x".repeat(11)))).error).toBeTruthy();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("does not provision a career profile before email confirmation", async () => {
    const result = await signUp({}, credentials());
    expect(result.message).toContain("confirmation link");
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("signs out the current browser and redirects only on success", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/login");
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("reports failed sign-out without pretending it succeeded", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "network error" } });
    expect((await signOut()).error).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
