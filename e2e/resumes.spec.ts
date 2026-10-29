import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {parse} from "dotenv";
import {createClient} from "@supabase/supabase-js";
import {test,expect} from "@playwright/test";
import {RESUME_BUCKET} from "../src/lib/resume-files";

test("private resumes preserve uploads and deny cross-account storage/download access",async({page,browser,baseURL})=>{
 test.setTimeout(180000);
 const credentials=parse(readFileSync(".env.playwright.local"));const config=parse(readFileSync(".env"));
 const url=config.NEXT_PUBLIC_SUPABASE_URL, key=config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key||!credentials.E2E_TEST_EMAIL||!credentials.E2E_TEST_PASSWORD||!credentials.E2E_TEST_EMAIL_B||!credentials.E2E_TEST_PASSWORD_B||credentials.E2E_TEST_EMAIL===credentials.E2E_TEST_EMAIL_B)throw new Error("Two distinct test accounts and Supabase configuration required.");
 const clientA=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const clientB=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const a=await clientA.auth.signInWithPassword({email:credentials.E2E_TEST_EMAIL,password:credentials.E2E_TEST_PASSWORD});
 const b=await clientB.auth.signInWithPassword({email:credentials.E2E_TEST_EMAIL_B,password:credentials.E2E_TEST_PASSWORD_B});
 if(a.error||b.error||!a.data.user||!b.data.user)throw new Error("Disposable account authentication failed.");
 const owner=a.data.user.id;const name="resume_test_"+randomUUID().replaceAll("-","")+".pdf";
 const pdf=Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
 const contextB=await browser.newContext({baseURL,storageState:{cookies:[],origins:[]}});const pageB=await contextB.newPage();
 const rows=()=>page.getByRole("region",{name:"Private resumes",exact:true}).getByRole("listitem").filter({hasText:name});
 const uploaded:string[]=[];
 try{
  for(const [p,email,password] of [[page,credentials.E2E_TEST_EMAIL,credentials.E2E_TEST_PASSWORD],[pageB,credentials.E2E_TEST_EMAIL_B,credentials.E2E_TEST_PASSWORD_B]] as const){await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(email);await p.getByLabel("Password",{exact:true}).fill(password);await p.getByRole("button",{name:"Sign in",exact:true}).click();await expect(p).toHaveURL(/\/dashboard\/?$/);}
  for(let i=0;i<2;i++){await page.getByLabel("PDF resume",{exact:true}).setInputFiles({name,mimeType:"application/pdf",buffer:pdf});await page.getByRole("button",{name:"Upload resume",exact:true}).click();await expect(page.getByRole("form",{name:"Upload resume",exact:true}).getByRole("status")).toHaveText("Resume uploaded as a new version.");await page.reload();await expect(rows()).toHaveCount(i+1);}
  for(const link of await rows().getByRole("link",{name:/^Download /}).all()){const href=(await link.getAttribute("href"))!;uploaded.push(decodeURIComponent(href.split("/").pop()!));const response=await page.request.get(href);expect(response.status()).toBe(200);expect(await response.body()).toEqual(pdf);expect(response.headers()["cache-control"]).toContain("no-store");expect((await pageB.request.get(href)).status()).toBe(404);}
  await pageB.reload();await expect(pageB.getByRole("region",{name:"Private resumes",exact:true}).getByText(name,{exact:true})).toHaveCount(0);
  const objectPath=owner+"/"+uploaded[0];
  expect((await clientB.storage.from(RESUME_BUCKET).download(objectPath)).error).toBeTruthy();
  const deniedList=await clientB.storage.from(RESUME_BUCKET).list(owner);expect(deniedList.data??[]).toEqual([]);
  await clientB.storage.from(RESUME_BUCKET).remove([objectPath]);
  expect((await clientA.storage.from(RESUME_BUCKET).download(objectPath)).error).toBeNull();
  expect((await clientA.storage.from(RESUME_BUCKET).upload(objectPath,pdf,{contentType:"application/pdf",upsert:true})).error).toBeTruthy();
  const publicUrl=clientA.storage.from(RESUME_BUCKET).getPublicUrl(objectPath).data.publicUrl;expect((await page.request.get(publicUrl)).ok()).toBe(false);
  const anon=await browser.newContext({baseURL});try{expect((await anon.request.get("/api/resumes/"+uploaded[0])).status()).toBe(401);}finally{await anon.close();}
  await rows().first().getByRole("button",{name:"Delete "+name,exact:true}).click();await expect(rows()).toHaveCount(1);await page.reload();await expect(rows()).toHaveCount(1);
 }finally{ // Storage search is a name-prefix match and stored names start with a UUID, so list the folder and filter.
  try{const {data,error}=await clientA.storage.from(RESUME_BUCKET).list(owner,{limit:1000});if(error)throw new Error("Resume fixture cleanup listing failed. Check storage setup.");const paths=(data??[]).filter(f=>f.name.endsWith("_"+name)).map(f=>owner+"/"+f.name);if(paths.length){const result=await clientA.storage.from(RESUME_BUCKET).remove(paths);if(result.error)throw new Error("Resume fixture cleanup failed.");}}finally{await contextB.close();await clientA.auth.signOut({scope:"local"});await clientB.auth.signOut({scope:"local"});}
 }
});
