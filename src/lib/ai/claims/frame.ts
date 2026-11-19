import { createHash } from "node:crypto";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { requiredMonths, skillLikeExperience, unquantifiedTime } from "@/lib/ai/match-validation";
import { parseRequirement } from "@/lib/ai/requirement-structure";
import { asksForCredential } from "@/lib/ai/rules/engine";
import { requiredSkillLevel } from "@/lib/ai/skill-relations";
import { qualificationText } from "@/lib/ai/untrusted-text";
import type { FrameKind, RequirementFrame } from "@/lib/ai/claims/types";

/** Reads a requirement with the engine's own functions, in the same order as its routing, and records
 * the answer. Deterministic, with no network. */
export function classifyRequirement(requirement: MatchRequirement, listed: ReadonlySet<string> = new Set()): RequirementFrame {
  const structure = parseRequirement(requirement.text, listed, requirement.confirmed === true);
  const text = qualificationText(requirement.text).trim();
  const months = requiredMonths(text);
  const unstated = unquantifiedTime(text);
  let kind: FrameKind;
  if (structure.needsReview || !text) kind = "not_assessable";
  else if (requirement.category === "Experience" && skillLikeExperience(text)) kind = "skill";
  else if (requirement.category !== "Experience" && asksForCredential(text)) kind = "credential";
  else if (requirement.category === "Experience") kind = months !== null || unstated ? "employment_duration" : "employment";
  else if (requirement.category === "Education") kind = "education";
  else kind = "skill";
  const level = requiredSkillLevel(text);
  return {
    requirementId: `req_${createHash("sha256").update(`${requirement.index}\u0000${requirement.text}`, "utf8").digest("hex").slice(0, 16)}`,
    index: requirement.index,
    text: requirement.text,
    qualificationText: text,
    kind,
    pieces: structure.pieces.length ? structure.pieces : text ? [structure.creditText || text] : [],
    requiredMonths: months,
    timeUnstated: unstated,
    level: level === 3 ? "advanced" : level === 2 ? "intermediate" : null,
  };
}
