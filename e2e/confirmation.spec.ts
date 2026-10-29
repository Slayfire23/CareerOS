import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

test("destructive actions need confirmation; Cancel and Escape keep the item", async ({ page }) => {
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD) throw new Error("Disposable test credentials required.");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(env.E2E_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);

  const name = `Confirm test ${randomUUID().slice(0, 8)}`;
  const skills = page.getByRole("region", { name: "Technical skills", exact: true });
  const row = skills.getByRole("listitem").filter({ hasText: name });
  await openPage(page, "/dashboard/skills");
  await page.getByLabel("Skill name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save skill", exact: true }).click();
  await expect(row).toHaveCount(1);
  try {
    const remove = row.getByRole("button", { name: `Remove ${name}`, exact: true });

    await remove.click();
    const confirm = page.getByRole("button", { name: `Yes, remove ${name}`, exact: true });
    await expect(confirm).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(remove).toBeFocused();
    await page.reload(); await expect(row).toHaveCount(1);

    await remove.click();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await page.reload(); await expect(row).toHaveCount(1);

    await confirmAction(remove);
    await expect(row).toHaveCount(0);
    await page.reload(); await expect(row).toHaveCount(0);
  } finally {
    if (await row.count()) await confirmAction(row.getByRole("button", { name: `Remove ${name}`, exact: true }));
  }
});
