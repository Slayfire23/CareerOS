import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// Exception review, behind its disabled-by-default flag. Rules only: no AI service or Ollama needs to run.
// Local resources, fictional data. Skips unless the running server has the flag on.
test("review: questions, a specific answer, the verdict and its source, then revoke and delete", async ({ page }) => {
  test.setTimeout(180000);
  const env = parse(readFileSync(".env"));
  test.skip(env.CLARIFICATION_REVIEW_ENABLED !== "true", "Exception review is off (the default).");
  const accounts = parse(readFileSync(".env.playwright.local"));
  const tag = randomUUID().slice(0, 8);
  const company = `Review test ${tag}`;
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const experience = page.getByRole("region", { name: "Professional experience", exact: true }).getByRole("listitem").filter({ hasText: company });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(accounts.E2E_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(accounts.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);

  try {
    await openPage(page, "/dashboard/experience");
    await page.locator("summary", { hasText: "Add experience" }).click();
    const addRole = page.getByRole("form", { name: "Add professional experience", exact: true });
    await addRole.getByLabel("Job title", { exact: true }).fill("Clinic Assistant");
    await addRole.getByLabel("Company", { exact: true }).fill(company);
    await addRole.getByLabel("Start month", { exact: true }).fill("2020-01");
    await addRole.getByLabel("End month", { exact: true }).fill("2024-02");
    await addRole.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(addRole.getByRole("status")).toHaveText("Experience saved.");

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Phlebotomist");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill("Requirements:\n- Phlebotomy skills\n- Payroll skills");
    await add.getByRole("button", { name: "Save job", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Job saved.");

    await jobRow.getByRole("link", { name: "Review requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    const requirementsUrl = page.url();
    await openPage(page, requirementsUrl);
    const review = page.getByRole("form", { name: "Review job requirements" });
    await review.getByLabel("Include requirement 1", { exact: true }).check();
    await review.getByLabel("Include requirement 2", { exact: true }).check();
    await review.getByLabel("I reviewed the selected requirements against the job description.", { exact: true }).check();
    await review.getByRole("button", { name: "Save reviewed requirements", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");

    const matchUrl = requirementsUrl.replace(/\/requirements$/, "/match");
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: "Run analysis", exact: true }).click();
    await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
    await openPage(page, matchUrl);

    const section = page.getByRole("region", { name: "What CareerOS couldn't establish" });
    await expect(section.getByText("2 questions for the rest.", { exact: false })).toBeVisible();
    await expect(section.getByText("doesn't independently verify", { exact: false })).toBeVisible();
    const phlebotomy = section.getByRole("listitem", { name: /^Question/ }).filter({ hasText: "Phlebotomy" });

    // Yes opens an empty form. A vague answer is turned away, and what was typed stays.
    await phlebotomy.getByRole("button", { name: "Yes, add details", exact: true }).click();
    const form = phlebotomy.getByRole("form", { name: "Your answer" });
    await expect(form.getByLabel("What did you do?", { exact: true })).toHaveValue("");
    await form.getByLabel("Which role?", { exact: true }).selectOption({ label: `Clinic Assistant, ${company}` });
    await form.getByLabel("What did you do?", { exact: true }).fill("Yes, I have this.");
    await form.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("A yes alone can't be used.");
    await expect(form.getByLabel("What did you do?", { exact: true })).toHaveValue("Yes, I have this.");

    // A specific answer, in words that never say phlebotomy.
    await form.getByLabel("What did you do?", { exact: true }).fill("I drew blood from about 20 patients each morning using vacuum tubes.");
    await form.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(section.getByText(/Phlebotomy skills: Not enough information → Supported — Self-reported/)).toBeVisible();

    await openPage(page, matchUrl);
    const finding = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Phlebotomy skills", level: 3 }) });
    await expect(finding.getByText("Supported — Self-reported", { exact: true })).toBeVisible();
    await expect(finding.getByText("From an answer you gave. Self-reported: CareerOS hasn't independently verified it.", { exact: false })).toBeVisible();
    await expect(finding.getByText("I drew blood from about 20 patients each morning using vacuum tubes", { exact: false })).toBeVisible();
    await expect(finding.getByText("From the rules alone, before your answer: Not enough information.", { exact: false })).toBeVisible();

    // Deny the other. It's Not supported, labeled as self-reported.
    const payroll = page.getByRole("listitem", { name: /^Question/ }).filter({ hasText: "Payroll" });
    await payroll.getByRole("button", { name: "No, I don't have this", exact: true }).click();
    const payrollFinding = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Payroll skills", level: 3 }) });
    await expect(payrollFinding.getByText("Not supported — Self-reported", { exact: true })).toBeVisible();

    // Revoke goes back at once. Deleting removes the answer from the page.
    await page.getByRole("button", { name: /^Revoke answer about Phlebotomy/ }).click();
    await expect(finding.getByText("Not enough information", { exact: true })).toBeVisible();
    await expect(finding.getByText("I drew blood", { exact: false })).toHaveCount(0);
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: /^Delete permanently answer about Phlebotomy/ }).click();
    await page.getByRole("button", { name: "Yes, delete permanently", exact: true }).click();
    await expect(page.getByText("I drew blood", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: /^Revoke answer about Payroll/ }).click();
    await expect(payrollFinding.getByText("Not enough information", { exact: true })).toBeVisible();
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: /^Delete permanently answer about Payroll/ }).click();
    await page.getByRole("button", { name: "Yes, delete permanently", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your answers" })).toHaveCount(0);
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/experience");
    if (await experience.count()) await confirmAction(experience.getByRole("button", { name: /^Remove / }));
  }
});
