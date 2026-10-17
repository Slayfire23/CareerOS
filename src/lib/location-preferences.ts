import { lines } from "@/lib/career-preferences";
export const RELOCATION_CHOICES = [{value:"yes",label:"Yes"},{value:"no",label:"No"},{value:"undecided",label:"Undecided"}] as const;
export type LocationPreferences = { preferredLocations: string[]; relocationWillingness: string | null; maxCommuteMinutes: number | null };
export function parseLocationPreferences(form: FormData): LocationPreferences {
  function single(key: string) {
    const values = form.getAll(key);
    if (values.length !== 1 || typeof values[0] !== "string") throw new Error("Invalid location preferences. Reload and try again.");
    return values[0].trim();
  }
  const relocation = single("relocationWillingness");
  if (relocation && !RELOCATION_CHOICES.some(choice => choice.value === relocation)) throw new Error("Choose a listed relocation option.");
  const commute = single("maxCommuteMinutes");
  if (commute && (!/^\d{1,3}$/.test(commute) || Number(commute) > 300)) throw new Error("Commute must be a whole number from 0 to 300 minutes.");
  return { preferredLocations: lines(form,"preferredLocations","Preferred locations"), relocationWillingness: relocation || null, maxCommuteMinutes: commute === "" ? null : Number(commute) };
}
