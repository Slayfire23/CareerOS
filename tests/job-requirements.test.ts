import { expect, it } from "vitest";
import { parseRequirementReview, suggestRequirements, validateRequirements } from "@/lib/job-requirements";
it("suggests source-backed requirements and distinguishes required and preferred", () => {
 const text = "Requirements:\n- 3 years experience\n- Bachelor's degree\nPreferred:\n- Knowledge of CAD\nBenefits:\n- Paid leave";
 const rows = suggestRequirements(text);
 expect(rows).toHaveLength(3);
 expect(rows.map(row => row.category)).toEqual(["Experience", "Education", "Skills"]);
 expect(rows.map(row => row.priority)).toEqual(["Required", "Required", "Preferred"]);
 for (const row of rows) expect(text).toContain(row.source);
});
it("does not invent requirements for unrecognized prose", () => {
 expect(suggestRequirements("We are a friendly team. Apply today!")).toEqual([]);
});
it("leaves ambiguous or explicitly optional priority for the user to decide", () => {
 const rows = suggestRequirements("Requirements:\n\nDegree required; certification preferred\nPrevious experience not required");
 expect(rows.map(row => row.priority)).toEqual(["Unspecified", "Unspecified"]);
});
it("deduplicates and bounds suggestions", () => {
 expect(suggestRequirements("Requirements:\nCAD\nCAD")).toHaveLength(1);
 expect(suggestRequirements("Requirements:\n" + Array.from({length:60}, (_,i)=>`Skill ${i}`).join("\n"))).toHaveLength(50);
});
const row = {text:"CAD",category:"Skills",priority:"Required",source:"CAD"};
it("accepts reviewed source-backed and manually added requirements and explicit clearing",()=>{
 expect(validateRequirements([row],"CAD required")).toEqual([row]);
 expect(validateRequirements([{...row,source:""}],"Other text")).toHaveLength(1);
 expect(validateRequirements([],"Text")).toEqual([]);
});
it.each([{...row,source:"invented"},{...row,category:"Fake"},{...row,priority:"Fake"},{...row,text:" "},{...row,text:"x".repeat(1001)}])("rejects malformed review row %j", value=>{
 expect(()=>validateRequirements([value],"CAD")).toThrow();
});
it("requires confirmation, exact fields and a valid version",()=>{
 const f=new FormData();f.set("baseDescription","CAD");f.set("reviewVersion","0");f.set("requirements",JSON.stringify([row]));
 expect(()=>parseRequirementReview(f)).toThrow();f.set("confirmed","on");
 expect(parseRequirementReview(f).requirements).toEqual([row]);
 f.append("reviewVersion","1");expect(()=>parseRequirementReview(f)).toThrow();
 f.set("reviewVersion","-1");expect(()=>parseRequirementReview(f)).toThrow();
});
