"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { RESUME_BUCKET, validateResume, validResumeKey } from "@/lib/resume-files";
export type ResumeState={error?:string;message?:string};
export async function uploadResume(_previous:ResumeState,form:FormData):Promise<ResumeState>{
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return {error:"Your session has expired. Please sign in again."};
 let file;try{file=await validateResume(form);}catch(e){return {error:e instanceof Error?e.message:"Invalid PDF."};}
 try{
  const key=randomUUID()+"_"+file.name;
  const {error}=await client.storage.from(RESUME_BUCKET).upload(user.id+"/"+key,file.bytes,{contentType:"application/pdf",upsert:false,cacheControl:"0"});
  if(error)throw new Error();
 }catch{return {error:"Resume upload failed. Please try again. Existing files have not been replaced."};}
 revalidatePath("/dashboard", "layout");return {message:"Resume uploaded as a new version."};
}
export async function deleteResume(_previous:ResumeState,form:FormData):Promise<ResumeState>{
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return {error:"Your session has expired. Please sign in again."};
 const values=form.getAll("key");if(values.length!==1||!validResumeKey(values[0]))return {error:"Invalid resume selection."};
 try{
  const {data,error}=await client.storage.from(RESUME_BUCKET).remove([user.id+"/"+values[0]]);
  if(error||!data?.length)return {error:"Resume could not be deleted. Refresh and try again."};
 }catch{return {error:"Resume could not be deleted. Please try again."};}
 revalidatePath("/dashboard", "layout");return {message:"Resume deleted."};
}
