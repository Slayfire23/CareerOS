import { expect, type Page } from "@playwright/test";

// Section content streams in behind a loading placeholder (aria-busy) and React reveals it
// shortly after. Wait for the reveal so actions target the visible form, not the hidden copy.
export async function openPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
