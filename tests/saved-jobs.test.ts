import { expect, it } from "vitest";
import { parseSavedJob, sameDescription, savedJobId } from "@/lib/saved-jobs";
function form() {
 const f = new FormData();
 for (const [key, value] of Object.entries({jobId:"", title:" Engineer ", company:"Example", postingUrl:"", description:"Build useful things."})) f.set(key,value);
 return f;
}
it("trims fields and treats an empty link as absent", () => {
 expect(parseSavedJob(form())).toEqual({title:"Engineer", company:"Example", postingUrl:null, description:"Build useful things."});
 expect(savedJobId(form())).toBe("");
});
it.each(["title", "company", "description"])("requires %s", key => {
 const f=form();f.set(key," ");expect(()=>parseSavedJob(f)).toThrow();
});
it.each(["javascript:alert(1)","https://user:pass@example.com","/relative","ftp://example.com"])("rejects unsafe or incomplete link %s", link => {
 const f=form();f.set("postingUrl",link);expect(()=>parseSavedJob(f)).toThrow();
});
it("accepts HTTPS links without fetching them",()=>{
 const f=form();f.set("postingUrl","https://example.com/jobs/123");expect(parseSavedJob(f).postingUrl).toBe("https://example.com/jobs/123");
});
it("rejects duplicate fields, oversized descriptions and malformed IDs",()=>{
 const f=form();f.append("title","Other");expect(()=>parseSavedJob(f)).toThrow();
 const g=form();g.set("description","x".repeat(30001));expect(()=>parseSavedJob(g)).toThrow();
 g.set("jobId","foreign");expect(()=>savedJobId(g)).toThrow();
 g.set("jobId","");g.append("jobId","");expect(()=>savedJobId(g)).toThrow();
});
it("compares descriptions with CRLF, CR, and LF line endings treated alike, and nothing else", () => {
 expect(sameDescription("a\nb\nc", "a\r\nb\rc")).toBe(true);
 expect(sameDescription("a\r\nb", "a\r\nb")).toBe(true);
 expect(sameDescription("a\nb", "a\n\nb")).toBe(false);
 expect(sameDescription("a\nb", "a b")).toBe(false);
 expect(sameDescription("a\nb ", "a\r\nb")).toBe(false);
});
