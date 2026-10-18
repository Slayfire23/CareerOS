import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RESUME_BUCKET, validResumeKey, resumeDisplayName, type ResumeFile } from "@/lib/resume-files";
export async function getResumes(): Promise<{files:ResumeFile[];error?:string}> {
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return {files:[],error:"Please sign in to view resumes."};
 try {
  const files:ResumeFile[]=[];
  for(let offset=0;;offset+=100){
   const {data,error}=await client.storage.from(RESUME_BUCKET).list(user.id,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
   if(error||!data)throw new Error();
   for(const file of data)if(file.id&&validResumeKey(file.name))files.push({key:file.name,name:resumeDisplayName(file.name),size:Number(file.metadata?.size)||0,uploadedAt:file.created_at ?? ""});
   if(data.length<100)break;
  }
  return {files:files.sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)||a.key.localeCompare(b.key))};
 }catch{return {files:[],error:"Resumes could not be loaded. Please try again later."};}
}
