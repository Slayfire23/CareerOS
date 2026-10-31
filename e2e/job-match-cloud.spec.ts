import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// Cloud analysis end to end: consent, method choice, a run through the real AI service and SDK
// against the local mock Anthropic API (playwright.config.ts refuses anything else), and
// withdrawal. Requires e2e-a to be in AI_CLOUD_ALLOWED_USERS. Fictional data only.
test("cloud analysis needs consent, runs through the mock provider, and can be withdrawn", async ({ page }) => {
  test.setTimeout(180000);
  const env = parse(readFileSync(".env.playwright.local"));
  const tag = randomUUID().slice(0, 8);
  const skill = `Fictaskill${tag}`;
  const company = `Cloud test ${tag}`;
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const skillRow = page.getByRole("region", { name: "Technical skills", exact: true }).getByRole("listitem").filter({ hasText: skill });
  const consent = page.getByRole("form", { name: "Cloud analysis consent" });
  const runForm = page.getByRole("form", { name: "Run requirement analysis" });

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
    await add.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- Proficiency in ${skill}`);
    await add.getByRole("button", { name: "Save job", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Job saved.");
    await jobRow.getByRole("link", { name: "Review requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    const matchUrl = page.url().replace(/\/requirements$/, "/match");
    await openPage(page, page.url());
    const review = page.getByRole("form", { name: "Review job requirements" });
    await review.getByLabel("Include requirement 1", { exact: true }).check();
    await review.getByLabel("I reviewed the selected requirements against the job description.", { exact: true }).check();
    await review.getByRole("button", { name: "Save reviewed requirements", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");

    // Start from no consent (an earlier run may have left it given).
    await openPage(page, matchUrl);
    if (await consent.getByRole("button", { name: "Withdraw consent" }).count()) {
      await consent.getByRole("button", { name: "Withdraw consent" }).click();
      await expect(consent.getByRole("status")).toContainText("Consent withdrawn");
      await openPage(page, matchUrl);
    }

    // The rules engine is the default; the cloud method stays blocked until consent is given.
    await expect(runForm.getByRole("radio", { name: /Rules engine/ })).toBeChecked();
    await runForm.getByRole("radio", { name: /Claude Sonnet 5\.5/ }).check();
    await expect(runForm.getByText("Give consent below to use Claude Sonnet 5.5.")).toBeVisible();
    await expect(runForm.getByRole("button", { name: /^Run analysis/ })).toBeDisabled();
    await expect(consent.getByText("Not sent", { exact: true })).toBeVisible();
    await expect(consent.getByText(/This cleaning is not guaranteed to catch everything/)).toBeVisible();
    await expect(consent.getByText(/Your name and email address as fields/)).toBeVisible();

    await consent.getByRole("checkbox").check();
    await consent.getByRole("button", { name: "Give consent" }).click();
    await expect(consent.getByRole("status")).toHaveText("Consent saved.");

    await openPage(page, matchUrl);
    await runForm.getByRole("radio", { name: /Claude Sonnet 5\.5/ }).check();
    await runForm.getByRole("button", { name: /^Run analysis/ }).click();
    await expect(runForm.getByRole("status")).toHaveText("Analysis complete.");

    await openPage(page, matchUrl);
    await expect(page.getByText(/Claude Sonnet 5\.5 \(Anthropic\) \(claude-sonnet-5-5\/prompt-v1\)/)).toBeVisible();
    const finding = page.getByRole("region", { name: "Latest analysis" }).getByRole("listitem").filter({ hasText: `Proficiency in ${skill}` });
    await expect(finding.getByText("Supported", { exact: true })).toBeVisible();
    await expect(finding.getByText(skill, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();

    await consent.getByRole("button", { name: "Withdraw consent" }).click();
    await expect(consent.getByRole("status")).toContainText("Consent withdrawn");
    await openPage(page, matchUrl);
    await runForm.getByRole("radio", { name: /Claude Sonnet 5\.5/ }).check();
    await expect(runForm.getByRole("button", { name: /^Run analysis/ })).toBeDisabled();
    // Past results stay visible after withdrawal.
    await expect(finding.getByText("Supported", { exact: true })).toBeVisible();
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/skills");
    if (await skillRow.count()) await confirmAction(skillRow.getByRole("button", { name: `Remove ${skill}`, exact: true }));
  }
});
