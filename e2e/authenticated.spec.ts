import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

type Profile = { name: string; headline: string; goals: string };

function credentials() {
  let values: Record<string, string>;
  try {
    values = parse(readFileSync(resolve(process.cwd(), ".env.playwright.local")));
  } catch {
    throw new Error("Create .env.playwright.local in the web folder before running authenticated tests.");
  }
  const email = values.E2E_TEST_EMAIL?.trim();
  const password = values.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("Both E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set for a dedicated test account.");
  }
  return { email, password };
}

async function signIn(page: Page) {
  const { email, password } = credentials();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expect(page.getByRole("heading", { name: "Your career profile", exact: true })).toBeVisible();
}

async function assertProfile(page: Page, profile: Profile) {
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(profile.name);
  await expect(page.getByLabel("Headline (optional)", { exact: true })).toHaveValue(profile.headline);
  await expect(page.getByLabel("Career goals (optional)", { exact: true })).toHaveValue(profile.goals);
}

async function save(page: Page, profile: Profile) {
  // Reload removes any previous success message before testing the next submission.
  await page.goto("/dashboard");
  await page.getByLabel("Display name", { exact: true }).fill(profile.name);
  await page.getByLabel("Headline (optional)", { exact: true }).fill(profile.headline);
  await page.getByLabel("Career goals (optional)", { exact: true }).fill(profile.goals);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await assertProfile(page, profile);
}

test("test account can sign in, persist a profile, and sign out", async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const original: Profile = {
    name: await page.getByLabel("Display name", { exact: true }).inputValue(),
    headline: await page.getByLabel("Headline (optional)", { exact: true }).inputValue(),
    goals: await page.getByLabel("Career goals (optional)", { exact: true }).inputValue(),
  };
  let needsRestore = false;
  try {
    const marker = randomUUID();
    needsRestore = true;
    await save(page, {
      name: `Browser test ${marker}`,
      headline: "Automated browser test",
      goals: `Verify profile persistence ${marker}`,
    });
    await save(page, original);
    needsRestore = false;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login\/?$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveCount(0);
  } finally {
    if (needsRestore) {
      // Best-effort recovery after a failed assertion. A failure here remains visible.
      await signIn(page);
      await save(page, original);
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(/\/login\/?$/);
    }
  }
});
