import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

type Values = { roles: string; industries: string; choices: string[] };
const preferences = (page: Page) => page.getByRole("form", { name: "Career preferences", exact: true });

async function read(page: Page): Promise<Values> {
  const form = preferences(page);
  return {
    roles: await form.getByLabel("Target roles", { exact: true }).inputValue(),
    industries: await form.getByLabel("Industries of interest", { exact: true }).inputValue(),
    choices: await form.locator('input[type="checkbox"]:checked').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
  };
}
async function save(page: Page, values: Values) {
  await page.goto("/dashboard/preferences"); await page.waitForLoadState("networkidle");
  const form = preferences(page);
  await form.getByLabel("Target roles", { exact: true }).fill(values.roles);
  await form.getByLabel("Industries of interest", { exact: true }).fill(values.industries);
  for (const input of await form.getByRole("checkbox").all()) {
    await input.setChecked(values.choices.includes((await input.getAttribute("value"))!));
  }
  await form.getByRole("button", { name: "Save career preferences", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Career preferences saved.");
  await page.reload();
  await expect(preferences(page)).toBeVisible();
  expect(await read(page)).toEqual(values);
}

test("preferences persist, clear, and remain separate between two accounts", async ({ page, browser, baseURL }) => {
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
      await expect(p).toHaveURL(/\/dashboard\/?$/); await p.goto("/dashboard/preferences"); await p.waitForLoadState("networkidle");
      await expect(preferences(p)).toBeVisible();
    }
    originalA = await read(page); originalB = await read(pageB);
    // Career goals live on the profile page; preference saves must not change them.
    await page.goto("/dashboard/profile"); await page.waitForLoadState("networkidle");
    const goals = await page.getByLabel("Career goals (optional)", { exact: true }).inputValue();
    await page.goto("/dashboard/preferences"); await page.waitForLoadState("networkidle");
    const a = { roles: "Software developer\nData analyst", industries: "Healthcare", choices: ["remote", "hybrid", "full_time"] };
    changed = true;
    await save(page, a);
    await pageB.reload(); expect(await read(pageB)).toEqual(originalB);
    await save(pageB, { roles: "Mechanical engineer", industries: "Manufacturing", choices: ["on_site", "contract"] });
    await page.reload(); expect(await read(page)).toEqual(a);
    await page.goto("/dashboard/profile"); await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Career goals (optional)", { exact: true })).toHaveValue(goals);
    await page.goto("/dashboard/preferences"); await page.waitForLoadState("networkidle");
    await save(page, { roles: "", industries: "", choices: [] });
  } finally {
    try {
      if (changed && originalA && originalB) {
        const restored = await Promise.allSettled([save(page, originalA), save(pageB, originalB)]);
        if (restored.some((result) => result.status === "rejected")) throw new Error("Test preference restoration failed; inspect disposable accounts.");
      }
    } finally { await contextB.close(); }
  }
});
