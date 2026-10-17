export const SKILL_LEVELS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
] as const;
export type SkillLevel = typeof SKILL_LEVELS[number]["value"];
export type Skill = { id: string; name: string; proficiency: SkillLevel | null };

export function parseTechnicalSkill(form: FormData) {
  const names = form.getAll("name");
  const levels = form.getAll("proficiency");
  if (names.length !== 1 || typeof names[0] !== "string" || levels.length !== 1 || typeof levels[0] !== "string") {
    throw new Error("Enter a skill name and choose a listed proficiency level.");
  }
  const name = names[0].trim().replace(/\s+/g, " ");
  const normalizedName = name.toLowerCase();
  if (!name || name.length > 100 || normalizedName.length > 100) throw new Error("Skill names must contain 1–100 characters.");
  const level = levels[0];
  if (level !== "" && !SKILL_LEVELS.some((item) => item.value === level)) throw new Error("Choose a listed proficiency level or leave it unspecified.");
  return { name, normalizedName, proficiency: level === "" ? null : level as SkillLevel };
}
