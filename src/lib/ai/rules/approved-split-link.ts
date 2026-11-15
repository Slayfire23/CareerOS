import { APPROVED_SPLITS } from "@/lib/ai/rules/split-recognition";

// Phase 5.3 Stage E (owner decision E1): a job requirement is asked about part by part only when its wording is exactly
// the wording of one of the 33 owner-approved splits. Normalising covers only case, accents' composed forms,
// punctuation, spacing, and a leading "Experience with/in". Anything else fails closed: the requirement is asked as one
// whole requirement, as before. `questionKey` is never used here: it merges different splits (P1 with P8, P13 with
// P14), splits a requirement the owner kept whole, and splits single-part requirements.

export function normalizeRequirementWording(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'+#/]+/gu, " ")
    .trim()
    .replace(/^experience\s+(?:with|in)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_WORDING: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [id, split] of Object.entries(APPROVED_SPLITS)) {
    const key = normalizeRequirementWording(split.requirement);
    if (map.has(key)) throw new Error(`Two approved splits share one wording: ${map.get(key)} and ${id}`);
    map.set(key, id);
  }
  return map;
})();

export type LinkedSplit = { splitId: string; parts: readonly string[] };

/** The approved split this exact requirement wording belongs to, or null (ask it as one requirement). */
export function approvedSplitFor(requirementText: string): LinkedSplit | null {
  const id = BY_WORDING.get(normalizeRequirementWording(requirementText));
  return id ? { splitId: id, parts: APPROVED_SPLITS[id].parts } : null;
}
