import { expect, it } from "vitest";
import { parseExperience, experienceId } from "@/lib/professional-experience";
function form() {
 const f = new FormData();
 for (const [key,value] of Object.entries({experienceId:"",jobTitle:" Engineer ",company:" Acme ",startMonth:"2020-01",endMonth:"2021-02",description:""})) f.set(key,value);
 return f;
}
it("trims fields and preserves month precision",()=>expect(parseExperience(form())).toEqual({jobTitle:"Engineer",company:"Acme",startMonth:"2020-01",endMonth:"2021-02",description:null}));
it("clears the end month for current employment",()=>{ const f=form();f.set("current","on");expect(parseExperience(f).endMonth).toBeNull(); });
it.each([["jobTitle",""],["company","x".repeat(101)],["startMonth","2020-13"],["endMonth","2019-12"],["endMonth",""],["description","x".repeat(5001)],["current","false"]])("rejects invalid %s (%#)",(key,value)=>{const f=form();f.set(key,value);expect(()=>parseExperience(f)).toThrow();});
it("accepts the same start and end month",()=>{const f=form();f.set("endMonth","2020-01");expect(parseExperience(f).endMonth).toBe("2020-01");});
it("rejects duplicate text fields and file inputs",()=>{const f=form();f.append("company","other");expect(()=>parseExperience(f)).toThrow();f.set("company",new Blob(["bad"]));expect(()=>parseExperience(f)).toThrow();});
it("requires one valid ID or an explicit blank for creation",()=>{const f=form();expect(experienceId(f)).toBe("");f.set("experienceId","forged");expect(()=>experienceId(f)).toThrow();f.delete("experienceId");expect(()=>experienceId(f)).toThrow();});
