import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

const SECTIONS = [
  ["Overview", "/dashboard", "Your dashboard"],
  ["Profile", "/dashboard/profile", "Profile"],
  ["Preferences", "/dashboard/preferences", "Preferences"],
  ["Skills", "/dashboard/skills", "Skills"],
  ["Experience", "/dashboard/experience", "Experience"],
  ["Education", "/dashboard/education", "Education"],
  ["Projects", "/dashboard/projects", "Projects"],
  ["Resumes", "/dashboard/resumes", "Resumes"],
  ["Saved jobs", "/dashboard/jobs", "Saved jobs"],
  ["Job analysis", "/dashboard/analysis", "Job analysis"],
] as const;

async function signIn(page: Page) {
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD) throw new Error("Disposable test credentials required.");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(env.E2E_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

test("signed-out visitors are sent to login from every section page", async ({ page }) => {
  for (const [, path] of SECTIONS) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login\/?$/);
  }
});

test("pre-redesign addresses redirect to their new pages", async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  for (const [from, to] of [["/jobs", "/dashboard/jobs"], [`/jobs/${id}/requirements`, `/dashboard/jobs/${id}/requirements`], ["/dashboard/resume-review/abc.pdf", "/dashboard/resumes/review/abc.pdf"]]) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(307);
    expect(new URL(response.headers().location, "http://localhost").pathname, from).toBe(to);
  }
});

test("sidebar reaches every section, marks the current page, and keeps forms off the overview", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: /^Save / })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [label, path, heading] of SECTIONS) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}\\/?$`));
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test("mobile menu opens, navigates, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByText("Menu", { exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Skills", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/skills\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Skills", exact: true })).toBeVisible();
  await expect(nav).toBeHidden();
});
