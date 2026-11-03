import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// The laptop-off case end to end: run with the AI service stopped (E2E_AI_SERVICE_OFF=true). Rules-only
// analysis must work, and AI suggestions must explain that they're unavailable. Fictional data only.
test("analysis works with the AI service and Ollama off", async ({ page }) => {
  test.skip(process.env.E2E_AI_SERVICE_OFF !== "true", "Run with the AI service stopped.");
  test.setTimeout(120000);
  const serviceUp = await fetch("http://127.0.0.1:8010/health").then(() => true, () => false);
  expect(serviceUp, "The AI service must be stopped for this test.").toBe(false);

  const env = parse(readFileSync(".env.playwright.local"));
  const company = `Offline test ${randomUUID().slice(0, 8)}`;
  const skill = `Zetalab${randomUUID().slice(0, 8)}`;
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const skillRow = page.getByRole("region", { name: "Technical skills", exact: true }).getByRole("listitem").filter({ hasText: skill });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(env.E2E_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);

  try {
    await openPage(page, "/dashboard/skills");
    await page.getByLabel("Skill name", { exact: true }).fill(skill);
    await page.getByRole("button", { name: "Save skill", exact: true }).click();
    await expect(skillRow).toHaveCount(1);

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Engineer");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- Proficiency in ${skill}\n- Quuxflow administration`);
    await add.getByRole("button", { name: "Save job", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Job saved.");
    await jobRow.getByRole("link", { name: "Review requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    const requirementsUrl = page.url();
    const review = page.getByRole("form", { name: "Review job requirements" });
    await review.getByLabel("Include requirement 1", { exact: true }).check();
    await review.getByLabel("Include requirement 2", { exact: true }).check();
    await review.getByLabel("I reviewed the selected requirements against the job description.", { exact: true }).check();
    await review.getByRole("button", { name: "Save reviewed requirements", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");

    await openPage(page, requirementsUrl.replace(/\/requirements$/, "/match"));
    const runForm = page.getByRole("form", { name: "Run requirement analysis" });
    const latest = page.getByRole("region", { name: "Latest analysis" });
    const findings = latest.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });

    // Rules only.
    await runForm.getByRole("button", { name: "Run analysis", exact: true }).click();
    await expect(runForm.getByRole("status")).toHaveText("Analysis complete.", { timeout: 30000 });
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(findings.filter({ hasText: `Proficiency in ${skill}` }).getByText("Supported", { exact: true })).toBeVisible();
    await expect(findings.filter({ hasText: "Quuxflow administration" }).getByText("Not enough information", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "AI suggestions" })).toHaveCount(0);

    // With AI suggestions chosen: the same results, and an honest notice.
    const assisted = runForm.getByRole("radio", { name: /Rules \+ AI suggestions/ });
    if (await assisted.count()) {
      await assisted.check();
      await runForm.getByRole("button", { name: /Run analysis/ }).click();
      await expect(runForm.getByRole("status")).toHaveText("Analysis complete.", { timeout: 60000 });
      await page.reload();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(findings.filter({ hasText: `Proficiency in ${skill}` }).getByText("Supported", { exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "AI suggestions" }).getByRole("status")).toContainText("Local AI is unavailable right now");
    }
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/skills");
    if (await skillRow.count()) await confirmAction(skillRow.getByRole("button", { name: `Remove ${skill}`, exact: true }));
  }
});
