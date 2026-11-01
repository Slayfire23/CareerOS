import type { Evidence } from "@/lib/ai/evidence";

/** Names of every skill the profile lists, including project skills (for requirement parsing). */
export function namesOfListedSkills(evidence: Iterable<Evidence>): string[] {
  return [...evidence].flatMap(e => (e.kind === "skill" ? [e.name] : e.kind === "project" ? e.skills : []));
}
