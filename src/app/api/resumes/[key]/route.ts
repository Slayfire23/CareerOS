import {createClient} from "@/lib/supabase/server";
import {RESUME_BUCKET,validResumeKey,resumeDisplayName} from "@/lib/resume-files";
const headers={"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"};
export async function GET(_request:Request,{params}:{params:Promise<{key:string}>}){
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return new Response("Sign in required",{status:401,headers});
 const {key}=await params;if(!validResumeKey(key))return new Response("Not found",{status:404,headers});
 try{
  const {data,error}=await client.storage.from(RESUME_BUCKET).download(user.id+"/"+key);
  if(error||!data)return new Response("Not found",{status:404,headers});
  return new Response(data,{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+resumeDisplayName(key)+'"',"Content-Security-Policy":"sandbox"}});
 }catch{return new Response("Download unavailable",{status:503,headers});}
}
