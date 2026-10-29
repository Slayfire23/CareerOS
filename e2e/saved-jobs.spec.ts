import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { expect, test } from "@playwright/test";
import { openPage } from "./support";

test("saved jobs persist, edit, delete, and stay private between accounts", async ({page, browser, baseURL}) => {
 test.setTimeout(180000);
 const env=parse(readFileSync(".env.playwright.local"));
 if(!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD || !env.E2E_TEST_EMAIL_B || !env.E2E_TEST_PASSWORD_B) throw new Error("Two disposable accounts required.");
 const contextB=await browser.newContext({baseURL,storageState:{cookies:[],origins:[]}});
 const pageB=await contextB.newPage();
 const company=`Job test ${randomUUID()}`;
 const row=page.getByRole("listitem").filter({hasText:company});
 try {
  for(const [p,email,password] of [[page,env.E2E_TEST_EMAIL,env.E2E_TEST_PASSWORD],[pageB,env.E2E_TEST_EMAIL_B,env.E2E_TEST_PASSWORD_B]] as const){
   await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(email);await p.getByLabel("Password",{exact:true}).fill(password);
   await p.getByRole("button",{name:"Sign in",exact:true}).click();await expect(p).toHaveURL(/\/dashboard\/?$/);
   await p.getByRole("link",{name:"View saved jobs"}).click();await expect(p).toHaveURL(/\/jobs\/?$/);
  }
  const form=page.getByRole("form",{name:"Add job",exact:true});
  await form.getByLabel("Job title",{exact:true}).fill("Engineer");
  await form.getByLabel("Company",{exact:true}).fill(company);
  await form.getByLabel("Posting link (optional)",{exact:true}).fill("https://example.com/job");
  await form.getByLabel("Job description",{exact:true}).fill("Original requirements");
  await form.getByRole("button",{name:"Save job",exact:true}).click();await expect(form.getByRole("status")).toHaveText("Job saved.");
  await page.reload();await expect(row).toHaveCount(1);
  await row.getByText("View description",{exact:true}).click();await expect(row).toContainText("Original requirements");
  await pageB.reload();await expect(pageB.getByRole("listitem").filter({hasText:company})).toHaveCount(0);
  await row.getByText("Edit job",{exact:true}).click();
  const edit=row.getByRole("form",{name:`Edit job at ${company}`,exact:true});
  await edit.getByLabel("Job description",{exact:true}).fill("Updated requirements");
  await edit.getByLabel("Posting link (optional)",{exact:true}).fill("");
  await edit.getByRole("button",{name:"Save job",exact:true}).click();
  await expect(row.getByRole("link",{name:"Open posting"})).toHaveCount(0);
  await page.reload();await row.getByText("View description",{exact:true}).click();await expect(row).toContainText("Updated requirements");
  await row.getByRole("button",{name:/^Remove /}).click();await expect(row).toHaveCount(0);
  await page.reload();await expect(row).toHaveCount(0);
  await page.context().clearCookies();await openPage(page, "/dashboard/jobs");await expect(page).toHaveURL(/\/login\/?$/);
 } finally {
  try {
   await openPage(page, "/dashboard/jobs");
   if(await row.count()) {await row.getByRole("button",{name:/^Remove /}).click();await expect(row).toHaveCount(0);}
  } finally {await contextB.close();}
 }
});
