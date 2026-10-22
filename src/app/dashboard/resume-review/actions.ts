"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {prisma} from "@/lib/db";
import {RESUME_BUCKET,validResumeKey,MAX_RESUME_BYTES} from "@/lib/resume-files";
import {extractResumeText} from "@/lib/extract-resume";
import {suggestResumeFields,parseReviewedResume,type ResumeSuggestions} from "@/lib/resume-suggestions";
export type ExtractionState={error?:string;text?:string;suggestions?:ResumeSuggestions};
export type ReviewState={error?:string;message?:string};
function sourceKey(form:FormData){const keys=form.getAll("key");if(keys.length!==1||!validResumeKey(keys[0]))throw new Error("Invalid resume selection.");return keys[0];}
export async function extractResume(_previous:ExtractionState,form:FormData):Promise<ExtractionState>{
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();if(error||!user)return {error:"Your session has expired. Please sign in again."};
 try{const key=sourceKey(form);const {data,error}=await client.storage.from(RESUME_BUCKET).download(user.id+"/"+key);if(error||!data)return {error:"Resume unavailable. Return to the dashboard and choose one of your files."};if(data.size>MAX_RESUME_BYTES)return {error:"Choose a PDF no larger than 2 MiB."};
  let text;try{text=await extractResumeText(new Uint8Array(await data.arrayBuffer()));}catch(e){const message=e instanceof Error?e.message:"";return {error:/^(Use a resume|This PDF contains|No readable text|Reading this PDF took)/.test(message)?message:"This PDF could not be read. It may be damaged or password-protected. Export an unlocked text-based PDF and try again."};}
  return {text,suggestions:suggestResumeFields(text)};
 }catch{return {error:"Resume could not be read. Please try again."};}
}
export async function applyResumeReview(_previous:ReviewState,form:FormData):Promise<ReviewState>{
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();if(error||!user)return {error:"Your session has expired. Please sign in again."};
 let reviewed,key;try{key=sourceKey(form);reviewed=parseReviewedResume(form);}catch(e){return {error:e instanceof Error?e.message:"Invalid review."};}
 try{
  const source=await client.storage.from(RESUME_BUCKET).download(user.id+"/"+key);if(source.error||!source.data)return {error:"The source resume is no longer available. Refresh and choose another file."};
  await prisma.$transaction(async tx=>{
   const profile=await tx.careerProfile.findFirst({where:{user:{supabaseAuthId:user.id}},select:{id:true}});if(!profile)throw new Error("missing");
   if(reviewed.displayName!==undefined||reviewed.headline!==undefined){
    const result=await tx.careerProfile.updateMany({where:{id:profile.id,...(reviewed.displayName!==undefined?{displayName:reviewed.baseName}:{}),...(reviewed.headline!==undefined?{headline:reviewed.baseHeadline||null}:{})},data:{...(reviewed.displayName!==undefined?{displayName:reviewed.displayName}:{}),...(reviewed.headline!==undefined?{headline:reviewed.headline}:{})}});
    if(result.count!==1)throw new Error("conflict");
   }
   if(reviewed.skills.length)await tx.technicalSkill.createMany({data:reviewed.skills.map(name=>({profileId:profile.id,name,normalizedName:name.toLowerCase(),proficiency:null})),skipDuplicates:true});
  });
 }catch(e){return {error:e instanceof Error&&e.message==="conflict"?"Your profile changed since this review opened. Reload before applying suggestions.":"The reviewed fields could not be saved. Please try again."};}
 revalidatePath("/dashboard");return {message:"Selected fields saved. Existing skills and proficiency levels were preserved."};
}
