import { expect, type Locator, type Page } from "@playwright/test";

// Section content streams in behind a loading placeholder (aria-busy) and React reveals it
// shortly after. Wait for the reveal so actions target the visible form, not the hidden copy.
export async function openPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await waitForHydratedForms(page);
}

// Typing into a form before React hydrates it can be undone by hydration (controlled fields
// reset to their initial state). React attaches its props to each element it hydrates.
export async function waitForHydratedForms(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main form")].every(form => Object.keys(form).some(key => key.startsWith("__reactProps$"))));
}

// Destructive buttons ask for inline confirmation; click the trigger, then "Yes, …".
export async function confirmAction(trigger: Locator) {
  await trigger.click();
  await trigger.page().getByRole("button", { name: /^Yes, / }).click();
}
