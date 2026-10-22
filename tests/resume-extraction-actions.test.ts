import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({getUser:vi.fn(),download:vi.fn(),extract:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.getUser},storage:{from:()=>({download:m.download})}})}));
vi.mock("@/lib/extract-resume",()=>({extractResumeText:m.extract}));vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {extractResume,applyResumeReview} from "@/app/dashboard/resume-review/actions";
const key="12345678-1234-1234-1234-123456789abc_resume.pdf";
function form(){const f=new FormData();f.set("key",key);return f;}
beforeEach(()=>{vi.resetAllMocks();m.getUser.mockResolvedValue({data:{user:{id:"owner"}},error:null});m.download.mockResolvedValue({data:new Blob(["PDF"]),error:null});m.extract.mockResolvedValue("Alex Example\nEngineer\nSkills\nCAD");});
it("extracts only from verified owner's folder and never writes",async()=>{const f=form();f.set("userId","victim");expect((await extractResume({},f)).suggestions!.skills).toEqual(["CAD"]);expect(m.download).toHaveBeenCalledWith("owner/"+key);expect(m.transaction).not.toHaveBeenCalled();});
it.each([null,{id:"owner"}])("rejects missing/errored auth",async user=>{m.getUser.mockResolvedValue({data:{user},error:{message:"expired"}});expect((await extractResume({},form())).error).toContain("session");expect((await applyResumeReview({},form())).error).toContain("session");expect(m.download).not.toHaveBeenCalled();});
it("rejects traversal and duplicate keys",async()=>{const f=form();f.set("key","../"+key);expect((await extractResume({},f)).error).toBeTruthy();f.set("key",key);f.append("key",key);expect((await extractResume({},f)).error).toBeTruthy();expect(m.download).not.toHaveBeenCalled();});
it("returns generic errors for inaccessible or broken PDFs",async()=>{m.download.mockResolvedValue({data:null,error:{message:"secret"}});expect((await extractResume({},form())).error).not.toContain("secret");expect(m.extract).not.toHaveBeenCalled();m.download.mockResolvedValue({data:new Blob(["broken"]),error:null});m.extract.mockRejectedValue(new Error("sensitive parser details"));expect((await extractResume({},form())).error).toContain("could not be read");});
it("requires opt-in before downloading or writing on apply",async()=>{expect((await applyResumeReview({},form())).error).toContain("Select");expect(m.download).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();});
