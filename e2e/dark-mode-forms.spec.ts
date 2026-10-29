import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, test, type Locator } from "@playwright/test";
import { openPage } from "./support";

test.use({ colorScheme: "dark" });
async function readable(control: Locator) {
 await expect(control).toHaveCSS("color-scheme", "dark");
 await expect(control).toHaveCSS("color", "rgb(237, 237, 237)");
 await expect(control).toHaveCSS("background-color", "rgb(23, 23, 23)");
 await control.focus();
 await expect(control).toHaveCSS("outline-style", "solid");
 await expect(control).toHaveCSS("outline-width", "2px");
}

test("dark forms retain readable native menus, months, focus and disabled states",async({page})=>{
 test.setTimeout(120000);
 const env=parse(readFileSync(".env.playwright.local"));
 if(!env.E2E_TEST_EMAIL||!env.E2E_TEST_PASSWORD)throw new Error("Disposable test credentials required.");
 await page.goto("/login");
 await readable(page.getByLabel("Email",{exact:true}));
 await readable(page.getByLabel("Password",{exact:true}));
 await page.getByLabel("Email",{exact:true}).fill(env.E2E_TEST_EMAIL);
 await page.getByLabel("Password",{exact:true}).fill(env.E2E_TEST_PASSWORD);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/?$/);
 // No saves: this check never changes account data. Each section now has its own page.
 for(const path of ["/dashboard/preferences","/dashboard/skills","/dashboard/profile"]){
  await openPage(page, path);
  for(const select of await page.locator("select:visible").all()){
    await readable(select);
    for(const option of await select.locator("option").all()) {
      await expect(option).toHaveCSS("background-color","rgb(23, 23, 23)");
      await expect(option).toHaveCSS("color","rgb(237, 237, 237)");
    }
    await select.selectOption({index:1});await readable(select);
  }
  for(const text of await page.locator('textarea:visible, input[type="number"]:visible').all())await readable(text);
 }
 const placeholderColor=await page.getByLabel("Headline (optional)",{exact:true}).evaluate(el=>getComputedStyle(el,"::placeholder").color);
 expect(placeholderColor).toBe("rgb(179, 179, 179)");
 for (const [path, label, formName] of [["/dashboard/projects", "Add project or accomplishment", "Add project or accomplishment"], ["/dashboard/education", "Add education", "Add education"], ["/dashboard/experience", "Add experience", "Add professional experience"]]) {
  await openPage(page, path);
  const form = page.getByRole("form", {name: formName, exact: true});
  await expect(form).toBeHidden();
  const toggle = page.getByText(label, {exact: true});
  await toggle.focus(); await page.keyboard.press("Enter");
  await expect(form).toBeVisible();
  await toggle.click(); await expect(form).toBeHidden();
  await toggle.click();
  if (formName === "Add project or accomplishment") continue;
  for(const label of ["Start month","End month"]){
   const month=form.getByLabel(label,{exact:true});
   await readable(month);await expect(month).toHaveValue("");
   expect(await month.evaluate(el=>getComputedStyle(el,"::-webkit-calendar-picker-indicator").opacity)).toBe("1");
   // Open the native calendar and select a month without typing into the input.
   const box=await month.boundingBox();if(!box)throw new Error("Month input not visible");
   await month.click({position:{x:box.width-18,y:box.height/2}});
   await page.keyboard.press("ArrowRight");
   await page.keyboard.press("Enter");
   await expect(month).toHaveValue(/^\d{4}-\d{2}$/);
   await page.keyboard.press("Escape");
   await month.fill("2024-06");await expect(month).toHaveValue("2024-06");await readable(month);
  }
  await form.getByRole("checkbox").check();
  const end=form.getByLabel("End month",{exact:true});
  await expect(end).toBeDisabled();await expect(end).toHaveCSS("opacity","1");
  await expect(end).toHaveCSS("color","rgb(179, 179, 179)");
  await expect(end).toHaveCSS("background-color","rgb(38, 38, 38)");
  await form.getByRole("checkbox").uncheck();await readable(end);
 }
 // Also exercise the pending fieldset state without sending a form.
 await openPage(page, "/dashboard/preferences");
 const fieldset=page.getByRole("form",{name:"Location and commute preferences",exact:true}).locator("fieldset");
 await fieldset.evaluate(el=>(el as HTMLFieldSetElement).disabled=true);
 const relocation=page.getByLabel("Willing to relocate",{exact:true});
 await expect(relocation).toBeDisabled();await expect(relocation).toHaveCSS("opacity","1");
 await expect(relocation).toHaveCSS("color","rgb(179, 179, 179)");
 await fieldset.evaluate(el=>(el as HTMLFieldSetElement).disabled=false);
 await page.emulateMedia({colorScheme:"light"});
 await expect(relocation).toHaveCSS("color-scheme","light");
 await expect(relocation).toHaveCSS("background-color","rgb(255, 255, 255)");
});
