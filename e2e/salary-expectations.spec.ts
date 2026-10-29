import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

type Values = { minimum: string; maximum: string; currency: string; period: string };
const preferences = (page: Page) => page.getByRole("form", { name: "Salary expectations", exact: true });

async function read(page: Page): Promise<Values> {
  const form = preferences(page);
  return {
    minimum: await form.getByLabel("Minimum pay",{exact:true}).inputValue(),
    maximum: await form.getByLabel("Maximum pay",{exact:true}).inputValue(),
    currency: await form.getByLabel("Currency",{exact:true}).inputValue(),
    period: await form.getByLabel("Pay period",{exact:true}).inputValue(),
  };
}
async function save(page: Page, values: Values) {
  await page.goto("/dashboard/preferences"); await page.waitForLoadState("networkidle");
  const form = preferences(page);
  await form.getByLabel("Minimum pay",{exact:true}).fill(values.minimum);
  await form.getByLabel("Maximum pay",{exact:true}).fill(values.maximum);
  await form.getByLabel("Currency",{exact:true}).selectOption(values.currency);
  await form.getByLabel("Pay period",{exact:true}).selectOption(values.period);
  await form.getByRole("button", { name: "Save salary expectations", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Salary expectations saved.");
  await page.reload();
  await expect(preferences(page)).toBeVisible();
  expect(await read(page)).toEqual(values);
}

test("salary expectations persist, clear, and remain separate between two accounts", async ({ page, browser, baseURL }) => {
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
    const a = { minimum: "25.10", maximum: "40.99", currency: "USD", period: "hour" };
    changed = true;
    await save(page, a);
    await pageB.reload(); expect(await read(pageB)).toEqual(originalB);
    await save(pageB, { minimum: "0.00", maximum: "90000.00", currency: "CAD", period: "year" });
    await page.reload(); expect(await read(page)).toEqual(a);
    await page.goto("/dashboard/profile"); await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Career goals (optional)", { exact: true })).toHaveValue(goals);
    await page.goto("/dashboard/preferences"); await page.waitForLoadState("networkidle");
    await save(page, { minimum: "", maximum: "", currency: "", period: "" });
  } finally {
    try {
      if (changed && originalA && originalB) {
        const restored = await Promise.allSettled([save(page, originalA), save(pageB, originalB)]);
        if (restored.some((result) => result.status === "rejected")) throw new Error("Test preference restoration failed; inspect disposable accounts.");
      }
    } finally { await contextB.close(); }
  }
});
