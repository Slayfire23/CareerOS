import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./support";

type Values = { locations: string; relocation: string; commute: string };
const preferences = (page: Page) => page.getByRole("form", { name: "Location and commute preferences", exact: true });

async function read(page: Page): Promise<Values> {
  const form = preferences(page);
  return {
    locations: await form.getByLabel("Preferred cities or regions", { exact: true }).inputValue(),
    relocation: await form.getByLabel("Willing to relocate", { exact: true }).inputValue(),
    commute: await form.getByLabel("Maximum one-way commute (minutes)", {exact:true}).inputValue(),
  };
}
async function save(page: Page, values: Values) {
  await openPage(page, "/dashboard/preferences");
  const form = preferences(page);
  await form.getByLabel("Preferred cities or regions", { exact: true }).fill(values.locations);
  await form.getByLabel("Willing to relocate", { exact: true }).selectOption(values.relocation);
  await form.getByLabel("Maximum one-way commute (minutes)", {exact:true}).fill(values.commute);
  await form.getByRole("button", { name: "Save location preferences", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Location preferences saved.");
  await page.reload();
  await expect(preferences(page)).toBeVisible();
  expect(await read(page)).toEqual(values);
}

test("location preferences persist, clear, and remain separate between two accounts", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const credentials = parse(readFileSync(".env.playwright.local"));
  if (!credentials.E2E_TEST_EMAIL || !credentials.E2E_TEST_PASSWORD || !credentials.E2E_TEST_EMAIL_B || !credentials.E2E_TEST_PASSWORD_B ||
      credentials.E2E_TEST_EMAIL.toLowerCase() === credentials.E2E_TEST_EMAIL_B.toLowerCase()) {
    throw new Error("Two distinct disposable test accounts are required.");
  }
  const contextB = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const pageB = await contextB.newPage();
  let originalA: Values | undefined;
  let originalB: Values | undefined;
  let changed = false;
  try {
    for (const [p, email, password] of [
      [page, credentials.E2E_TEST_EMAIL, credentials.E2E_TEST_PASSWORD],
      [pageB, credentials.E2E_TEST_EMAIL_B, credentials.E2E_TEST_PASSWORD_B],
    ] as const) {
      await p.goto("/login");
      await p.getByLabel("Email", { exact: true }).fill(email);
      await p.getByLabel("Password", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(p).toHaveURL(/\/dashboard\/?$/); await openPage(p, "/dashboard/preferences");
      await expect(preferences(p)).toBeVisible();
    }
    originalA = await read(page); originalB = await read(pageB);
    // Career goals live on the profile page; preference saves must not change them.
    await openPage(page, "/dashboard/profile");
    const goals = await page.getByLabel("Career goals (optional)", { exact: true }).inputValue();
    await openPage(page, "/dashboard/preferences");
    const a = { locations: "Chicago, IL\nMilwaukee, WI", relocation: "undecided", commute: "45" };
    changed = true;
    await save(page, a);
    await pageB.reload(); expect(await read(pageB)).toEqual(originalB);
    await save(pageB, { locations: "Detroit, MI", relocation: "yes", commute: "0" });
    await page.reload(); expect(await read(page)).toEqual(a);
    await openPage(page, "/dashboard/profile");
    await expect(page.getByLabel("Career goals (optional)", { exact: true })).toHaveValue(goals);
    await openPage(page, "/dashboard/preferences");
    await save(page, { locations: "", relocation: "", commute: "" });
  } finally {
    try {
      if (changed && originalA && originalB) {
        const restored = await Promise.allSettled([save(page, originalA), save(pageB, originalB)]);
        if (restored.some((result) => result.status === "rejected")) throw new Error("Test preference restoration failed; inspect disposable accounts.");
      }
    } finally { await contextB.close(); }
  }
});
