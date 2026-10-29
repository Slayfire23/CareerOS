import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./support";

const section = (page: Page) => page.getByRole("region", { name: "Technical skills", exact: true });
const row = (page: Page, name: string) => section(page).getByRole("listitem").filter({ hasText: name });

async function save(page: Page, name: string, level: string) {
  await openPage(page, "/dashboard/skills");
  const form = page.getByRole("form", { name: "Add or update technical skill", exact: true });
  await form.getByLabel("Skill name", { exact: true }).fill(name);
  await form.getByLabel("Proficiency (self-assessed, optional)", { exact: true }).selectOption(level);
  await form.getByRole("button", { name: "Save skill", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Skill saved.");
  await page.reload();
  await expect(row(page, name)).toHaveCount(1);
}

test("technical skills persist, update without duplicates, and delete independently", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD || !env.E2E_TEST_EMAIL_B || !env.E2E_TEST_PASSWORD_B ||
      env.E2E_TEST_EMAIL.toLowerCase() === env.E2E_TEST_EMAIL_B.toLowerCase()) throw new Error("Two distinct test accounts are required.");
  const contextB = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const pageB = await contextB.newPage();
  const name = `Test skill ${randomUUID()}`;
  let started = false;
  try {
    for (const [p, email, password] of [[page, env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD], [pageB, env.E2E_TEST_EMAIL_B, env.E2E_TEST_PASSWORD_B]] as const) {
      await p.goto("/login"); await p.getByLabel("Email", { exact: true }).fill(email);
      await p.getByLabel("Password", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(p).toHaveURL(/\/dashboard\/?$/); await openPage(p, "/dashboard/skills"); await expect(section(p)).toBeVisible();
    }
    started = true;
    await save(page, name, "BEGINNER");
    await expect(row(page, name)).toContainText("Beginner (self-assessed)");
    await pageB.reload(); await expect(row(pageB, name)).toHaveCount(0);
    await save(page, name, "ADVANCED");
    await expect(row(page, name)).toContainText("Advanced (self-assessed)");
    await save(pageB, name, "INTERMEDIATE");
    await save(page, name, "");
    await expect(row(page, name)).toContainText("Proficiency not specified");
    await row(page, name).getByRole("button", { name: `Remove ${name}`, exact: true }).click();
    await expect(row(page, name)).toHaveCount(0);
    await page.reload(); await expect(row(page, name)).toHaveCount(0);
    await pageB.reload(); await expect(row(pageB, name)).toContainText("Intermediate (self-assessed)");
  } finally {
    try {
      if (started) {
        const cleaned = await Promise.allSettled([page, pageB].map(async (p) => {
          await openPage(p, "/dashboard/skills"); await expect(section(p)).toBeVisible();
          if (await row(p, name).count()) {
            await row(p, name).getByRole("button", { name: `Remove ${name}`, exact: true }).click();
            await expect(row(p, name)).toHaveCount(0);
          }
        }));
        if (cleaned.some((result) => result.status === "rejected")) throw new Error("Test skill cleanup failed; inspect the disposable accounts.");
      }
    } finally { await contextB.close(); }
  }
});
