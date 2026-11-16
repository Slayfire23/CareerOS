import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, type Locator, type Page } from "@playwright/test";

// Which review mode the server under test runs in. A server can get its flags from `.env` or from its launch environment
// (the local `careeros-*-3100` entries), so a run may declare the mode: E2E_REVIEW=true|false, or E2E_STRUCTURED_FORM /
// E2E_STRUCTURED_MATCHING=true (both need the review). Without a declaration, `.env` decides, as before. The declaration
// is then checked against the page itself (`expectReviewMode`), so a wrong one fails the run instead of passing or
// skipping.
export function declaredMode(): { review: boolean; structuredForm: boolean } {
  const env = existsSync(".env") ? parse(readFileSync(".env")) : {};
  const structured = process.env.E2E_STRUCTURED_FORM === "true" || process.env.E2E_STRUCTURED_MATCHING === "true";
  const declared = process.env.E2E_REVIEW;
  if (declared !== undefined && declared !== "true" && declared !== "false") throw new Error("E2E_REVIEW must be \"true\" or \"false\".");
  if (declared === "false" && structured) throw new Error("E2E_REVIEW=false contradicts E2E_STRUCTURED_FORM/E2E_STRUCTURED_MATCHING, which need the review.");
  const review = declared !== undefined ? declared === "true" : structured || env.CLARIFICATION_REVIEW_ENABLED === "true";
  const structuredForm = structured || (declared === undefined && review && env.STRUCTURED_OWNERSHIP_FORM_ENABLED === "true");
  return { review, structuredForm };
}

/** On a match page with an analysis: the review section is there exactly when the server has the review on. */
export async function expectReviewMode(page: Page, review: boolean) {
  const section = page.getByRole("region", { name: "What CareerOS couldn't establish" });
  await expect(page.getByRole("region", { name: "Latest analysis" })).toBeVisible();
  await expect(section, review
    ? "The server has the review OFF, but this run declared it on (E2E_REVIEW, E2E_STRUCTURED_* or .env)."
    : "The server has the review ON, but this run declared it off: set E2E_REVIEW=true for this server.").toHaveCount(review ? 1 : 0);
}

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
