export const RESUME_BUCKET = "careeros-resumes";
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export type ResumeFile = { key: string; name: string; size: number; uploadedAt: string };
export function validResumeKey(value: unknown): value is string {
 return typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}_[a-zA-Z0-9_-]{1,100}\.pdf$/.test(value);
}
export function resumeDisplayName(key: string) { return key.slice(37); }
export async function validateResume(form: FormData) {
 const files=form.getAll("resume");
 if(files.length!==1 || !(files[0] instanceof File))throw new Error("Choose one PDF resume.");
 const file=files[0];
 if(file.size===0 || file.size>MAX_RESUME_BYTES)throw new Error("Choose a nonempty PDF no larger than 2 MiB.");
 if(!/\.pdf$/i.test(file.name) || file.type!=="application/pdf")throw new Error("Only PDF files are supported.");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-" || !new TextDecoder().decode(bytes.slice(-1024)).includes("%%EOF"))throw new Error("This file does not appear to be a PDF. Export it as PDF and try again.");
 const stem=file.name.replace(/\.pdf$/i,"").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,100)||"resume";
 return {bytes,name:stem+".pdf"};
}
