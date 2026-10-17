import { expect, test } from "@playwright/test";

test("signed-out dashboard access redirects to login, including after reload", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your dashboard", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("login and signup links navigate between the real account pages", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\/?$/);
  await expect(page.getByRole("heading", { name: "Create your account", exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("minlength", "12");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("browser validation blocks missing or malformed login inputs", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(email).toBeFocused();
  expect(await email.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  await email.fill("not-an-email");
  await password.fill("local-browser-validation-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect(await email.evaluate((element: HTMLInputElement) => element.validity.typeMismatch)).toBe(true);
  await expect(page).toHaveURL(/\/login\/?$/);
});
