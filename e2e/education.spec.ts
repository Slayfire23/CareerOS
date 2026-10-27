import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

const section = (page: Page) => page.getByRole("region", { name: "Education", exact: true });
const row = (page: Page, name: string) => section(page).getByRole("listitem").filter({ hasText: name });

async function save(page: Page, name: string) {
  await page.goto("/dashboard");
  await page.getByText("Add education", {exact:true}).click();
  const form = page.getByRole("form", { name: "Add education", exact: true });
  await form.getByLabel("Qualification or program", { exact: true }).fill("Bachelor of Science");
  await form.getByLabel("Institution", { exact: true }).fill(name);
  await form.getByLabel("Field of study (optional)", {exact:true}).fill("Mechanical engineering");
  await form.getByLabel("Start month", { exact: true }).fill("2020-01");
  await form.getByLabel("End month", { exact: true }).fill("2021-02");
  await form.getByRole("button", { name: "Save education", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Education saved.");
  await page.reload(); await expect(row(page, name)).toHaveCount(1);
}

test("education persists, edits dates, and stays private across accounts", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD || !env.E2E_TEST_EMAIL_B || !env.E2E_TEST_PASSWORD_B ||
      env.E2E_TEST_EMAIL.toLowerCase() === env.E2E_TEST_EMAIL_B.toLowerCase()) throw new Error("Two distinct test accounts are required.");
  const contextB = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const pageB = await contextB.newPage();
  const name = `Test institution ${randomUUID()}`;
  let started = false;
  try {
    for (const [p, email, password] of [[page, env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD], [pageB, env.E2E_TEST_EMAIL_B, env.E2E_TEST_PASSWORD_B]] as const) {
      await p.goto("/login"); await p.getByLabel("Email", { exact: true }).fill(email);
      await p.getByLabel("Password", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(p).toHaveURL(/\/dashboard\/?$/); await expect(section(p)).toBeVisible();
    }
    started = true;
    await save(page, name);
    await pageB.reload(); await expect(row(pageB, name)).toHaveCount(0);
    await save(pageB, name);
    await row(page,name).getByText("Edit education", {exact:true}).click();
    const edit = row(page,name).getByRole("form", {name: "Edit education at " + name, exact:true});
    await edit.getByLabel("Qualification or program",{exact:true}).fill("Master of Science");
    await edit.getByLabel("Field of study (optional)",{exact:true}).fill("");
    await edit.getByLabel("Currently studying",{exact:true}).check();
    await edit.getByRole("button",{name:"Save education",exact:true}).click();
    await expect(row(page,name).getByRole("heading")).toHaveText("Master of Science at " + name);
    await page.reload(); await expect(row(page,name)).toContainText("Present");
    await expect(row(page,name)).not.toContainText("Mechanical engineering");
    await row(page,name).getByRole("button",{name:/^Remove /}).click();
    await expect(row(page,name)).toHaveCount(0);
    await page.reload(); await expect(row(page,name)).toHaveCount(0);
    await pageB.reload(); await expect(row(pageB,name).getByRole("heading")).toHaveText("Bachelor of Science at " + name);
    await expect(row(pageB,name)).toContainText("2021-02");
    await expect(row(pageB,name)).toContainText("Mechanical engineering");
  } finally {
    try {
      if (started) {
        const cleaned = await Promise.allSettled([page, pageB].map(async (p) => {
          await p.goto("/dashboard"); await expect(section(p)).toBeVisible();
          if (await row(p, name).count()) {
            await row(p, name).getByRole("button", { name: /^Remove / }).click();
            await expect(row(p, name)).toHaveCount(0);
          }
        }));
        if (cleaned.some((result) => result.status === "rejected")) throw new Error("Test education cleanup failed; inspect the disposable accounts.");
      }
    } finally { await contextB.close(); }
  }
});
