import type { Evidence } from "@/lib/ai/evidence";
import type { ClaimSource, EvidenceClaim, SourceField } from "@/lib/ai/claims/types";

// A citation can't be fabricated here: the text is always re-read from the stored field by its offsets.

/** The stored value of one field, exactly as written. */
export function fieldValue(item: Evidence, field: SourceField, itemIndex: number | null): string | null {
  switch (item.kind) {
    case "skill": return field === "name" ? item.name : null;
    case "experience": return field === "job_title" ? item.job_title : field === "description" ? item.description : null;
    case "education": return field === "qualification" ? item.qualification : field === "field_of_study" ? item.field_of_study : field === "description" ? item.description : null;
    case "project":
      if (field === "skills") return itemIndex === null ? null : item.skills[itemIndex] ?? null;
      return field === "title" ? item.title : field === "description" ? item.description : field === "contribution" ? item.contribution : field === "results" ? item.results : null;
  }
}

/** True only when the claimed text is exactly what the stored field holds at those offsets. */
export function spanIsVerbatim(source: ClaimSource, evidence: Map<string, Evidence>): boolean {
  const item = evidence.get(source.evidenceId);
  if (!item || item.kind !== source.kind) return false;
  const value = fieldValue(item, source.field, source.itemIndex);
  if (value === null || !Number.isInteger(source.start) || !Number.isInteger(source.end) || source.start < 0 || source.end > value.length || source.start >= source.end) return false;
  return value.slice(source.start, source.end) === source.text;
}

/** The problems with a set of claims. Empty means every claim traces back to the profile, and a semantic
 * similarity sits only on a semantic claim. */
export function validateClaims(claims: EvidenceClaim[], evidence: Evidence[]): string[] {
  const byId = new Map(evidence.map(e => [e.id, e]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    if (seen.has(claim.claimId)) problems.push(`${claim.claimId}: duplicate id`);
    seen.add(claim.claimId);
    if (!spanIsVerbatim(claim.source, byId)) problems.push(`${claim.claimId}: span isn't verbatim`);
    if (claim.source.verification !== "self_reported") problems.push(`${claim.claimId}: only self-reported evidence exists`);
    const semantic = claim.relationship.kind === "semantic_candidate";
    if (semantic !== (claim.relationship.similarity !== null)) problems.push(`${claim.claimId}: similarity outside a semantic claim`);
    if (semantic && claim.validation.status === "valid") problems.push(`${claim.claimId}: a semantic claim can't be fully valid`);
    if (claim.validation.status === "rejected" && !claim.validation.rejectionReasons.length) problems.push(`${claim.claimId}: rejected with no reason`);
    if (claim.validation.status !== "rejected" && claim.validation.rejectionReasons.length) problems.push(`${claim.claimId}: reasons without a rejection`);
  }
  return problems;
}
