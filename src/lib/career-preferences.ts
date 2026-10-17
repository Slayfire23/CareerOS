export const WORK_ARRANGEMENTS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on_site", label: "On-site" },
] as const;
export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

export type CareerPreferences = {
  targetRoles: string[];
  industries: string[];
  workArrangements: string[];
  employmentTypes: string[];
};

export function lines(form: FormData, field: string, label: string): string[] {
  const values = form.getAll(field);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`Invalid ${label.toLowerCase()}. Reload the page and try again.`);
  }
  const raw = values[0];
  if (raw.length > 1100) throw new Error(`${label}: enter at most 10 items, each up to 100 characters.`);
  const items = raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (items.length > 10 || items.some((value) => value.length > 100)) {
    throw new Error(`${label}: enter at most 10 items, each up to 100 characters.`);
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function choices(form: FormData, field: string, options: readonly { value: string }[]): string[] {
  const values = form.getAll(field);
  if (values.length > options.length || values.some((value) =>
    typeof value !== "string" || !options.some((option) => option.value === value))) {
    throw new Error("Choose only the listed work preferences.");
  }
  return options.filter((option) => values.includes(option.value)).map((option) => option.value);
}

export function parseCareerPreferences(form: FormData): CareerPreferences {
  return {
    targetRoles: lines(form, "targetRoles", "Target roles"),
    industries: lines(form, "industries", "Industries"),
    workArrangements: choices(form, "workArrangements", WORK_ARRANGEMENTS),
    employmentTypes: choices(form, "employmentTypes", EMPLOYMENT_TYPES),
  };
}
