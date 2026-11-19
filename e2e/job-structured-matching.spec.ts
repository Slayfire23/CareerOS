import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// Phase 5.3 Stage F5: the match page with structured matching on (STRUCTURED_MATCHING_ENABLED, which needs the structured
// form and the review). Rules only; local resources; fictional data. Skips unless the running server has all three flags
// (for example the local launch entry `careeros-matching-3100`) and E2E_STRUCTURED_MATCHING=true is set for this run.
test("structured matching: a described answer's words, a choice shown as a choice, plain wording, revocation, keyboard, 375 px, dark mode", async ({ page }) => {
  test.setTimeout(300000);
  test.skip(process.env.E2E_STRUCTURED_MATCHING !== "true", "Structured matching is off (the default).");
  const accounts = parse(readFileSync(".env.playwright.local"));
  const tag = randomUUID().slice(0, 8);
  const company = `Matching test ${tag}`;
  const plumbing = "Install and repair residential plumbing"; // an approved split
  const hvac = "Repairing commercial HVAC systems"; // asked whole
  const jobRow = page.getByRole("listitem").filter({ hasText: company });
  const experience = page.getByRole("region", { name: "Professional experience", exact: true }).getByRole("listitem").filter({ hasText: company });
  const findingFor = (p: Page, text: string) => p.getByRole("listitem").filter({ has: p.getByRole("heading", { name: text, level: 3 }) });

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
    await addRole.getByLabel("Currently working here", { exact: true }).check();
    await addRole.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(addRole.getByRole("status")).toHaveText("Experience saved.");

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Technician");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill(`Requirements:\n- ${plumbing}\n- ${hvac}`);
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
    const runAnalysis = async () => {
      await openPage(page, matchUrl);
      await page.getByRole("button", { name: /^Run analysis/ }).first().click();
      await expect(page.getByRole("form", { name: "Run requirement analysis" }).getByRole("status")).toHaveText("Analysis complete.");
      await openPage(page, matchUrl);
    };
    await runAnalysis();
    for (const r of [plumbing, hvac]) await expect(findingFor(page, r).getByText("Not enough information", { exact: true })).toBeVisible();

    const section = page.getByRole("region", { name: "What CareerOS couldn't establish" });
    const answer = async (requirement: string, fill: (form: ReturnType<Page["getByRole"]>) => Promise<void>) => {
      const card = section.getByRole("listitem", { name: /^Question/ }).filter({ hasText: requirement });
      await card.getByRole("button", { name: "Yes, add details", exact: true }).click();
      const form = card.getByRole("form", { name: "Your part" });
      // The plain wording says the answer can count after a re-run, never that it will.
      // Mode check: the server has structured matching on (the form says answers can count).
      await expect(form, "The server has the structured form OFF, but this run declared structured matching on.").toHaveCount(1);
      await expect(form.getByText(/It can count toward the match when you run the analysis again, depending on what you describe\./), "The server has structured matching OFF, but this run declared it on (E2E_STRUCTURED_MATCHING).").toBeVisible();
      await expect(form).not.toContainText(/will (improve|raise|change) |guarantee|verified(?! it)/i);
      const choice = form.getByRole("group", { name: /What was your part\?/ });
      await choice.getByRole("radio", { name: "I did this work myself", exact: true }).focus();
      await page.keyboard.press("Space");
      await form.getByLabel("Which role?", { exact: true }).selectOption({ label: `Maintenance Technician, ${company}` });
      await form.getByRole("group", { name: /How often/ }).getByRole("radio", { name: "Weekly", exact: true }).check();
      await form.getByRole("group", { name: /Most recently/ }).getByRole("radio", { name: "It's part of my job now", exact: true }).check();
      await fill(form);
      await form.getByRole("button", { name: "Save my answer", exact: true }).click();
      // Saved: the question leaves the list, as for any answer.
      await expect(section.getByRole("listitem", { name: /^Question/ }).filter({ hasText: requirement })).toHaveCount(0);
    };
    // The split, described in the person's own words: every part ticked.
    await answer(plumbing, async form => {
      const parts = form.getByRole("group", { name: /Which of these did you do yourself\?/ });
      await parts.getByRole("checkbox", { name: "Installing residential plumbing", exact: true }).check();
      await parts.getByRole("checkbox", { name: "Repairing residential plumbing", exact: true }).check();
      await form.getByLabel("What did you do yourself? (optional)").fill("I install water heaters and repair leaking pipes in homes myself every week.");
    });
    // The whole requirement: the choice only, no description.
    await answer(hvac, async () => {});
    await openPage(page, matchUrl);
    await expect(section.getByText("It can count toward the match when you run the analysis again, depending on what you describe.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("This kind of answer doesn't change the match yet.", { exact: true })).toHaveCount(0);

    await runAnalysis();
    // Supported from the person's own words: the existing self-reported conventions.
    const described = findingFor(page, plumbing);
    await expect(described.getByText("Supported — Self-reported", { exact: true })).toBeVisible();
    await expect(described.getByText(/From an answer you gave\. Self-reported: CareerOS hasn't independently verified it\./)).toBeVisible();
    await expect(described.getByRole("link", { name: "Experience", exact: true })).toBeVisible();
    await expect(described.getByText("I install water heaters and repair leaking pipes in homes myself every week", { exact: true })).toBeVisible();
    // Possible from the choice alone: shown as the person's choice, in CareerOS's wording, never as profile evidence or words.
    const chosen = findingFor(page, hvac);
    await expect(chosen.getByText("Possible", { exact: true })).toBeVisible();
    await expect(chosen.getByText(/From a choice you made in a structured answer, not from your own description\. Self-reported: CareerOS hasn't independently verified it\./)).toBeVisible();
    await expect(chosen).not.toContainText("From your profile");
    await expect(chosen.getByText("Your choice", { exact: true })).toBeVisible();
    await expect(chosen.getByText(/^Structured answer, self-reported: CareerOS hasn't independently verified it\. Choice: I did this work myself\. How often: Weekly\. Most recently: It's part of my job now\.$/)).toBeVisible();
    await expect(chosen.getByRole("link")).toHaveCount(0);
    await expect(chosen.locator("q")).toHaveCount(0);
    await expect(chosen.getByText("A choice on its own counts as Possible at most", { exact: false })).toBeVisible();
    // Only the described answer is Supported; the choice never is.
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) }).filter({ hasText: "Supported — Self-reported" })).toHaveCount(1);
    await expect(chosen.getByText("Supported — Self-reported", { exact: true })).toHaveCount(0);

    // Keyboard: the evidence link is reachable and named; the summary counts match the findings.
    await described.getByRole("link", { name: "Experience", exact: true }).focus();
    await expect(described.getByRole("link", { name: "Experience", exact: true })).toBeFocused();

    // 375 px: no sideways scroll; dark mode: the citation and its label stay visible.
    await page.setViewportSize({ width: 375, height: 800 });
    await openPage(page, matchUrl);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await expect(findingFor(page, hvac).getByText("Your choice", { exact: true })).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(findingFor(page, hvac).getByText(/^Structured answer, self-reported/)).toBeVisible();
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Revoking the choice answer: its result stops counting at once (the review re-runs), and nothing breaks.
    await openPage(page, matchUrl);
    await page.getByRole("button", { name: `Revoke answer about ${hvac}` }).click();
    await expect(page.getByRole("status").filter({ hasText: /revoked/i }).first()).toBeVisible();
    await openPage(page, matchUrl);
    await expect(findingFor(page, hvac).getByText("Not enough information", { exact: true })).toBeVisible();
    await expect(findingFor(page, hvac).getByText("Your choice", { exact: true })).toHaveCount(0);
    await expect(findingFor(page, plumbing).getByText("Supported — Self-reported", { exact: true })).toBeVisible();

    // Permanent deletion, as for every answer.
    await page.getByRole("button", { name: `Delete permanently answer about ${plumbing}` }).click();
    await page.getByRole("button", { name: "Yes, delete permanently", exact: true }).click();
    // The answer is gone once its controls are (the confirm button replaces the first one, so wait on Revoke).
    await expect(page.getByRole("button", { name: `Revoke answer about ${plumbing}` })).toHaveCount(0);
    await openPage(page, matchUrl);
    await expect(page.getByText("I install water heaters and repair leaking pipes in homes myself every week", { exact: true })).toHaveCount(0);
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/experience");
    if (await experience.count()) await confirmAction(experience.getByRole("button", { name: /^Remove / }));
  }
});
