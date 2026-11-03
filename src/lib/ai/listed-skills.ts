import type { Evidence } from "@/lib/ai/evidence";
import { plainSkillName } from "@/lib/ai/skill-relations";

/** Names of every skill the profile lists, including project skills (for requirement parsing). A name
 * carrying a claim is not a skill. */
export function namesOfListedSkills(evidence: Iterable<Evidence>): string[] {
  return [...evidence].flatMap(e => (e.kind === "skill" ? [e.name] : e.kind === "project" ? e.skills : [])).filter(plainSkillName);
}
