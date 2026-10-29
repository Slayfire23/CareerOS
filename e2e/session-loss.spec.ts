import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  const values = parse(readFileSync(resolve(process.cwd(), ".env.playwright.local")));
  if (!values.E2E_TEST_EMAIL?.trim() || !values.E2E_TEST_PASSWORD) {
    throw new Error("The dedicated browser-test account credentials are missing.");
  }
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(values.E2E_TEST_EMAIL.trim());
  await page.getByLabel("Password", { exact: true }).fill(values.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/); await page.goto("/dashboard/profile"); await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
}

test("losing session cookies blocks the next dashboard request", async ({ page, context }) => {
  await signIn(page);
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("heading", { name: "Your dashboard", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveCount(0);
});

test("an already-open profile form cannot save after session cookies are lost", async ({ page, context }) => {
  test.setTimeout(90000);
  await signIn(page);
  const original = {
    name: await page.getByLabel("Display name", { exact: true }).inputValue(),
    headline: await page.getByLabel("Headline (optional)", { exact: true }).inputValue(),
    goals: await page.getByLabel("Career goals (optional)", { exact: true }).inputValue(),
  };
  let checkedPersistence = false;
  try {
    await context.clearCookies();
    await page.getByLabel("Display name", { exact: true }).fill(`Rejected session test ${randomUUID()}`);
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(
  page.getByRole("alert").filter({hasText: "Your session has expired. Please sign in again.",}),).toHaveText("Your session has expired. Please sign in again.");
    await expect(page.getByRole("status")).toHaveCount(0);
    await signIn(page);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(original.name);
    await expect(page.getByLabel("Headline (optional)", { exact: true })).toHaveValue(original.headline);
    await expect(page.getByLabel("Career goals (optional)", { exact: true })).toHaveValue(original.goals);
    checkedPersistence = true;
  } finally {
    if (!checkedPersistence) {
      // If the protection is broken, restore this dedicated account's original profile.
      await signIn(page);
      await page.getByLabel("Display name", { exact: true }).fill(original.name);
      await page.getByLabel("Headline (optional)", { exact: true }).fill(original.headline);
      await page.getByLabel("Career goals (optional)", { exact: true }).fill(original.goals);
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Profile saved.");
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login\/?$/);
  }
});
