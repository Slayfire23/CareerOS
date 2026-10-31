import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// Requires the local AI service (ai-service/, rules provider) on AI_SERVICE_URL. Local resources only.
test("requirement analysis runs on reviewed requirements, cites evidence, records feedback, and stays private", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD || !env.E2E_TEST_EMAIL_B || !env.E2E_TEST_PASSWORD_B) throw new Error("Two disposable accounts required.");
  const contextB = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const pageB = await contextB.newPage();
  const tag = randomUUID().slice(0, 8);
  const skill = `Zetalab${tag}`;
  const company = `Match test ${tag}`;
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const skillRow = page.getByRole("region", { name: "Technical skills", exact: true }).getByRole("listitem").filter({ hasText: skill });

  async function signIn(p: Page, email: string, password: string) {
    await p.goto("/login");
    await p.getByLabel("Email", { exact: true }).fill(email);
    await p.getByLabel("Password", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(p).toHaveURL(/\/dashboard\/?$/);
  }

  try {
    await signIn(page, env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD);
    await signIn(pageB, env.E2E_TEST_EMAIL_B, env.E2E_TEST_PASSWORD_B);

    await openPage(page, "/dashboard/skills");
    await page.getByLabel("Skill name", { exact: true }).fill(skill);
    await page.getByRole("button", { name: "Save skill", exact: true }).click();
    await expect(skillRow).toHaveCount(1);

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Engineer");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- Proficiency in ${skill}\n- Kubernetes administration`);
    await add.getByRole("button", { name: "Save job", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Job saved.");

    // Manual review first: the analysis only runs on confirmed requirements.
    await jobRow.getByRole("link", { name: "Review requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    const requirementsUrl = page.url();
    const matchUrl = requirementsUrl.replace(/\/requirements$/, "/match");
    await openPage(page, matchUrl);
    await expect(page.getByText("Review and save this job's requirements before running an analysis.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run analysis", exact: true })).toBeDisabled();

    await openPage(page, requirementsUrl);
    const review = page.getByRole("form", { name: "Review job requirements" });
    await review.getByLabel("Include requirement 1", { exact: true }).check();
    await review.getByLabel("Include requirement 2", { exact: true }).check();
    await review.getByLabel("I reviewed the selected requirements against the job description.", { exact: true }).check();
    await review.getByRole("button", { name: "Save reviewed requirements", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");

    await openPage(page, requirementsUrl);
    await page.getByRole("link", { name: "Requirement analysis", exact: true }).click();
    await expect(page).toHaveURL(/\/match$/);
    await expect(page.getByRole("heading", { level: 1, name: "Requirement analysis" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Job analysis", exact: true })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Run analysis", exact: true }).click();
    await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    const findings = page.getByRole("region", { name: "Latest analysis" }).getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });
    const first = findings.filter({ hasText: `Proficiency in ${skill}` });
    await expect(first.getByText("Supported", { exact: true })).toBeVisible();
    await expect(first.getByText(skill, { exact: true })).toBeVisible();
    await expect(first.getByRole("link", { name: "Skill", exact: true })).toHaveAttribute("href", "/dashboard/skills");
    const second = findings.filter({ hasText: "Kubernetes administration" });
    await expect(second.getByText("Not enough information", { exact: true })).toBeVisible();
    await expect(page.getByText("They are not a fit score.", { exact: false })).toBeVisible();

    await first.getByRole("button", { name: "Agree with finding 1", exact: true }).click();
    await expect(first.getByRole("status")).toHaveText("Feedback saved.");
    await page.reload();
    await expect(first.getByText("You agreed.")).toBeVisible();
    await expect(first.getByRole("button", { name: "Agree with finding 1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();

    // Another account cannot see it, and signing out protects it.
    await pageB.goto(matchUrl);
    await expect(pageB.getByRole("heading", { name: "404" })).toBeVisible();

    // Editing the job makes the requirement review, and therefore the analysis, out of date.
    await openPage(page, "/dashboard/jobs");
    await jobRow.getByText("Edit job", { exact: true }).click();
    const edit = jobRow.getByRole("form", { name: `Edit job at ${company}`, exact: true });
    await edit.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- Proficiency in ${skill}\n- Changed requirement`);
    await edit.getByRole("button", { name: "Save job", exact: true }).click();
    await jobRow.getByText("View description", { exact: true }).click();
    await expect(jobRow.locator("p").filter({ hasText: "Changed requirement" })).toBeVisible();
    await openPage(page, matchUrl);
    await expect(page.getByText(/The job description changed after your requirement review/)).toBeVisible();
    await expect(page.getByText(/This analysis is out of date/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Run analysis again", exact: true })).toBeDisabled();

    await pageB.context().clearCookies();
    await pageB.goto(matchUrl);
    await expect(pageB).toHaveURL(/\/login\/?$/);
  } finally {
    try {
      await openPage(page, "/dashboard/jobs");
      if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
      await openPage(page, "/dashboard/skills");
      if (await skillRow.count()) await confirmAction(skillRow.getByRole("button", { name: `Remove ${skill}`, exact: true }));
    } finally {
      await contextB.close();
    }
  }
});
