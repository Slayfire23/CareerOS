import type { Verdict } from "@/lib/ai/evidence";
import type { ArbitrationRule, EvidenceClaim, RequirementFrame } from "@/lib/ai/claims/types";

// The ordered table from the proposal: the first rule that applies decides. It reads validation and
// relationship only, never a similarity or a confidence.

const DIRECT = new Set(["exact", "alias", "curated_equivalent"]);
const hasReason = (claim: EvidenceClaim, reason: string) => claim.validation.rejectionReasons.includes(reason as never);
/** Only the candidate's own plain statement can show something isn't there. */
const statedByCandidate = (c: EvidenceClaim) => c.ownership.holder === "candidate" && !c.validation.rejectionReasons.some(r => r === "different_credential" || r === "credential_grade_differs" || r === "directed_text" || r === "keyword_dump" || r === "not_a_statement" || r === "claim_in_field" || r === "hidden_characters" || r === "other_sense" || r === "workplace_name");

export function arbitrate(frame: RequirementFrame, claims: EvidenceClaim[], rulesVerdict: Verdict): { verdict: Verdict; rule: ArbitrationRule } {
  if (frame.kind === "not_assessable") return { verdict: "insufficient_information", rule: "not_assessable" };
  // Education has its own proven logic, and no claim layer yet: the engine's answer stands.
  if (frame.kind === "education") return { verdict: rulesVerdict, rule: "deferred_to_rules" };

  const own = claims.filter(statedByCandidate);
  const positive = claims.filter(c => c.validation.status === "valid" && DIRECT.has(c.relationship.kind));
  if (!positive.length && own.some(c => hasReason(c, "negated"))) return { verdict: "gap", rule: "stated_absent" };
  if (!positive.length && own.some(c => hasReason(c, "credential_not_held"))) return { verdict: "gap", rule: "credential_not_held" };
  if (own.some(c => hasReason(c, "insufficient_time"))) return { verdict: "gap", rule: "too_little_time" };
  if (positive.length && own.some(c => hasReason(c, "negated") && c.relationship.target === positive[0].relationship.target)) return { verdict: "possible", rule: "conflict" };
  if (frame.pieces.length && frame.pieces.every(piece => positive.some(c => c.relationship.target === piece || frame.kind.startsWith("employment")))) {
    return { verdict: "supported", rule: "all_pieces_direct" };
  }
  // Sharing a word with what's asked ("CNC lathe" for "CNC milling") isn't a lead by itself.
  const lead = claims.some(c => c.validation.status === "needs_clarification" && !c.validation.checks.some(x => x.reason === "part_of_requirement"));
  if (lead || positive.length) return { verdict: "possible", rule: "partial_or_candidate" };
  return { verdict: "insufficient_information", rule: "nothing_settles" };
}

/** Rules plus reviewed curated names: a curated name can only add what the rules missed. A stated shortfall
 * from the rules always stands. */
export function withCuratedVerdict(rulesVerdict: Verdict, frame: RequirementFrame, claims: EvidenceClaim[]): Verdict {
  if (rulesVerdict === "supported" || rulesVerdict === "gap" || frame.kind === "not_assessable" || frame.kind === "education") return rulesVerdict;
  const curated = claims.filter(c => c.relationship.kind === "curated_equivalent" && c.validation.status === "valid");
  const allPieces = frame.pieces.length > 0 && frame.pieces.every(piece => curated.some(c => c.relationship.target === piece) || claims.some(c => c.relationship.target === piece && c.validation.status === "valid" && DIRECT.has(c.relationship.kind)));
  if (curated.length && allPieces && frame.requiredMonths === null && !frame.timeUnstated && !frame.level) return "supported";
  if (rulesVerdict === "insufficient_information" && claims.some(c => c.relationship.kind === "curated_related" && c.validation.status === "needs_clarification")) return "possible";
  return rulesVerdict;
}

/** The only thing semantic evidence can ever do, and only if separately approved: Not enough information
 * to Possible. It can't reach Supported, and it can't touch Not supported. */
export function proposedVerdict(base: Verdict, frame: RequirementFrame, claims: EvidenceClaim[]): Verdict {
  if (base !== "insufficient_information" || frame.kind !== "skill" && frame.kind !== "employment") return base;
  return claims.some(c => c.relationship.kind === "semantic_candidate" && c.validation.status === "needs_clarification") ? "possible" : base;
}
