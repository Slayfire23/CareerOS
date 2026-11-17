import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { confirmAction, expectReviewMode, openPage } from "./support";

// CareerOS V1: the whole rules-first, human-reviewed workflow in the browser. Review mode (the V1 workflow, D3; run against
// a server with CLARIFICATION_REVIEW_ENABLED, e.g. careeros-review-3100, with E2E_REVIEW=true). Rules only; no AI service;
// fictional data. Answers count toward the daily answer limits: this spec uses four.
test("V1: posting → automatic rules analysis → review, correct, reject, deny, skip → approve → stale → recalculate → approve again", async ({ page }) => {
  test.setTimeout(300000);
  test.skip(process.env.E2E_REVIEW !== "true", "Needs a server with the review on (E2E_REVIEW=true).");
  const env = parse(readFileSync(".env.playwright.local"));
  const tag = randomUUID().slice(0, 8);
  const company = `V1 test ${tag}`;
  const quux = `Quuxflow${tag} administration`, zorvex = `Zorvex${tag} operation`, kestrel = `Kestrel${tag} operation`, plinth = `Plinth${tag} administration`;
  const findingFor = (p: Page, text: string) => p.getByRole("listitem").filter({ has: p.getByRole("heading", { name: text, level: 3 }) });
  const decisionOf = (text: string) => findingFor(page, text).locator("p", { hasText: "Your decision:" });

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
    await addRole.getByLabel("Currently working here", { exact: true }).check();
    await addRole.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(addRole.getByRole("status")).toHaveText("Experience saved.");

    // 1–3. Add the posting, review the extracted requirements: the rules-based analysis runs on its own.
    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Coordinator");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill(`About the role\nWe run a busy office.\nRequirements:\n- ${quux}\n- ${zorvex}\n- ${kestrel}\n- ${plinth}`);
    await add.getByRole("button", { name: "Save job", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Job saved.");
    await page.getByRole("listitem").filter({ hasText: company }).getByRole("link", { name: "Review requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    const requirementsUrl = page.url();
    await openPage(page, requirementsUrl);
    const review = page.getByRole("form", { name: "Review job requirements" });
    for (let i = 1; i <= 4; i++) await review.getByLabel(`Include requirement ${i}`, { exact: true }).check();
    await review.getByLabel("I reviewed the selected requirements against the job description.", { exact: true }).check();
    await review.getByRole("button", { name: "Save reviewed requirements", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Reviewed requirements saved. The rules-based analysis ran");

    // 4. One review page: every requirement, its rules-based verdict and status, without clicking Run.
    const matchUrl = requirementsUrl.replace(/\/requirements$/, "/match");
    await openPage(page, matchUrl);
    await expectReviewMode(page, true);
    const latest = page.getByRole("region", { name: "Latest analysis" });
    await expect(latest.getByText(/Rules engine \(rules-v21a\)/)).toBeVisible();
    await expect(page.getByText("using deterministic rules. No AI provider is used", { exact: false })).toBeVisible();
    for (const r of [quux, zorvex, kestrel, plinth]) {
      await expect(findingFor(page, r).getByText("Not enough information", { exact: true })).toBeVisible();
      await expect(decisionOf(r)).toContainText("Not decided yet");
    }
    const approval = page.getByRole("form", { name: "Approve this assessment" });
    await expect(page.getByText("0 of 4 requirements decided.", { exact: false })).toBeVisible();
    await expect(approval.getByRole("button", { name: "Approve this assessment" })).toBeDisabled();
    await expect(approval.getByRole("note")).toContainText("Decide every requirement first");

    // 5–6. Add missing experience (the rules re-read it), then correct it.
    const section = page.getByRole("region", { name: "What CareerOS couldn't establish" });
    const question = (text: string) => section.getByRole("listitem", { name: /^Question/ }).filter({ hasText: text });
    await question(quux).getByRole("button", { name: "Yes, add details", exact: true }).click();
    const form = question(quux).getByRole("form", { name: "Your answer" });
    await form.getByLabel("Which role?", { exact: true }).selectOption({ label: `Office Assistant, ${company}` });
    await form.getByLabel("What did you do?", { exact: true }).fill(`Administered Quuxflow${tag} for 80 sales staff across three offices, including weekly imports.`);
    await form.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(section.getByText(new RegExp(`${quux}: Not enough information → Supported — Self-reported`))).toBeVisible();
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: new RegExp(`^Edit answer about ${quux}`) }).click();
    const edit = page.getByRole("form", { name: `Edit answer about ${quux}` });
    await edit.getByLabel("Your answer", { exact: true }).fill(`Administered Quuxflow${tag} for 120 sales staff across four offices, including weekly imports.`);
    await edit.getByRole("button", { name: "Save correction", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await openPage(page, matchUrl);
    await expect(findingFor(page, quux).getByText("Supported — Self-reported", { exact: true })).toBeVisible();
    await expect(findingFor(page, quux).getByText("for 120 sales staff across four offices", { exact: false })).toBeVisible();
    await expect(decisionOf(quux)).toContainText("Experience added");

    // Deny one, skip one.
    await question(zorvex).getByRole("button", { name: "No, I don't have this", exact: true }).click();
    await expect(findingFor(page, zorvex).getByText("Not supported — Self-reported", { exact: true })).toBeVisible();
    await openPage(page, matchUrl);
    await question(kestrel).getByRole("button", { name: "Skip for now", exact: true }).click();
    await openPage(page, matchUrl);
    await expect(decisionOf(zorvex)).toContainText("You said you don't have this");
    await expect(decisionOf(kestrel)).toContainText("Skipped");

    // Reject the credited result (not claimed), confirm the last. Neither changes a result.
    await findingFor(page, quux).getByRole("button", { name: /^Disagree/ }).click();
    await expect(findingFor(page, quux).getByRole("status")).toHaveText("Feedback saved.");
    await openPage(page, matchUrl);
    await findingFor(page, plinth).getByRole("button", { name: /^Agree/ }).click();
    await expect(findingFor(page, plinth).getByRole("status")).toHaveText("Feedback saved.");
    await openPage(page, matchUrl);
    await expect(decisionOf(quux)).toContainText("Not claimed");
    await expect(decisionOf(plinth)).toContainText("Confirmed");
    await expect(findingFor(page, quux).getByText("Supported — Self-reported", { exact: true })).toBeVisible();
    await expect(findingFor(page, plinth).getByText("Not enough information", { exact: true })).toBeVisible();

    // 7–8. Final approval, saved with its snapshot.
    await expect(page.getByText("4 of 4 requirements decided.", { exact: false })).toBeVisible();
    await approval.getByLabel("Note for your records (optional)").fill("Reviewed before applying.");
    await approval.getByRole("button", { name: "Approve this assessment" }).click();
    await expect(approval.getByRole("status")).toHaveText("Assessment approved and saved (version 1).");
    await openPage(page, matchUrl);
    const approved = page.getByRole("heading", { name: "Approved assessments" }).locator("..");
    await expect(approved.getByText(/^Version 1/)).toBeVisible();
    await expect(approved.getByText("Note: Reviewed before applying.")).toBeVisible();
    await approved.locator("summary", { hasText: "What was approved" }).first().click();
    await expect(approved.getByText(new RegExp(`${quux}: CareerOS supported — self-reported; your decision: not claimed: you said this isn't yours; recorded: Not claimed\\.`))).toBeVisible();
    await expect(approved.getByText(new RegExp(`${plinth}: CareerOS not enough information; your decision: confirmed; recorded: Not enough information\\.`))).toBeVisible();

    // Stale: a profile change blocks approval until the analysis runs again.
    await openPage(page, "/dashboard/experience");
    await page.locator("summary", { hasText: "Add experience" }).click();
    const second = page.getByRole("form", { name: "Add professional experience", exact: true });
    await second.getByLabel("Job title", { exact: true }).fill("Receptionist");
    await second.getByLabel("Company", { exact: true }).fill(company);
    await second.getByLabel("Start month", { exact: true }).fill("2018-01");
    await second.getByLabel("End month", { exact: true }).fill("2019-12");
    await second.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(second.getByRole("status")).toHaveText("Experience saved.");
    await openPage(page, matchUrl);
    await expect(page.getByRole("status").filter({ hasText: "This analysis is out of date" })).toBeVisible();
    await expect(approval.getByRole("button", { name: "Approve this assessment" })).toBeDisabled();
    await expect(approval.getByRole("note")).toContainText("out of date");

    // Recalculate: unchanged results keep their decisions; approve again as version 2. Version 1 stays.
    await page.getByRole("button", { name: /^Run analysis/ }).first().click();
    await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
    await openPage(page, matchUrl);
    await expect(page.getByRole("status").filter({ hasText: "This analysis is out of date" })).toHaveCount(0);
    await expect(page.getByText("4 of 4 requirements decided.", { exact: false })).toBeVisible();
    await approval.getByRole("button", { name: "Approve this assessment" }).click();
    await expect(approval.getByRole("status")).toHaveText("Assessment approved and saved (version 2).");
    await openPage(page, matchUrl);
    await expect(approved.getByText(/^Version 2/)).toBeVisible();
    await expect(approved.getByText(/^Version 1/)).toBeVisible();

    // 375 px: no sideways scroll on the review page.
    await page.setViewportSize({ width: 375, height: 800 });
    await openPage(page, matchUrl);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.setViewportSize({ width: 1280, height: 800 });
  } finally {
    await openPage(page, "/dashboard/jobs");
    const jobRow = page.getByRole("listitem").filter({ hasText: company });
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/experience");
    for (let i = 0; i < 2; i++) {
      const role = page.getByRole("region", { name: "Professional experience", exact: true }).getByRole("listitem").filter({ hasText: company }).first();
      if (await role.count()) await confirmAction(role.getByRole("button", { name: /^Remove / }));
      await openPage(page, "/dashboard/experience");
    }
  }
});
