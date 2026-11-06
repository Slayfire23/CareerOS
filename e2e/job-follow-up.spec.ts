import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { confirmAction, openPage } from "./support";

// The follow-up workflow in the browser, with a stand-in for the local model on the address the app uses,
// so the result doesn't depend on the model's mood. Runs only with the review and the workflow turned on.
const env = parse(readFileSync(".env"));
const enabled = env.CLARIFICATION_REVIEW_ENABLED === "true" && env.FOLLOW_UP_WORKFLOW_ENABLED === "true";
let stub: Server | null = null;

test.beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(env.INTERPRETATION_SHADOW_URL ?? "http://127.0.0.1:11434");
  stub = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const sent = JSON.parse(body) as { messages: { content: string }[] };
      const { answer } = JSON.parse(sent.messages[1].content) as { answer: string };
      const action = answer.match(/\bI ([a-z]+ and [a-z]+|[a-z]+)/)?.[1] ?? "";
      const content = JSON.stringify({ link: "same_work", facts: [{ action, object: "", tools: [], date: "", actor: "self", actor_span: "I", status: "done", status_span: "", about_requirement: "yes" }] });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: { content }, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }));
    });
  });
  await new Promise<void>(resolve => stub!.listen(Number(url.port), url.hostname, resolve));
});
test.afterAll(async () => { await new Promise(resolve => (stub ? stub.close(resolve) : resolve(null))); });

test("follow-up: a question from an answer, a yes refused, a specific reply at Possible, then revoke and delete", async ({ page }) => {
  test.setTimeout(180000);
  test.skip(!enabled, "The follow-up workflow is off (the default).");
  const accounts = parse(readFileSync(".env.playwright.local"));
  const company = `Follow-up test ${randomUUID().slice(0, 8)}`;
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
    await addRole.getByLabel("Job title", { exact: true }).fill("Maintenance Helper");
    await addRole.getByLabel("Company", { exact: true }).fill(company);
    await addRole.getByLabel("Start month", { exact: true }).fill("2020-01");
    await addRole.getByLabel("End month", { exact: true }).fill("2024-02");
    await addRole.getByRole("button", { name: "Save experience", exact: true }).click();
    await expect(addRole.getByRole("status")).toHaveText("Experience saved.");

    await openPage(page, "/dashboard/jobs");
    const add = page.getByRole("form", { name: "Add job", exact: true });
    await add.getByLabel("Job title", { exact: true }).fill("Plumber");
    await add.getByLabel("Company", { exact: true }).fill(company);
    await add.getByLabel("Job description", { exact: true }).fill("Requirements:\n- Soldering copper pipe");
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

    // An answer in the person's own trade words, which the rules alone can't connect.
    const question = page.getByRole("listitem", { name: /^Question/ }).filter({ hasText: "Soldering copper pipe" });
    await question.getByRole("button", { name: "Yes, add details", exact: true }).click();
    const form = question.getByRole("form", { name: "Your answer" });
    await form.getByLabel("Which role?", { exact: true }).selectOption({ label: `Maintenance Helper, ${company}` });
    await form.getByLabel("What did you do?", { exact: true }).fill("I flux and sweat half-inch joints on the bathroom supply lines every week.");
    await form.getByRole("button", { name: "Save and check again", exact: true }).click();
    // Answered, so the question goes, and its message with it.
    await expect(question).toHaveCount(0);

    await openPage(page, matchUrl);
    const finding = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Soldering copper pipe", level: 3 }) });
    await expect(finding.getByText("Not enough information", { exact: true })).toBeVisible();
    const card = page.getByRole("listitem", { name: "Follow-up about Soldering copper pipe" });
    await expect(card.getByText(/You said “I flux and sweat half-inch joints/)).toBeVisible();
    await expect(card.getByText(/What, if anything, in that work involved “Soldering copper pipe”/)).toBeVisible();
    await expect(card.getByText("Its suggestion doesn't change any result.", { exact: false })).toBeVisible();

    // A bare yes is turned away, and keeps what was typed.
    await card.getByRole("button", { name: "Answer", exact: true }).click();
    const replyForm = card.getByRole("form", { name: "Your reply" });
    await replyForm.getByLabel("What did you personally do?").fill("Yes.");
    await replyForm.getByRole("button", { name: "Save and check again", exact: true }).click();
    await expect(replyForm.getByRole("alert")).toContainText("A yes alone can't be used.");
    await expect(replyForm.getByLabel("What did you personally do?")).toHaveValue("Yes.");

    await replyForm.getByLabel("What did you personally do?").fill("I cut the copper, clean each fitting with emery cloth, heat it with a propane torch, and feed in lead-free wire until the seam fills.");
    await replyForm.getByRole("button", { name: "Save and check again", exact: true }).click();
    // Answered, so it moves to the replies, which say why it counts.
    await expect(card).toHaveCount(0);

    await openPage(page, matchUrl);
    await expect(page.getByText("This counts toward Possible — Self-reported.", { exact: false })).toBeVisible();
    await expect(finding.getByText("Possible — Self-reported", { exact: true })).toBeVisible();
    await expect(finding.getByText("reading your reply to a follow-up question", { exact: false })).toBeVisible();
    await expect(page.getByText(/Soldering copper pipe: Not enough information → Possible/)).toBeVisible();
    await expect(finding.getByText("Supported", { exact: true })).toHaveCount(0);

    // Revoking stops it counting at once; deleting removes the words, and the question doesn't come back.
    await page.getByRole("button", { name: /^Revoke reply about Soldering copper pipe/ }).click();
    await openPage(page, matchUrl);
    await expect(finding.getByText("Not enough information", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Delete permanently reply about Soldering copper pipe/ }).click();
    await page.getByRole("button", { name: "Yes, delete this reply", exact: true }).click();
    await openPage(page, matchUrl);
    await expect(page.getByText("emery cloth", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: "Follow-up about Soldering copper pipe" })).toHaveCount(0);
  } finally {
    await openPage(page, "/dashboard/jobs");
    if (await jobRow.count()) await confirmAction(jobRow.getByRole("button", { name: /^Remove / }));
    await openPage(page, "/dashboard/experience");
    if (await experience.count()) await confirmAction(experience.getByRole("button", { name: /^Remove / }));
  }
});
