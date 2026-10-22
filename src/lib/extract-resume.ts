import "server-only";
import {getResolvedPDFJS} from "unpdf";
import {MAX_RESUME_BYTES} from "@/lib/resume-files";
export async function extractResumeText(bytes:Uint8Array):Promise<string>{
 if(!bytes.length||bytes.length>MAX_RESUME_BYTES)throw new Error("Choose a PDF no larger than 2 MiB.");
 const {getDocument}=await getResolvedPDFJS();
 const task=getDocument({data:bytes,useSystemFonts:false,disableFontFace:true,verbosity:0});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const work=(async()=>{const pdf=await task.promise;if(pdf.numPages>20)throw new Error("Use a resume with at most 20 pages.");let text="";
   for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();for(const item of content.items){if("str" in item)text+=item.str+(item.hasEOL?"\n":" ");if(text.length>50000)throw new Error("This PDF contains too much text. Use a shorter resume.");}text+="\n";page.cleanup();}
   if(text.trim().length<20)throw new Error("No readable text found. Scanned resumes need a text-based PDF; you can still fill your profile manually.");return text.trim();})();
  return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Error("Reading this PDF took too long. Try a simpler text-based PDF."));void task.destroy().catch(()=>{});},10000);})]);
 }finally{if(timer)clearTimeout(timer);await task.destroy().catch(()=>{});}
}
