import { expect, it } from "vitest";
import { parseEducation, educationId } from "@/lib/education";
function form() {
 const f = new FormData();
 for (const [key,value] of Object.entries({educationId:"",qualification:" Engineer ",institution:" Acme ",fieldOfStudy:" Engineering ",startMonth:"2020-01",endMonth:"2021-02",description:""})) f.set(key,value);
 return f;
}
it("trims fields and preserves month precision",()=>expect(parseEducation(form())).toEqual({qualification:"Engineer",institution:"Acme",fieldOfStudy:"Engineering",startMonth:"2020-01",endMonth:"2021-02",description:null}));
it("clears the end month for current study",()=>{ const f=form();f.set("current","on");expect(parseEducation(f).endMonth).toBeNull(); });
it.each([["qualification",""],["institution","x".repeat(101)],["startMonth","2020-13"],["endMonth","2019-12"],["endMonth",""],["description","x".repeat(5001)],["current","false"]])("rejects invalid %s (%#)",(key,value)=>{const f=form();f.set(key,value);expect(()=>parseEducation(f)).toThrow();});
it("accepts the same start and end month",()=>{const f=form();f.set("endMonth","2020-01");expect(parseEducation(f).endMonth).toBe("2020-01");});
it("rejects duplicate text fields and file inputs",()=>{const f=form();f.append("institution","other");expect(()=>parseEducation(f)).toThrow();f.set("institution",new Blob(["bad"]));expect(()=>parseEducation(f)).toThrow();});
it("requires one valid ID or an explicit blank for creation",()=>{const f=form();expect(educationId(f)).toBe("");f.set("educationId","forged");expect(()=>educationId(f)).toThrow();f.delete("educationId");expect(()=>educationId(f)).toThrow();});

it("clears optional field of study and rejects oversized values",()=>{const f=form();f.set("fieldOfStudy","  ");expect(parseEducation(f).fieldOfStudy).toBeNull();f.set("fieldOfStudy","x".repeat(101));expect(()=>parseEducation(f)).toThrow();});
