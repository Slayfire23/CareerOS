export const categories = ["Skills", "Experience", "Education", "Other"] as const;
export const priorities = ["Required", "Preferred", "Unspecified"] as const;
export type Requirement = { text: string; category: typeof categories[number]; priority: typeof priorities[number]; source: string };

// Conservative line-based suggestions, not a qualification assessment.
export function suggestRequirements(description: string): Requirement[] {
 const result: Requirement[] = [];
 let section: Requirement["priority"] | null = null;
 for (const raw of description.split(/\r?\n/)) {
  const source = raw.trim();
  const text = source.replace(/^[-*•]\s*/, "");
  if (/^(required(?: qualifications| skills)?|requirements|minimum qualifications):?$/i.test(text)) { section = "Required"; continue; }
  if (/^(preferred(?: qualifications| skills)?|nice to have):?$/i.test(text)) { section = "Preferred"; continue; }
  if (/^(qualifications|skills):?$/i.test(text)) { section = "Unspecified"; continue; }
  if (!text) continue;
  if (/^(responsibilities|benefits|about us|about the role|what we offer|duties):?$/i.test(text) || /:$/.test(text)) { section = null; continue; }
  if (!section && !/\b(required|must|preferred|minimum)\b/i.test(text)) continue;
  if (text.length > 1000 || result.some(row => row.text.toLowerCase() === text.toLowerCase())) continue;
  const preferred = /\b(preferred|nice to have)\b/i.test(text);
  const required = /\b(required|must|minimum)\b/i.test(text);
  const priority = /\b(not required|optional)\b/i.test(text) || (preferred && required) ? "Unspecified" : preferred ? "Preferred" : required ? "Required" : section ?? "Unspecified";
  const category = /\b(degree|diploma|bachelor|master|education)\b/i.test(text) ? "Education" : /\b(experience|years?|months?)\b/i.test(text) ? "Experience" : /\b(skill|proficien|knowledge|ability|familiar)/i.test(text) ? "Skills" : "Other";
  result.push({text, source, priority, category});
  if (result.length === 50) break;
 }
 return result;
}

export function validateRequirements(value: unknown, description?: string): Requirement[] {
 if (!Array.isArray(value) || value.length > 50) throw new Error("Review up to 50 requirements.");
 return value.map(row => {
  if (!row || typeof row !== "object" || typeof row.text !== "string" || !row.text.trim() || row.text.trim().length > 1000 || typeof row.source !== "string" || row.source.length > 2000 || !categories.includes(row.category) || !priorities.includes(row.priority)) throw new Error("Each requirement needs text, a valid category, and a priority.");
  if (description !== undefined && row.source && !description.includes(row.source)) throw new Error("A source excerpt no longer matches the description. Remove that row and add a corrected requirement.");
  return {text: row.text.trim(), category: row.category, priority: row.priority, source: row.source};
 });
}

export function parseRequirementReview(form: FormData) {
 function one(key: string, max: number) {
  const values = form.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string" || values[0].length > max) throw new Error("Invalid review. Reload and try again.");
  return values[0];
 }
 if (one("confirmed", 2) !== "on") throw new Error("Confirm that you reviewed the selected requirements.");
 const description = one("baseDescription", 30000);
 const version = one("reviewVersion", 12);
 if (!/^\d+$/.test(version) || !Number.isSafeInteger(Number(version)) || Number(version) > 2147483646) throw new Error("Invalid review version.");
 let value: unknown;
 try { value = JSON.parse(one("requirements", 160000)); } catch { throw new Error("Invalid requirements list."); }
 return {description, version: Number(version), requirements: validateRequirements(value, description)};
}
