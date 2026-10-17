export type Experience = { id: string; jobTitle: string; company: string; startMonth: string; endMonth: string | null; description: string | null };

export function experienceId(form: FormData): string {
  const values = form.getAll("experienceId");
  if (values.length !== 1 || typeof values[0] !== "string" || (values[0] !== "" && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(values[0]))) throw new Error("Invalid experience selection.");
  return values[0];
}

export function parseExperience(form: FormData) {
  function text(key: string, label: string, max: number, required = true) {
    const values = form.getAll(key);
    if (values.length !== 1 || typeof values[0] !== "string") throw new Error(`Invalid ${label}.`);
    const value = values[0].trim();
    if ((required && !value) || value.length > max) throw new Error(`Enter ${label} using ${required ? "1" : "0"}–${max} characters.`);
    return value;
  }
  const jobTitle = text("jobTitle", "job title", 100);
  const company = text("company", "company", 100);
  const startMonth = text("startMonth", "start month", 7);
  const current = form.getAll("current");
  if (current.length > 1 || (current.length === 1 && current[0] !== "on")) throw new Error("Invalid current employment selection.");
  const endMonth = current.length ? null : text("endMonth", "end month", 7);
  const month = /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/;
  if (!month.test(startMonth) || (endMonth !== null && !month.test(endMonth))) throw new Error("Enter valid months in YYYY-MM format.");
  if (endMonth !== null && endMonth < startMonth) throw new Error("End month cannot be before start month.");
  return { jobTitle, company, startMonth, endMonth, description: text("description", "responsibilities and accomplishments", 5000, false) || null };
}
