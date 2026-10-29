import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

const section = (page: Page) => page.getByRole("region", { name: "Projects and accomplishments", exact: true });
const row = (page: Page, name: string) => section(page).getByRole("listitem").filter({ hasText: name });

async function save(page: Page,name:string){
 await page.goto("/dashboard/projects"); await page.waitForLoadState("networkidle");await page.getByText("Add project or accomplishment",{exact:true}).click();const form=page.getByRole("form",{name:"Add project or accomplishment",exact:true});
 await form.getByLabel("Title",{exact:true}).fill(name);
 await form.getByLabel("Your contribution (optional)",{exact:true}).fill("Coordinated a team");
 await form.getByLabel("Supporting links (optional)",{exact:true}).fill("https://example.com");
 await form.getByRole("button",{name:"Save project",exact:true}).click();await expect(form.getByRole("status")).toHaveText("Project saved.");await page.reload();await expect(row(page,name)).toHaveCount(1);
}

test("optional projects persist, edit, clear, and stay private across accounts", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD || !env.E2E_TEST_EMAIL_B || !env.E2E_TEST_PASSWORD_B ||
      env.E2E_TEST_EMAIL.toLowerCase() === env.E2E_TEST_EMAIL_B.toLowerCase()) throw new Error("Two distinct test accounts are required.");
  const contextB = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const pageB = await contextB.newPage();
  const name = `Test accomplishment ${randomUUID()}`;
  let started = false;
  try {
    for (const [p, email, password] of [[page, env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD], [pageB, env.E2E_TEST_EMAIL_B, env.E2E_TEST_PASSWORD_B]] as const) {
      await p.goto("/login"); await p.getByLabel("Email", { exact: true }).fill(email);
      await p.getByLabel("Password", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(p).toHaveURL(/\/dashboard\/?$/); await p.goto("/dashboard/projects"); await p.waitForLoadState("networkidle"); await expect(section(p)).toBeVisible();
    }
    started = true;
    await save(page, name);
    await pageB.reload(); await expect(row(pageB, name)).toHaveCount(0);
    await save(pageB, name);
    await row(page,name).getByText("Edit project",{exact:true}).click();
    const edit=row(page,name).getByRole("form",{name:"Edit project "+name,exact:true});
    await edit.getByLabel("Your contribution (optional)",{exact:true}).fill("");
    await edit.getByLabel("Supporting links (optional)",{exact:true}).fill("");
    await edit.getByRole("button",{name:"Save project",exact:true}).click();
    await expect(row(page,name).getByRole("link")).toHaveCount(0);
    await page.reload();await expect(row(page,name)).not.toContainText("Coordinated a team");
    await row(page,name).getByRole("button",{name:"Remove "+name,exact:true}).click();
    await expect(row(page,name)).toHaveCount(0);await page.reload();await expect(row(page,name)).toHaveCount(0);
    await pageB.reload();await expect(row(pageB,name)).toContainText("Coordinated a team");
    await expect(row(pageB,name).getByRole("link")).toHaveAttribute("href","https://example.com/");
  } finally {
    try {
      if (started) {
        const cleaned = await Promise.allSettled([page, pageB].map(async (p) => {
          await p.goto("/dashboard/projects"); await p.waitForLoadState("networkidle"); await expect(section(p)).toBeVisible();
          if (await row(p, name).count()) {
            await row(p, name).getByRole("button", { name: /^Remove / }).click();
            await expect(row(p, name)).toHaveCount(0);
          }
        }));
        if (cleaned.some((result) => result.status === "rejected")) throw new Error("Test project cleanup failed; inspect the disposable accounts.");
      }
    } finally { await contextB.close(); }
  }
});
