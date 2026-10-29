import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";

test("job requirements require review, persist corrections, flag changed descriptions and stay private", async ({page, browser, baseURL}) => {
 test.setTimeout(180000);
 const env=parse(readFileSync(".env.playwright.local"));
 if(!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD || !env.E2E_TEST_EMAIL_B || !env.E2E_TEST_PASSWORD_B) throw new Error("Two disposable accounts required.");
 const contextB=await browser.newContext({baseURL,storageState:{cookies:[],origins:[]}});
 const pageB=await contextB.newPage();
 const company=`Review test ${randomUUID()}`;
 const row=page.getByRole("listitem").filter({hasText:company});
 let saved=false;
 try {
  for(const [p,email,password] of [[page,env.E2E_TEST_EMAIL,env.E2E_TEST_PASSWORD],[pageB,env.E2E_TEST_EMAIL_B,env.E2E_TEST_PASSWORD_B]] as const){
   await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(email);await p.getByLabel("Password",{exact:true}).fill(password);
   await p.getByRole("button",{name:"Sign in",exact:true}).click();await expect(p).toHaveURL(/\/dashboard\/?$/);
  }
  await page.goto("/dashboard/jobs"); await page.waitForLoadState("networkidle");
  const add=page.getByRole("form",{name:"Add job",exact:true});
  await add.getByLabel("Job title",{exact:true}).fill("Engineer");await add.getByLabel("Company",{exact:true}).fill(company);
  await add.getByLabel("Job description",{exact:true}).fill("Requirements:\n- 3 years experience\nPreferred:\n- Knowledge of CAD");
  saved=true;await add.getByRole("button",{name:"Save job",exact:true}).click();await expect(add.getByRole("status")).toHaveText("Job saved.");
  await row.getByRole("link",{name:"Review requirements"}).click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+\/requirements$/);
  await expect(page.getByRole("heading",{name:"Review job requirements"})).toBeVisible();
  const url=page.url();
  await pageB.goto(url);await expect(pageB.getByRole("heading",{name:"404"})).toBeVisible();
  const review=page.getByRole("form",{name:"Review job requirements"});
  await expect(review.getByLabel("Include requirement 1",{exact:true})).not.toBeChecked();
  await expect(review.getByLabel("Include requirement 2",{exact:true})).not.toBeChecked();
  await review.getByLabel("Include requirement 1",{exact:true}).check();
  await review.getByLabel("Requirement 1",{exact:true}).fill("Three years of relevant professional experience");
  await review.getByRole("button",{name:"Add requirement",exact:true}).click();
  await review.getByLabel("Requirement 3",{exact:true}).fill("Discuss equivalent experience with employer");
  await review.getByLabel("I reviewed the selected requirements against the job description.",{exact:true}).check();
  await review.getByRole("button",{name:"Save reviewed requirements",exact:true}).click();
  await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");
  await page.reload();
  await expect(review.getByLabel("Requirement 1",{exact:true})).toHaveValue("Three years of relevant professional experience");
  await expect(review.getByLabel("Requirement 2",{exact:true})).toHaveValue("Discuss equivalent experience with employer");
  await expect(review.getByLabel("Requirement 3",{exact:true})).toHaveCount(0);
  await page.goto("/dashboard/jobs"); await page.waitForLoadState("networkidle");await row.getByText("Edit job",{exact:true}).click();
  const edit=row.getByRole("form",{name:`Edit job at ${company}`,exact:true});
  await edit.getByLabel("Job description",{exact:true}).fill("Requirements:\n- 5 years experience");
  await edit.getByRole("button",{name:"Save job",exact:true}).click();
  await row.getByText("View description",{exact:true}).click();
  await expect(row.locator("p").filter({hasText:"5 years experience"})).toBeVisible();
  await page.goto(url);await expect(page.getByText(/earlier review is out of date/)).toBeVisible();
  await expect(review.getByLabel("Include requirement 1",{exact:true})).not.toBeChecked();
  await review.getByLabel("I reviewed the selected requirements against the job description.",{exact:true}).check();
  await review.getByRole("button",{name:"Save reviewed requirements",exact:true}).click();
  await expect(review.getByRole("status")).toContainText("Reviewed requirements saved.");
  await page.reload();await expect(review.getByText("No requirements listed. Add one manually using the description above.")).toBeVisible();
  await pageB.context().clearCookies();await pageB.goto(url);await expect(pageB).toHaveURL(/\/login\/?$/);
 } finally {
  try {if(saved){await page.goto("/dashboard/jobs"); await page.waitForLoadState("networkidle");if(await row.count()){await row.getByRole("button",{name:/^Remove /}).click();await expect(row).toHaveCount(0);}}}
  finally {await contextB.close();}
 }
});
