"use client";
import {useActionState,useId} from "react";
import {saveProject,removeProject,type ProjectState} from "@/app/dashboard/project-actions";
import type {Project} from "@/lib/projects";
function ProjectForm({entry}:{entry?:Project}){
 const prefix=useId();const [state,action,pending]=useActionState(saveProject,{} as ProjectState);
 return <form action={action} aria-label={entry?"Edit project "+entry.title:"Add project or accomplishment"} className="space-y-4">
 <input type="hidden" name="projectId" value={entry?.id??""}/>
 <fieldset disabled={pending} className="space-y-4">
 <label className="block" htmlFor={prefix+"title"}>Title</label><input id={prefix+"title"} name="title" required maxLength={100} defaultValue={entry?.title??""} className="w-full rounded border p-3"/>
 {([{name:"description",label:"Description",max:5000},{name:"contribution",label:"Your contribution",max:5000},{name:"results",label:"Results or impact",max:5000},{name:"skills",label:"Skills used",max:1100},{name:"links",label:"Supporting links",max:10010}] as const).map(({name,label,max})=><div key={name}><label className="mb-2 block" htmlFor={prefix+name}>{label} (optional)</label><textarea id={prefix+name} name={name} maxLength={max} rows={3} defaultValue={Array.isArray(entry?.[name])?(entry[name] as string[]).join("\n"):entry?.[name]??""} aria-describedby={name==="skills"||name==="links"?prefix+name+"-help":undefined} className="w-full rounded border p-3"/>{name==="skills"&&<p id={prefix+name+"-help"}>One skill per line, up to 10 of 100 characters each.</p>}{name==="links"&&<p id={prefix+name+"-help"}>One complete http:// or https:// link per line, up to 5. No links are required.</p>}</div>)}
 <button type="submit" className="rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50">{pending?"Saving…":"Save project"}</button></fieldset>
 {state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}
 </form>;
}
function ProjectRow({entry}:{entry:Project}){
 const [state,action,pending]=useActionState(removeProject,{} as ProjectState);
 return <li className="space-y-3 rounded border p-4"><h3 className="font-semibold">{entry.title}</h3>
 {entry.description&&<p className="whitespace-pre-wrap">{entry.description}</p>}
 {entry.contribution&&<p className="whitespace-pre-wrap"><strong>Your contribution: </strong>{entry.contribution}</p>}
 {entry.results&&<p className="whitespace-pre-wrap"><strong>Results: </strong>{entry.results}</p>}
 {!!entry.skills.length&&<p><strong>Skills: </strong>{entry.skills.join(", ")}</p>}
 {entry.links.map(link=><p key={link}><a href={link} target="_blank" rel="noopener noreferrer" className="break-all underline">{link}</a></p>)}
 <details><summary className="cursor-pointer">Edit project</summary><ProjectForm key={JSON.stringify(entry)} entry={entry}/></details>
 <form action={action}><input type="hidden" name="projectId" value={entry.id}/><button disabled={pending} aria-label={"Remove "+entry.title} className="rounded border px-3 py-2 disabled:opacity-50">{pending?"Removing…":"Remove project"}</button></form>{state.error&&<p role="alert">{state.error}</p>}
 </li>;
}
export function Projects({entries}:{entries:Project[]}){return <section aria-labelledby="projects-heading" className="space-y-5"><h2 id="projects-heading" className="text-xl font-semibold">Projects and accomplishments</h2><p>Optional: share work relevant to your career, such as a campaign, installation, process improvement, design, or application. Leave this section empty if it does not fit your work.</p>{entries.length?<ul className="space-y-4">{entries.map(entry=><ProjectRow key={entry.id} entry={entry}/>)}</ul>:<p>No projects or accomplishments added.</p>}<details className="rounded border p-4"><summary className="cursor-pointer font-semibold">Add project or accomplishment</summary><div className="mt-4"><ProjectForm/></div></details></section>;}
