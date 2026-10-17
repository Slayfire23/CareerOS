import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(), exchangeCodeForSession: vi.fn(), ensureProfile: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks }) }));
vi.mock("@/lib/ensure-profile", () => ({ ensureCurrentUserProfile: mocks.ensureProfile }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requestPasswordReset, updatePassword } from "@/app/auth/recovery-actions";
import { GET } from "@/app/auth/callback/route";
import { getAppOrigin } from "@/lib/app-origin";

function emailForm(email = "person@example.test") {
  const form = new FormData(); form.set("email", email); return form;
}
function passwordForm(password = "a-long-test-password", confirmation = password) {
  const form = new FormData(); form.set("password", password); form.set("confirmPassword", confirmation); return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "test-account" } }, error: null });
  for (const method of [mocks.updateUser, mocks.signOut, mocks.resetPasswordForEmail, mocks.exchangeCodeForSession]) {
    method.mockResolvedValue({ error: null });
  }
});
afterEach(() => vi.unstubAllEnvs());

it("rejects malformed reset requests without contacting Auth", async () => {
  expect((await requestPasswordReset({}, emailForm("invalid"))).error).toBeTruthy();
  expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
});

it("uses the trusted callback address and trims the requested email", async () => {
  await requestPasswordReset({}, emailForm("  person@example.test  "));
  expect(mocks.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("person@example.test", {
    redirectTo: "http://localhost:3000/auth/callback?next=/update-password",
  });
});

it("does not expose provider errors or disclose account existence", async () => {
  const success = await requestPasswordReset({}, emailForm());
  mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: "private provider detail" } });
  expect(await requestPasswordReset({}, emailForm())).toEqual(success);
});

it("handles transport failures without leaking details", async () => {
  mocks.resetPasswordForEmail.mockRejectedValue(new Error("private connection details"));
  const result = await requestPasswordReset({}, emailForm());
  expect(result.error).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain("private");
});

it.each(["short", "x".repeat(129)])("rejects an invalid new password (%#)", async (password) => {
  expect((await updatePassword({}, passwordForm(password))).error).toBeTruthy();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it("rejects mismatched passwords", async () => {
  expect((await updatePassword({}, passwordForm("a-long-test-password", "different-password"))).error).toBeTruthy();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it.each([
  [null, null],
  [{ id: "test-account" }, { message: "expired" }],
])("requires server-verified identity before changing the password (%#)", async (user, error) => {
  mocks.getUser.mockResolvedValue({ data: { user }, error });
  expect((await updatePassword({}, passwordForm())).error).toBeTruthy();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it("preserves password spaces and signs out after successful update", async () => {
  await expect(updatePassword({}, passwordForm(" password with spaces "))).rejects.toThrow("redirect:/password-updated");
  expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({ password: " password with spaces " });
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
});

it("does not claim success or sign out when password update fails", async () => {
  mocks.updateUser.mockResolvedValue({ error: { message: "private details" } });
  const result = await updatePassword({}, passwordForm());
  expect(result.error).toBeTruthy();
  expect(result.complete).toBeUndefined();
  expect(mocks.signOut).not.toHaveBeenCalled();
});

it("reports password success separately from a failed sign-out", async () => {
  mocks.signOut.mockRejectedValue(new Error("network failure"));
  const result = await updatePassword({}, passwordForm());
  expect(result.complete).toBe(true);
  expect(result.message).toContain("sign-out failed");
});

it("rejects absent or failed callback codes", async () => {
  const missing = await GET(new Request("http://localhost:3000/auth/callback"));
  expect(missing.headers.get("location")).toBe("http://localhost:3000/auth/link-error");
  expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid code" } });
  const failed = await GET(new Request("http://localhost:3000/auth/callback?code=invalid"));
  expect(failed.headers.get("location")).toBe("http://localhost:3000/auth/link-error");
  expect(mocks.ensureProfile).not.toHaveBeenCalled();
});

it("routes verified recovery codes to the password page without requiring a profile", async () => {
  const response = await GET(new Request("http://localhost:3000/auth/callback?code=test-code&next=/update-password"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/update-password");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("test-code");
  expect(mocks.ensureProfile).not.toHaveBeenCalled();
});

it("provisions confirmed signups and rejects external redirect destinations", async () => {
  const response = await GET(new Request("http://untrusted.example/auth/callback?code=test-code&next=https://untrusted.example"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
});

it("handles profile provisioning failure without claiming confirmation flow completion", async () => {
  mocks.ensureProfile.mockRejectedValue(new Error("private database details"));
  const response = await GET(new Request("http://localhost:3000/auth/callback?code=test-code"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/auth/link-error");
});

it("requires an explicitly configured production origin", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "");
  expect(() => getAppOrigin()).toThrow("APP_URL must be configured");
});

it.each(["http://external.example", "https://example.test/path", "https://user:password@example.test"]) (
  "rejects unsafe app origins (%#)", (origin) => {
    vi.stubEnv("APP_URL", origin);
    expect(() => getAppOrigin()).toThrow();
  },
);
