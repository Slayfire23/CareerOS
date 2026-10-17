import { beforeEach, expect, it, vi } from "vitest";
import { parseLocationPreferences } from "@/lib/location-preferences";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateMany: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/db", () => ({ prisma: { careerProfile: { updateMany: mocks.updateMany } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { saveLocationPreferences } from "@/app/dashboard/location-actions";


function form() {const f=new FormData(); f.set("preferredLocations"," Chicago, IL \nchicago, il\nMilwaukee, WI");f.set("relocationWillingness","undecided");f.set("maxCommuteMinutes","45");return f;}
beforeEach(()=>{vi.resetAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:"a"}},error:null});mocks.updateMany.mockResolvedValue({count:1});});
it("normalizes cities without splitting commas",()=>expect(parseLocationPreferences(form())).toEqual({preferredLocations:["Chicago, IL","Milwaukee, WI"],relocationWillingness:"undecided",maxCommuteMinutes:45}));
it("clears all values while distinguishing zero from blank",()=>{const f=form();for(const key of ["preferredLocations","relocationWillingness","maxCommuteMinutes"])f.set(key,"");expect(parseLocationPreferences(f)).toEqual({preferredLocations:[],relocationWillingness:null,maxCommuteMinutes:null});f.set("maxCommuteMinutes","0");expect(parseLocationPreferences(f).maxCommuteMinutes).toBe(0);f.set("maxCommuteMinutes","300");expect(parseLocationPreferences(f).maxCommuteMinutes).toBe(300);});
it.each(["-1","301","1.5","1e2","Infinity","abc"])("rejects invalid commute %s",value=>{const f=form();f.set("maxCommuteMinutes",value);expect(()=>parseLocationPreferences(f)).toThrow();});
it.each(["preferredLocations","relocationWillingness","maxCommuteMinutes"])("rejects missing/duplicate/file inputs for %s",key=>{const f=form();f.delete(key);expect(()=>parseLocationPreferences(f)).toThrow();f.set(key,new Blob(["bad"]));expect(()=>parseLocationPreferences(f)).toThrow();f.set(key,"");f.append(key,"");expect(()=>parseLocationPreferences(f)).toThrow();});
it("enforces location limits and relocation choices",()=>{const f=form();f.set("preferredLocations","x".repeat(101));expect(()=>parseLocationPreferences(f)).toThrow();f.set("preferredLocations",Array(11).fill("City").join("\n"));expect(()=>parseLocationPreferences(f)).toThrow();f.set("preferredLocations","");f.set("relocationWillingness","maybe");expect(()=>parseLocationPreferences(f)).toThrow();});
it("scopes changes and ignores forged fields",async()=>{const f=form();f.set("userId","b");f.set("displayName","overwrite");expect((await saveLocationPreferences({},f)).message).toBeTruthy();expect(mocks.updateMany).toHaveBeenCalledWith({where:{user:{supabaseAuthId:"a"}},data:parseLocationPreferences(f)});});
it.each([null,{id:"a"}])("rejects invalid sessions",async user=>{mocks.getUser.mockResolvedValue({data:{user},error:{message:"expired"}});expect((await saveLocationPreferences({},form())).error).toBeTruthy();expect(mocks.updateMany).not.toHaveBeenCalled();});
it("does not write invalid input or expose database errors",async()=>{const f=form();f.set("maxCommuteMinutes","-1");expect((await saveLocationPreferences({},f)).error).toBeTruthy();expect(mocks.updateMany).not.toHaveBeenCalled();mocks.updateMany.mockRejectedValue(new Error("secret"));expect(JSON.stringify(await saveLocationPreferences({},form()))).not.toContain("secret");expect(mocks.revalidatePath).not.toHaveBeenCalled();});
it("reports missing profiles",async()=>{mocks.updateMany.mockResolvedValue({count:0});expect((await saveLocationPreferences({},form())).error).toBeTruthy();expect(mocks.revalidatePath).not.toHaveBeenCalled();});
