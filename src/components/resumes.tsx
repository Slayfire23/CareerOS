"use client";
import {useActionState,useState} from "react";
import {uploadResume,deleteResume,type ResumeState} from "@/app/dashboard/resume-actions";
import {MAX_RESUME_BYTES,type ResumeFile} from "@/lib/resume-files";
function ResumeRow({file}:{file:ResumeFile}){
 const [state,action,pending]=useActionState(deleteResume,{} as ResumeState);
 return <li className="space-y-2 rounded border p-4"><p className="font-semibold break-all">{file.name}</p><p>{Math.ceil(file.size/1024)} KiB · Uploaded {file.uploadedAt.replace("T"," ").slice(0,19)} UTC</p><a className="underline" href={"/api/resumes/"+encodeURIComponent(file.key)}>Download {file.name}</a><form action={action}><input type="hidden" name="key" value={file.key}/><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={pending} aria-label={"Delete "+file.name}>{pending?"Deleting…":"Delete resume"}</button></form>{state.error&&<p role="alert">{state.error}</p>}</li>;
}
export function Resumes({files,error}:{files:ResumeFile[];error?:string}){
 const [state,action,pending]=useActionState(uploadResume,{} as ResumeState);
 const [fileError,setFileError]=useState("");
 return <section aria-labelledby="resumes-heading" className="space-y-5"><h2 id="resumes-heading" className="text-xl font-semibold">Private resumes</h2><p>PDF only, up to 2 MiB. Each upload is kept separately, even with the same filename. Only your account can access these files.</p>{error?<p role="alert">{error}</p>:files.length?<ul className="space-y-3">{files.map(file=><ResumeRow key={file.key} file={file}/>)}</ul>:<p>No resumes uploaded yet.</p>}
 <form action={action} aria-label="Upload resume" className="space-y-3"><fieldset disabled={pending}><label className="mb-2 block" htmlFor="resume-file">PDF resume</label><input id="resume-file" name="resume" type="file" accept=".pdf,application/pdf" required aria-describedby="resume-upload-error" className="w-full rounded border p-3" onChange={e=>{const file=e.target.files?.[0];const error=file&&file.size>MAX_RESUME_BYTES?"Choose a PDF no larger than 2 MiB.":"";setFileError(error);e.target.setCustomValidity(error);}}/><button type="submit" disabled={!!fileError} className="mt-3 rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50">{pending?"Uploading…":"Upload resume"}</button></fieldset><p id="resume-upload-error" role={fileError?"alert":undefined}>{fileError}</p>{state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}</form></section>;
}
