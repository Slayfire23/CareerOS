"use client";
import {useActionState,useId} from "react";
import { ConfirmButton } from "@/components/confirm-button";
import {saveProject,removeProject,type ProjectState} from "@/app/dashboard/project-actions";
import type {Project} from "@/lib/projects";
function ProjectForm({entry}:{entry?:Project}){
 const prefix=useId();const [state,action,pending]=useActionState(saveProject,{} as ProjectState);
 return <form action={action} aria-label={entry?"Edit project "+entry.title:"Add project or accomplishment"} className="space-y-4">
 <input type="hidden" name="projectId" value={entry?.id??""}/>
 <fieldset disabled={pending} className="space-y-4">
 <div><label className="label" htmlFor={prefix+"title"}>Title</label><input id={prefix+"title"} name="title" required maxLength={100} defaultValue={entry?.title??""} className="field"/></div>
 <div className="grid gap-4 md:grid-cols-2">
 {([{name:"description",label:"Description",max:5000},{name:"contribution",label:"Your contribution",max:5000},{name:"results",label:"Results or impact",max:5000},{name:"skills",label:"Skills used",max:1100},{name:"links",label:"Supporting links",max:10010}] as const).map(({name,label,max})=><div key={name} className={name==="links"?"md:col-span-2":undefined}><label className="label" htmlFor={prefix+name}>{label} (optional)</label><textarea id={prefix+name} name={name} maxLength={max} rows={3} defaultValue={Array.isArray(entry?.[name])?(entry[name] as string[]).join("\n"):entry?.[name]??""} aria-describedby={name==="skills"||name==="links"?prefix+name+"-help":undefined} className="field"/>{name==="skills"&&<p id={prefix+name+"-help"} className="hint">One skill per line, up to 10 of 100 characters each.</p>}{name==="links"&&<p id={prefix+name+"-help"} className="hint">One complete http:// or https:// link per line, up to 5. No links are required.</p>}</div>)}
 </div>
 <button type="submit" className="btn btn-primary">{pending?"Saving…":"Save project"}</button></fieldset>
 {state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}
 </form>;
}
function ProjectRow({entry}:{entry:Project}){
 const [state,action,pending]=useActionState(removeProject,{} as ProjectState);
 return <li className="space-y-3 rounded-xl border p-4">
 <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 font-semibold">{entry.title}</h3>
 <form action={action}><input type="hidden" name="projectId" value={entry.id}/><ConfirmButton label="Remove project" ariaLabel={"Remove "+entry.title} confirmLabel="remove" pending={pending} pendingLabel="Removing…"/></form></div>
 <div className="space-y-2 text-sm">
 {entry.description&&<p className="whitespace-pre-wrap">{entry.description}</p>}
 {entry.contribution&&<p className="whitespace-pre-wrap"><strong>Your contribution: </strong>{entry.contribution}</p>}
 {entry.results&&<p className="whitespace-pre-wrap"><strong>Results: </strong>{entry.results}</p>}
 {!!entry.skills.length&&<p><strong>Skills: </strong>{entry.skills.join(", ")}</p>}
 {entry.links.map(link=><p key={link}><a href={link} target="_blank" rel="noopener noreferrer" className="break-all text-accent-text underline">{link}</a></p>)}
 </div>
 <details className="disclosure"><summary className="text-sm text-accent-text">Edit project</summary><ProjectForm key={JSON.stringify(entry)} entry={entry}/></details>
 {state.error&&<p role="alert">{state.error}</p>}
 </li>;
}
export function Projects({entries}:{entries:Project[]}){return <section aria-labelledby="projects-heading" className="space-y-5"><div className="space-y-1"><h2 id="projects-heading" className="text-lg font-semibold">Projects and accomplishments</h2><p className="text-sm text-muted">Optional: share work relevant to your career, such as a campaign, installation, process improvement, design, or application. Leave this section empty if it does not fit your work.</p></div>{entries.length?<ul className="space-y-3">{entries.map(entry=><ProjectRow key={entry.id} entry={entry}/>)}</ul>:<p className="rounded-lg border border-dashed bg-surface-muted p-4 text-sm text-muted">No projects or accomplishments added.</p>}<details className="disclosure disclosure-panel"><summary>Add project or accomplishment</summary><ProjectForm/></details></section>;}
