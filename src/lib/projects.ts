import { lines } from "@/lib/career-preferences";
export type Project = {id:string;title:string;description:string|null;contribution:string|null;results:string|null;skills:string[];links:string[]};
export function projectId(form:FormData) {
 const values=form.getAll("projectId");
 if(values.length!==1||typeof values[0]!=="string"||(values[0]!==""&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(values[0])))throw new Error("Invalid project selection.");
 return values[0];
}
export function parseProject(form:FormData){
 function text(key:string,max:number,required=false){const values=form.getAll(key);if(values.length!==1||typeof values[0]!=="string")throw new Error("Invalid project fields. Reload and try again.");const value=values[0].trim();if(value.length>max||(required&&!value))throw new Error(key+": enter "+(required?"1":"0")+"–"+max+" characters.");return value;}
 const title=text("title",100,true);
 const raw=text("links",10010).split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 if(raw.length>5)throw new Error("Enter at most 5 supporting links.");
 const links=raw.map(value=>{if(value.length>2000||!/^https?:\/\//i.test(value))throw new Error("Use complete http:// or https:// supporting links.");let url;try{url=new URL(value);}catch{throw new Error("Enter a valid supporting link.");}if(url.username||url.password||!url.hostname||url.href.length>2000)throw new Error("Supporting links must not contain login credentials.");return url.href;});
 return {title,description:text("description",5000)||null,contribution:text("contribution",5000)||null,results:text("results",5000)||null,skills:lines(form,"skills","Skills"),links:[...new Set(links)]};
}
