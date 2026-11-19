import type { EvidenceClaim, RequirementFrame } from "@/lib/ai/claims/types";

/** A question quoting the person's own words, from a claim that's still open. Never from a rejected one,
 * and code writes every other word. Not shown to anyone yet: it's here to prove the span can carry it. */
export function spanQuestion(frame: RequirementFrame, claims: EvidenceClaim[]): { claimId: string; question: string } | null {
  const open = claims.filter(c => c.validation.status === "needs_clarification");
  const claim = open.find(c => c.relationship.kind === "semantic_candidate") ?? open[0];
  if (!claim) return null;
  return {
    claimId: claim.claimId,
    question: `Your profile says “${claim.source.text}”. Does that include this: “${frame.qualificationText}”? If so, say what you did in your own words.`,
  };
}
