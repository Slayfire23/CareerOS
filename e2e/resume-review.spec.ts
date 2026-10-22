import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {parse} from "dotenv";
import {createClient} from "@supabase/supabase-js";
import {expect,test,type Page} from "@playwright/test";
import {resumePdf} from "../tests/support/resume-pdf";
import {RESUME_BUCKET} from "../src/lib/resume-files";

test("resume suggestions require review, preserve existing fields and reject foreign extraction",async({page,browser,baseURL})=>{
 test.setTimeout(180000);
 const env=parse(readFileSync(".env.playwright.local"));const config=parse(readFileSync(".env"));
 if(!env.E2E_TEST_EMAIL||!env.E2E_TEST_PASSWORD||!env.E2E_TEST_EMAIL_B||!env.E2E_TEST_PASSWORD_B||!config.NEXT_PUBLIC_SUPABASE_URL||!config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)throw new Error("Test credentials/configuration required.");
 const storage=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await storage.auth.signInWithPassword({email:env.E2E_TEST_EMAIL,password:env.E2E_TEST_PASSWORD});if(auth.error||!auth.data.user)throw new Error("Test authentication failed.");
 const token=randomUUID().replaceAll("-","");const skill="ReviewSkill"+token;const name="review_"+token+".pdf";
 const contextB=await browser.newContext({baseURL,storageState:{cookies:[],origins:[]}});const pageB=await contextB.newPage();let key="";
 async function login(p:Page,email:string,password:string){await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(email);await p.getByLabel("Password",{exact:true}).fill(password);await p.getByRole("button",{name:"Sign in",exact:true}).click();await expect(p).toHaveURL(/\/dashboard\/?$/);}
 try{
  await login(page,env.E2E_TEST_EMAIL,env.E2E_TEST_PASSWORD);await login(pageB,env.E2E_TEST_EMAIL_B,env.E2E_TEST_PASSWORD_B);
  const original=await page.getByLabel("Display name",{exact:true}).inputValue();const headline=await page.getByLabel("Headline (optional)",{exact:true}).inputValue();
  await page.getByLabel("PDF resume",{exact:true}).setInputFiles({name,mimeType:"application/pdf",buffer:resumePdf(["Alex Example","Mechanical Engineer","Skills",skill,"Education","Example University"])});
  await page.getByRole("button",{name:"Upload resume",exact:true}).click();await expect(page.getByRole("form",{name:"Upload resume",exact:true}).getByRole("status")).toBeVisible();await page.reload();
  const link=page.getByRole("link",{name:"Review suggestions from "+name,exact:true});const href=(await link.getAttribute("href"))!;key=decodeURIComponent(href.split("/").pop()!);
  await pageB.goto(href);await pageB.getByRole("button",{name:"Read resume",exact:true}).click();await expect(pageB.getByRole("alert").filter({hasText:"Resume unavailable"})).toBeVisible();
  await link.click();await page.getByRole("button",{name:"Read resume",exact:true}).click();const form=page.getByRole("form",{name:"Apply reviewed resume fields",exact:true});await expect(form).toBeVisible();
  await expect(form.getByLabel("Suggested name",{exact:true})).toHaveValue("Alex Example");await expect(form.getByLabel("Suggested skills",{exact:true})).toHaveValue(skill);for(const box of await form.getByRole("checkbox").all())await expect(box).not.toBeChecked();
  await form.getByRole("button",{name:"Save selected fields",exact:true}).click();await expect(form.getByRole("alert")).toContainText("Select at least one");
  await form.getByLabel("Add reviewed skills",{exact:true}).check();await form.getByRole("button",{name:"Save selected fields",exact:true}).click();await expect(form.getByRole("status")).toContainText("Selected fields saved");
  await page.goto("/dashboard");await expect(page.getByLabel("Display name",{exact:true})).toHaveValue(original);await expect(page.getByLabel("Headline (optional)",{exact:true})).toHaveValue(headline);
  const skills=page.getByRole("region",{name:"Technical skills",exact:true});await expect(skills.getByRole("listitem").filter({hasText:skill})).toHaveCount(1);
  await pageB.goto("/dashboard");await expect(pageB.getByRole("region",{name:"Technical skills",exact:true}).getByText(skill,{exact:true})).toHaveCount(0);
 }finally{
  try{await page.goto("/dashboard");const row=page.getByRole("region",{name:"Technical skills",exact:true}).getByRole("listitem").filter({hasText:skill});if(await row.count()){await row.getByRole("button",{name:"Remove "+skill,exact:true}).click();await expect(row).toHaveCount(0);}
   if(key){const result=await storage.storage.from(RESUME_BUCKET).remove([auth.data.user.id+"/"+key]);if(result.error)throw new Error("Test resume cleanup failed.");}
   else{const listing=await storage.storage.from(RESUME_BUCKET).list(auth.data.user.id,{search:name,limit:100});if(listing.error)throw new Error("Test resume cleanup listing failed.");const paths=(listing.data??[]).filter(f=>f.name.endsWith("_"+name)).map(f=>auth.data.user!.id+"/"+f.name);if(paths.length){const result=await storage.storage.from(RESUME_BUCKET).remove(paths);if(result.error)throw new Error("Test resume cleanup failed.");}}
  }finally{await contextB.close();await storage.auth.signOut({scope:"local"});}
 }
});
