"use client";
import Link from "next/link";
import {useActionState,useState} from "react";
import {resumeReviewHref} from "@/lib/sections";
import {uploadResume,deleteResume,type ResumeState} from "@/app/dashboard/resume-actions";
import {MAX_RESUME_BYTES,type ResumeFile} from "@/lib/resume-files";
import {Icon} from "@/components/icons";
const uploadedFormat=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"UTC"});
function uploadedLabel(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"Upload time unknown":`Uploaded ${uploadedFormat.format(date)} UTC`;}
function ResumeRow({file,latest}:{file:ResumeFile;latest:boolean}){
 const [state,action,pending]=useActionState(deleteResume,{} as ResumeState);
 return <li className="rounded-xl border bg-surface p-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
   <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent-text">PDF</span>
   <div className="min-w-0 flex-1">
    <p className="font-semibold break-all">{file.name}{latest&&<span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-xs font-medium text-accent-text">Latest</span>}</p>
    <p className="text-sm text-muted">{Math.ceil(file.size/1024)} KiB · {uploadedLabel(file.uploadedAt)}</p>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <Link className="btn btn-primary btn-sm" href={resumeReviewHref(file.key)}>Review suggestions<span className="sr-only"> from {file.name}</span></Link>
    <a className="btn btn-secondary btn-sm" href={"/api/resumes/"+encodeURIComponent(file.key)}>Download<span className="sr-only"> {file.name}</span></a>
    <form action={action}><input type="hidden" name="key" value={file.key}/><button className="btn btn-danger btn-sm" disabled={pending} aria-label={"Delete "+file.name}>{pending?"Deleting…":"Delete"}</button></form>
   </div>
  </div>
  {state.error&&<p role="alert" className="mt-3">{state.error}</p>}
 </li>;
}
export function Resumes({files,error}:{files:ResumeFile[];error?:string}){
 const [state,action,pending]=useActionState(uploadResume,{} as ResumeState);
 const [fileError,setFileError]=useState("");
 return <section aria-labelledby="resumes-heading" className="space-y-6">
  <h2 id="resumes-heading" className="sr-only">Private resumes</h2>
  <form action={action} aria-label="Upload resume" className="rounded-xl border border-dashed bg-surface p-5 sm:p-6">
   <fieldset disabled={pending} className="flex flex-col gap-4 sm:flex-row sm:items-end">
    <div className="min-w-0 flex-1">
     <label className="label" htmlFor="resume-file">PDF resume</label>
     <input id="resume-file" name="resume" type="file" accept=".pdf,application/pdf" required aria-describedby="resume-upload-help resume-upload-error" className="field cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-text" onChange={e=>{const file=e.target.files?.[0];const error=file&&file.size>MAX_RESUME_BYTES?"Choose a PDF no larger than 2 MiB.":"";setFileError(error);e.target.setCustomValidity(error);}}/>
     <p id="resume-upload-help" className="hint">PDF only, up to 2 MiB. Each upload is kept as its own version, even with the same filename. Only your account can access these files.</p>
    </div>
    <button type="submit" disabled={!!fileError} className="btn btn-primary shrink-0"><Icon name="upload"/>{pending?"Uploading…":"Upload resume"}</button>
   </fieldset>
   <p id="resume-upload-error" role={fileError?"alert":undefined} className={fileError?"mt-3":"sr-only"}>{fileError}</p>
   {state.error&&<p role="alert" className="mt-3">{state.error}</p>}
   {state.message&&<p role="status" className="mt-3">{state.message}</p>}
  </form>
  <div className="space-y-3">
   <div className="flex items-baseline justify-between gap-3">
    <h3 className="text-lg font-semibold">Your versions</h3>
    {!error&&files.length>0&&<p className="text-sm text-muted">{files.length} saved, newest first</p>}
   </div>
   {error?<p role="alert">{error}</p>:files.length?<ul className="space-y-3">{files.map((file,index)=><ResumeRow key={file.key} file={file} latest={index===0&&files.length>1}/>)}</ul>:<div className="rounded-xl border border-dashed bg-surface-muted p-6 text-center">
    <p className="font-medium">No resumes uploaded yet.</p>
    <p className="mt-1 text-sm text-muted">Upload a PDF above. You can then review suggested profile details before anything is saved.</p>
   </div>}
  </div>
 </section>;
}
