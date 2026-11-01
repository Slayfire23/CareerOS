import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// Hybrid analysis end to end: the rules engine plus local AI (Ollama on this machine, through the
// real AI service with AI_PROVIDERS including "hybrid"). Requires e2e-a in
// AI_LOCAL_LLM_ALLOWED_USERS. Free and local; fictional data only.
test("rules + local AI labels each finding's method and adds a synonym match", async ({ page }) => {
  const app = existsSync(".env") ? parse(readFileSync(".env")) : {};
  test.skip(app.AI_LOCAL_LLM_ENABLED !== "true", "Local AI is turned off.");
  test.setTimeout(240000);
  const env = parse(readFileSync(".env.playwright.local"));
  const tag = randomUUID().slice(0, 8);
  const company = `Hybrid test ${tag}`;
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const skills = page.getByRole("region", { name: "Technical skills", exact: true });
  const skillRow = skills.getByRole("listitem").filter({ hasText: /^K8s/ });
  let addedSkill = false;

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(env.E2E_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);

  try {
    await openPage(page, "/dashboard/skills");
    if (!(await skillRow.count())) {
      await page.getByLabel("Skill name", { exact: true }).fill("K8s");
      await page.getByRole("button", { name: "Save skill", exact: true }).click();
      await expect(skillRow).toHaveCount(1);
      addedSkill = true;
    }

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Platform Engineer");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill("Requirements:\n- Kubernetes administration\n- 15+ years of professional experience");
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
    await runForm.getByRole("radio", { name: /Rules \+ local AI/ }).check();
    await runForm.getByRole("button", { name: "Run analysis", exact: true }).click();
    await expect(runForm.getByRole("status")).toHaveText("Analysis complete.", { timeout: 150000 });
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    const latest = page.getByRole("region", { name: "Latest analysis" });
    await expect(latest.getByText(/Rules \+ local AI \(qwen3:8b\)/)).toBeVisible();
    await expect(latest.getByText("The rules engine decided every requirement.", { exact: false })).toBeVisible();
    const findings = latest.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });
    // The rules engine can't match "K8s" to Kubernetes; local AI proposes it and code confirms it.
    const kubernetes = findings.filter({ hasText: "Kubernetes administration" });
    await expect(kubernetes.getByText("Local AI match, checked by code", { exact: true })).toBeVisible();
    await expect(kubernetes.getByText("Supported", { exact: true })).toBeVisible();
    await expect(kubernetes.getByText("K8s", { exact: true })).toBeVisible();
    // Durations are a hard qualification: always the rules engine, never sent to local AI.
    const years = findings.filter({ hasText: "15+ years of professional experience" });
    await expect(years.getByText(/^Rules engine \(experience, education/)).toBeVisible();
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    if (addedSkill) {
      await openPage(page, "/dashboard/skills");
      if (await skillRow.count()) await confirmAction(skillRow.getByRole("button", { name: "Remove K8s", exact: true }));
    }
  }
});
