import { beforeEach, expect, it, vi } from "vitest";
import { parseSalaryExpectations } from "@/lib/salary-expectations";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateMany: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/db", () => ({ prisma: { careerProfile: { updateMany: mocks.updateMany } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { saveSalaryExpectations } from "@/app/dashboard/salary-actions";



function form(){const f=new FormData();for(const [k,v] of Object.entries({salaryMin:"25.10",salaryMax:"40.99",salaryCurrency:"USD",salaryPeriod:"hour"}))f.set(k,v);return f;}
beforeEach(()=>{vi.resetAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:"a"}},error:null});mocks.updateMany.mockResolvedValue({count:1});});
it("stores exact cents",()=>expect(parseSalaryExpectations(form())).toEqual({salaryMinCents:2510,salaryMaxCents:4099,salaryCurrency:"USD",salaryPeriod:"hour"}));
it("supports one bound and clears all values when both are empty",()=>{const f=form();f.set("salaryMin","");expect(parseSalaryExpectations(f).salaryMinCents).toBeNull();f.set("salaryMax","");expect(parseSalaryExpectations(f)).toEqual({salaryMinCents:null,salaryMaxCents:null,salaryCurrency:null,salaryPeriod:null});});
it("preserves zero and maximum supported amount",()=>{const f=form();f.set("salaryMin","0");f.set("salaryMax","9999999.99");expect(parseSalaryExpectations(f)).toMatchObject({salaryMinCents:0,salaryMaxCents:999999999});});
it.each(["-1","1.001","1e3","NaN","1,000","10000000"])("rejects invalid amount %s",value=>{const f=form();f.set("salaryMin",value);expect(()=>parseSalaryExpectations(f)).toThrow();});
it.each(["salaryMin","salaryMax","salaryCurrency","salaryPeriod"])("rejects missing/duplicate/file input %s",key=>{const f=form();f.delete(key);expect(()=>parseSalaryExpectations(f)).toThrow();f.set(key,new Blob(["bad"]));expect(()=>parseSalaryExpectations(f)).toThrow();f.set(key,"");f.append(key,"");expect(()=>parseSalaryExpectations(f)).toThrow();});
it.each([["salaryCurrency",""],["salaryPeriod",""],["salaryCurrency","XYZ"],["salaryPeriod","week"],["salaryMin","50"]])("rejects incompatible fields (%#)",(key,value)=>{const f=form();f.set(key,value);expect(()=>parseSalaryExpectations(f)).toThrow();});
it("scopes writes to identity and ignores forged ownership",async()=>{const f=form();f.set("userId","b");f.set("displayName","attack");expect((await saveSalaryExpectations({},f)).message).toBeTruthy();expect(mocks.updateMany).toHaveBeenCalledWith({where:{user:{supabaseAuthId:"a"}},data:parseSalaryExpectations(f)});});
it.each([null,{id:"a"}])("rejects missing or invalid sessions",async user=>{mocks.getUser.mockResolvedValue({data:{user},error:{message:"expired"}});expect((await saveSalaryExpectations({},form())).error).toBeTruthy();expect(mocks.updateMany).not.toHaveBeenCalled();});
it("rejects invalid inputs before writing",async()=>{const f=form();f.set("salaryMin","-1");expect((await saveSalaryExpectations({},f)).error).toBeTruthy();expect(mocks.updateMany).not.toHaveBeenCalled();});
it("does not claim success for missing profiles or leak database failures",async()=>{mocks.updateMany.mockResolvedValue({count:0});expect((await saveSalaryExpectations({},form())).error).toBeTruthy();mocks.updateMany.mockRejectedValue(new Error("secret"));const result=await saveSalaryExpectations({},form());expect(result.error).toBeTruthy();expect(JSON.stringify(result)).not.toContain("secret");expect(mocks.revalidatePath).not.toHaveBeenCalled();});
