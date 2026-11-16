import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// Phase 5.3 Stage E: the structured "your part" form, behind its disabled-by-default flag (and the review's). Rules only:
// no AI service or Ollama. Local resources, fictional data. Skips unless the running server has both flags on (set them
// for the server process, or in .env, and set E2E_STRUCTURED_FORM=true for this run).
test("structured form: accessible controls, validation, saving changes no verdict, plain follow-up, removal", async ({ page }) => {
  test.setTimeout(240000);
  const env = parse(readFileSync(".env"));
  test.skip(process.env.E2E_STRUCTURED_FORM !== "true" && env.STRUCTURED_OWNERSHIP_FORM_ENABLED !== "true", "The structured form is off (the default).");
  // Stage F5: this spec checks the form with structured matching off ("doesn't change the match yet"); with it on, see
  // e2e/job-structured-matching.spec.ts.
  test.skip(process.env.E2E_STRUCTURED_MATCHING === "true", "Structured matching is on: covered by job-structured-matching.spec.ts.");
  const accounts = parse(readFileSync(".env.playwright.local"));
  const tag = randomUUID().slice(0, 8);
  const company = `Structured test ${tag}`;
  const requirement = "Install and repair residential plumbing";
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
    await addRole.getByLabel("Job title", { exact: true }).fill("Maintenance Technician");
    await addRole.getByLabel("Company", { exact: true }).fill(company);
    await addRole.getByLabel("Start month", { exact: true }).fill("2020-01");
    await addRole.getByLabel("End month", { exact: true }).fill("2024-02");
    await addRole.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(addRole.getByRole("status")).toHaveText("Experience saved.");

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Plumber");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- ${requirement}`);
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

    const matchUrl = requirementsUrl.replace(/\/requirements$/, "/match");
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: "Run analysis", exact: true }).click();
    await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
    await openPage(page, matchUrl);
    const finding = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: requirement, level: 3 }) });
    await expect(finding.getByText("Not enough information", { exact: true })).toBeVisible();

    const section = page.getByRole("region", { name: "What CareerOS couldn't establish" });
    const card = section.getByRole("listitem", { name: /^Question/ }).filter({ hasText: requirement });
    await card.getByRole("button", { name: "Yes, add details", exact: true }).click();
    const form = card.getByRole("form", { name: "Your part" });
    // Mode checks: the server has the structured form on, and structured matching off.
    await expect(form, "The server has the structured form OFF, but this run declared it on (E2E_STRUCTURED_FORM or .env).").toHaveCount(1);
    await expect(form.getByText(/This kind of answer doesn't change the match yet\./), "The server has structured matching ON: run this spec only against a form-only server, and job-structured-matching.spec.ts with E2E_STRUCTURED_MATCHING=true.").toBeVisible();

    // One required choice in a fieldset with a legend; nothing preselected; saving waits for a choice.
    const choice = form.getByRole("group", { name: /What was your part\?/ });
    await expect(choice.getByRole("radio")).toHaveCount(8);
    for (const radio of await choice.getByRole("radio").all()) await expect(radio).not.toBeChecked();
    await expect(form.getByRole("button", { name: "Save my answer", exact: true })).toBeDisabled();
    await expect(form.getByRole("group", { name: /How often/ })).toHaveCount(0);

    // Keyboard only: focus the first choice and select it with Space. The fields it needs appear; the parts are unticked.
    await choice.getByRole("radio", { name: "I did this work myself", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(choice.getByRole("radio", { name: "I did this work myself", exact: true })).toBeChecked();
    const parts = form.getByRole("group", { name: /Which of these did you do yourself\?/ });
    await expect(parts.getByRole("checkbox", { name: "Installing residential plumbing", exact: true })).not.toBeChecked();
    await expect(parts.getByRole("checkbox", { name: "Repairing residential plumbing", exact: true })).not.toBeChecked();
    await expect(form.getByLabel("What did you do yourself? (optional)")).toHaveAttribute("aria-describedby", /.+/);

    // A supervising choice asks the follow-on question and hides the doing fields.
    await choice.getByRole("radio", { name: "I supervised it or assigned it to others", exact: true }).check();
    await expect(form.getByRole("group", { name: "Did you also do any of it yourself?" })).toBeVisible();
    await expect(form.getByRole("group", { name: /How often/ })).toHaveCount(0);
    await choice.getByRole("radio", { name: "I did this work myself", exact: true }).check();

    // Missing answers: the server turns it away; errors are listed at the top (focused) and by each field.
    await form.getByLabel("Which role?", { exact: true }).selectOption({ label: `Maintenance Technician, ${company}` });
    await form.getByRole("button", { name: "Save my answer", exact: true }).click();
    const summary = form.getByRole("alert");
    await expect(summary).toContainText("Choose how often.");
    await expect(summary).toBeFocused();
    await expect(form.getByRole("group", { name: /How often/ })).toHaveAttribute("aria-invalid", "true");

    await form.getByRole("group", { name: /How often/ }).getByRole("radio", { name: "Weekly", exact: true }).check();
    await form.getByRole("group", { name: /Most recently/ }).getByRole("radio", { name: "It's part of my job now", exact: true }).check();
    await parts.getByRole("checkbox", { name: "Installing residential plumbing", exact: true }).check();
    await parts.getByRole("checkbox", { name: "Repairing residential plumbing", exact: true }).check();
    await form.getByLabel("What did you do yourself? (optional)").fill("I install water heaters and new supply lines in homes every week.");
    await form.getByRole("button", { name: "Save my answer", exact: true }).click();
    // Saved: the question leaves the list (as for any answer) and the answer appears under "Your answers".
    await expect(section.getByText(/^I did this work myself: I install water heaters/)).toBeVisible();
    await expect(section.getByText("Parts you did yourself: Installing residential plumbing, Repairing residential plumbing", { exact: false })).toBeVisible();

    // Saving changed no verdict.
    await openPage(page, matchUrl);
    await expect(finding.getByText("Not enough information", { exact: true })).toBeVisible();
    await expect(page.getByText("This kind of answer doesn't change the match yet.", { exact: true })).toBeVisible();

    // A plain follow-up names the part, never what was "found": the repair part wasn't described.
    const followUp = page.getByRole("list", { name: `Questions about your answer on ${requirement}` });
    await expect(followUp.getByText("You ticked “Repairing residential plumbing”. What did you do yourself?", { exact: true })).toBeVisible();
    await expect(followUp).not.toContainText(/shown|transferr|marker|recogni|matched/i);
    await followUp.getByRole("button", { name: "Leave it as it is", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "we'll leave it as it is" })).toBeVisible();
    await openPage(page, matchUrl);
    await expect(page.getByRole("list", { name: `Questions about your answer on ${requirement}` })).toHaveCount(0);

    // 375 px: one column, no sideways scrolling. Dark mode: the controls stay labeled and visible.
    await page.setViewportSize({ width: 375, height: 800 });
    await openPage(page, matchUrl);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.getByRole("button", { name: /^Change this answer/ })).toBeVisible();
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Removal works as for every answer.
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: `Delete permanently answer about ${requirement}` }).click();
    await page.getByRole("button", { name: "Yes, delete permanently", exact: true }).click();
    await expect(page.getByText("This kind of answer doesn't change the match yet.", { exact: true })).toHaveCount(0);
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/experience");
    if (await experience.count()) await confirmAction(experience.getByRole("button", { name: /^Remove / }));
  }
});
