import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

type Credentials = { email: string; password: string };
type Profile = { name: string; headline: string; goals: string };

function accounts(): [Credentials, Credentials] {
  const values = parse(readFileSync(resolve(process.cwd(), ".env.playwright.local")));
  const a = { email: values.E2E_TEST_EMAIL?.trim(), password: values.E2E_TEST_PASSWORD };
  const b = { email: values.E2E_TEST_EMAIL_B?.trim(), password: values.E2E_TEST_PASSWORD_B };
  if (!a.email || !a.password || !b.email || !b.password) {
    throw new Error("Configure both dedicated test accounts in .env.playwright.local.");
  }
  if (a.email.toLowerCase() === b.email.toLowerCase()) {
    throw new Error("Account isolation requires two different test accounts.");
  }
  return [
    { email: a.email, password: a.password },
    { email: b.email, password: b.password },
  ];
}

async function signIn(page: Page, account: Credentials) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/); await page.goto("/dashboard/profile"); await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/?$/);
}

async function readProfile(page: Page): Promise<Profile> {
  return {
    name: await page.getByLabel("Display name", { exact: true }).inputValue(),
    headline: await page.getByLabel("Headline (optional)", { exact: true }).inputValue(),
    goals: await page.getByLabel("Career goals (optional)", { exact: true }).inputValue(),
  };
}

async function assertProfile(page: Page, profile: Profile) {
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(profile.name);
  await expect(page.getByLabel("Headline (optional)", { exact: true })).toHaveValue(profile.headline);
  await expect(page.getByLabel("Career goals (optional)", { exact: true })).toHaveValue(profile.goals);
}

async function save(page: Page, profile: Profile) {
  await page.goto("/dashboard/profile"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Display name", { exact: true }).fill(profile.name);
  await page.getByLabel("Headline (optional)", { exact: true }).fill(profile.headline);
  await page.getByLabel("Career goals (optional)", { exact: true }).fill(profile.goals);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await assertProfile(page, profile);
}

test("two accounts keep separate profiles across saves and account switching", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const [accountA, accountB] = accounts();
  const contextB = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const pageB = await contextB.newPage();
  let originalA: Profile | undefined;
  let originalB: Profile | undefined;
  let editsStarted = false;
  try {
    await signIn(page, accountA);
    originalA = await readProfile(page);
    await signIn(pageB, accountB);
    originalB = await readProfile(pageB);
    const marker = randomUUID();
    const profileA = { name: `Account A ${marker}`, headline: "Only account A", goals: `A goals ${marker}` };
    const profileB = { name: `Account B ${marker}`, headline: "Only account B", goals: `B goals ${marker}` };
    editsStarted = true;
    await save(page, profileA);
    await pageB.reload();
    await assertProfile(pageB, originalB);
    await save(pageB, profileB);
    await page.reload();
    await assertProfile(page, profileA);
    await pageB.reload();
    await assertProfile(pageB, profileB);

    // Reuse A's browser to check that switching accounts does not retain A's profile.
    await signOut(page);
    await signIn(page, accountB);
    await assertProfile(page, profileB);
    await signOut(page);
    await signIn(page, accountA);
    await assertProfile(page, profileA);
  } finally {
    try {
      if (editsStarted && originalA && originalB) {
        const restoreA = originalA;
        const restoreB = originalB;
        // Attempt both restorations even if one fails; failures must stay visible.
        const restorations = await Promise.allSettled([
          (async () => {
            await signIn(page, accountA);
            await save(page, restoreA);
            await signOut(page);
          })(),
          (async () => {
            await signIn(pageB, accountB);
            await save(pageB, restoreB);
            await signOut(pageB);
          })(),
        ]);
        if (restorations.some((result) => result.status === "rejected")) {
          throw new Error("A test profile could not be restored. Check both disposable profiles before rerunning.");
        }
      }
    } finally {
      await contextB.close();
    }
  }
});
