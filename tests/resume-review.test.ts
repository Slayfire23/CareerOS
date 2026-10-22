import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {extractResumeText} from "@/lib/extract-resume";
import {suggestResumeFields,parseReviewedResume} from "@/lib/resume-suggestions";
import {resumePdf} from "./support/resume-pdf";
it("extracts real PDF text and suggests explicit skills across careers",async()=>{const text=await extractResumeText(new Uint8Array(resumePdf(["Alex Example","Mechanical Engineer","Skills","Welding, CAD; Planning","Education","Example University"])));expect(text).toContain("Mechanical Engineer");expect(suggestResumeFields(text)).toEqual({displayName:"Alex Example",headline:"Mechanical Engineer",skills:["Welding","CAD","Planning"]});});
it("handles scan-only and malformed PDFs",async()=>{await expect(extractResumeText(new Uint8Array(resumePdf([])))).rejects.toThrow("No readable text");await expect(extractResumeText(new Uint8Array([1,2,3]))).rejects.toThrow();});
it("does not infer skills or contact data from unrelated text",()=>expect(suggestResumeFields("CONTACT\nalex@example.com\nExperience\nUsed many tools")).toEqual({displayName:"",headline:"",skills:[]}));
it("deduplicates and bounds skills, stopping at section headings",()=>{const result=suggestResumeFields("Alex Example\nEngineer\nSkills: CAD, cad, Planning\nEducation\nDegree");expect(result.skills).toEqual(["CAD","Planning"]);});
function form(){const f=new FormData();f.set("displayName","New Name");f.set("headline","New headline");f.set("skills","CAD\ncad\nPlanning");f.set("baseName","Old Name");f.set("baseHeadline","");return f;}
it("requires explicit opt-in and ignores unselected values",()=>{const f=form();expect(()=>parseReviewedResume(f)).toThrow("Select");f.set("useSkills","on");expect(parseReviewedResume(f)).toMatchObject({displayName:undefined,headline:undefined,skills:["cad","Planning"]});});
it("validates edited fields instead of trusting extraction",()=>{const f=form();f.set("useName","on");f.set("displayName","");expect(()=>parseReviewedResume(f)).toThrow();f.set("displayName","A".repeat(101));expect(()=>parseReviewedResume(f)).toThrow();});
it("rejects duplicate selectors and missing snapshots",()=>{const f=form();f.append("useName","on");f.append("useName","on");expect(()=>parseReviewedResume(f)).toThrow();f.set("useName","on");f.delete("baseName");expect(()=>parseReviewedResume(f)).toThrow();});
