import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// The rules engine only: no AI service or Ollama needs to be running. Local resources, fictional data.
test("a question about a requirement: yes alone changes nothing, specifics are re-read by the rules, and the source stays visible", async ({ page }) => {
  test.setTimeout(180000);
  test.skip(parse(readFileSync(".env")).CLARIFICATION_REVIEW_ENABLED === "true", "The exception review replaces these questions; see job-review.spec.ts.");
  const env = parse(readFileSync(".env.playwright.local"));
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD) throw new Error("A disposable account is required.");
  const tag = randomUUID().slice(0, 8);
  const tool = `Quuxflow${tag}`;
  const company = `Clarify test ${tag}`;
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const experience = page.getByRole("region", { name: "Professional experience", exact: true }).getByRole("listitem").filter({ hasText: company });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(env.E2E_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);

  try {
    await openPage(page, "/dashboard/experience");
    await page.locator("summary", { hasText: "Add experience" }).click();
    const addRole = page.getByRole("form", { name: "Add professional experience", exact: true });
    await addRole.getByLabel("Job title", { exact: true }).fill("Office Assistant");
    await addRole.getByLabel("Company", { exact: true }).fill(company);
    await addRole.getByLabel("Start month", { exact: true }).fill("2020-01");
    await addRole.getByLabel("End month", { exact: true }).fill("2024-02");
    await addRole.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(addRole.getByRole("status")).toHaveText("Experience saved.");

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Coordinator");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- ${tool} administration`);
    await add.getByRole("button", { name: "Save job", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Job saved.");

    await jobRow.getByRole("link", { name: "Review requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    const requirementsUrl = page.url();
    await openPage(page, requirementsUrl);
    const review = page.getByRole("form", { name: "Review job requirements" });
    await review.getByLabel("Include requirement 1", { exact: true }).check();
    await review.getByLabel("I reviewed the selected requirements against the job description.", { exact: true }).check();
    await review.getByRole("button", { name: "Save reviewed requirements", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");

    await openPage(page, requirementsUrl.replace(/\/requirements$/, "/match"));
    await page.getByRole("button", { name: "Run analysis", exact: true }).click();
    await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    const panel = page.getByRole("region", { name: "Question about requirement 1" });
    await expect(panel.getByText(`Have you done this in a job: “${tool} administration”?`, { exact: false })).toBeVisible();
    const counts = page.getByRole("list", { name: "Verdict counts" });
    await expect(counts.getByText("Supported — Self-reported")).toBeVisible();
    await expect(page.getByText("Nothing here has been independently verified.", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verified matching results" })).toHaveCount(0);

    const shot = async (name: string, target = page.locator("main")) => { if (process.env.E2E_SHOTS) await target.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` }); };
    await shot("1-question", page.getByRole("listitem").filter({ hasText: "Requirement 1" }).filter({ hasText: "Do you agree" }));
    // Yes only opens a form: nothing is prefilled, and nothing has changed.
    await panel.getByRole("button", { name: "Yes, add details", exact: true }).click();
    const form = page.getByRole("form", { name: "Details for requirement 1" });
    await expect(form.getByLabel("What did you do?", { exact: true })).toHaveValue("");
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole("list").filter({ hasText: "Not enough information" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Answers you've added" })).toHaveCount(0);
    await expect(page.getByText("This analysis is out of date", { exact: false })).toHaveCount(0);

    // A vague answer is turned away.
    await page.getByRole("region", { name: "Question about requirement 1" }).getByRole("button", { name: "Yes, add details", exact: true }).click();
    await form.getByLabel("Which role?", { exact: true }).selectOption({ label: `Office Assistant, ${company}` });
    await form.getByLabel("What did you do?", { exact: true }).fill(`Yes, I have ${tool} administration experience.`);
    await form.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("A yes alone can't be used.");
    await expect(form.getByLabel("What did you do?", { exact: true })).toHaveValue(`Yes, I have ${tool} administration experience.`);
    await expect(form.getByLabel("Which role?", { exact: true })).not.toHaveValue("");

    await shot("2-vague-answer-refused", page.getByRole("listitem").filter({ hasText: "Requirement 1" }).filter({ hasText: "Do you agree" }));
    // Specifics go into the profile as self-reported, and the rules read them.
    await form.getByLabel("What did you do?", { exact: true }).fill(`Administered ${tool} for 80 sales staff across three offices, including weekly imports.`);
    await form.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(page.getByText("The rules now read this as Supported — Self-reported.", { exact: false })).toBeVisible();

    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    const finding = page.getByRole("listitem").filter({ hasText: `Requirement 1` }).filter({ hasText: "Do you agree" });
    await expect(finding.getByText("Supported — Self-reported", { exact: true })).toBeVisible();
    await expect(finding.getByText("From an answer you gave. Self-reported: CareerOS hasn't independently verified it.", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Question about requirement 1" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Answers you've added" })).toBeVisible();

    await shot("3-supported-self-reported", finding);
    await shot("4-answers-you-added", page.getByRole("heading", { name: "Answers you've added" }).locator(".."));
    // An answer in another language is kept and explained, it stops counting, and it can be edited back.
    const editing = page.getByRole("form", { name: new RegExp(`^Edit answer about ${tool}`) });
    await page.locator("summary", { hasText: "Edit" }).first().click();
    const original = await editing.getByLabel("Your answer").inputValue();
    await editing.getByLabel("Your answer").fill(`Administro ${tool} para ochenta vendedores en tres oficinas de la empresa cada semana.`);
    await editing.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(editing.getByRole("status")).toContainText("can only read answers written fully in English");
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText("can only read answers written fully in English", { exact: false }).first()).toBeVisible();
    await expect(finding.getByText("Supported — Self-reported", { exact: true })).toHaveCount(0);
    await page.locator("summary", { hasText: "Edit" }).first().click();
    await editing.getByLabel("Your answer").fill(original);
    await editing.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(editing.getByRole("status")).toContainText("Saved to your profile");
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(finding.getByText("Supported — Self-reported", { exact: true })).toBeVisible();

    // Taking the answer back removes the evidence and its stored copies, and the rules no longer support it.
    await page.getByRole("button", { name: new RegExp(`^Delete permanently answer about ${tool}`) }).click();
    await expect(page.getByRole("heading", { name: "Answers you've added" })).toHaveCount(0);
    await expect(page.getByText("This analysis is out of date", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Run analysis again", exact: true }).click();
    await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
    await page.reload();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Question about requirement 1" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Question about requirement 1" }).getByRole("button", { name: "No", exact: true })).toBeVisible();
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/experience");
    if (await experience.count()) await confirmAction(experience.getByRole("button", { name: /^Remove / }));
  }
});
