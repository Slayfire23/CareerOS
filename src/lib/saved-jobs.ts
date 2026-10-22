export type SavedJobEntry = { id: string; title: string; company: string; postingUrl: string | null; description: string };

export function savedJobId(form: FormData) {
 const values = form.getAll("jobId");
 if (values.length !== 1 || typeof values[0] !== "string" || (values[0] !== "" && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(values[0]))) throw new Error("Invalid job selection.");
 return values[0];
}
export function parseSavedJob(form: FormData) {
 function text(key: string, label: string, max: number, required = true) {
  const values = form.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") throw new Error(`Invalid ${label}.`);
  const value = values[0].trim();
  if ((required && !value) || value.length > max) throw new Error(`Enter ${label} using ${required ? 1 : 0}–${max} characters.`);
  return value;
 }
 const title = text("title", "job title", 200);
 const company = text("company", "company", 200);
 const description = text("description", "job description", 30000);
 const postingUrl = text("postingUrl", "posting link", 2000, false);
 if (postingUrl) {
  let url: URL;
  try { url = new URL(postingUrl); } catch { throw new Error("Enter a complete http:// or https:// posting link."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) posting link without embedded credentials.");
 }
 return { title, company, description, postingUrl: postingUrl || null };
}
