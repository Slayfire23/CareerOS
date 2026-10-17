import { expect, test } from "@playwright/test";

test("forgot-password link opens the recovery form without sending email", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await expect(page).toHaveURL(/\/forgot-password\/?$/);
  await expect(page.getByRole("heading", { name: "Reset your password", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
});

test("signed-out users cannot open the new-password form directly", async ({ page }) => {
  await page.goto("/update-password");
  await expect(page).toHaveURL(/\/auth\/link-error\/?$/);
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
});

test("a callback with no code displays a useful error", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/auth\/link-error\/?$/);
  await expect(page.getByRole("heading", { name: "We could not verify this link", exact: true })).toBeVisible();
});
