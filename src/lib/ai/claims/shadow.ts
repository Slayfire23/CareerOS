import type { MatchRequest } from "@/lib/ai/evidence";
import { arbitrate, proposedVerdict, withCuratedVerdict } from "@/lib/ai/claims/arbitrate";
import { extractClaims } from "@/lib/ai/claims/extract";
import { classifyRequirement } from "@/lib/ai/claims/frame";
import { semanticClaims, type Retrieve } from "@/lib/ai/claims/semantic";
import type { ShadowResult } from "@/lib/ai/claims/types";
import { validateClaims } from "@/lib/ai/claims/validate";
import { namesOfListedSkills } from "@/lib/ai/listed-skills";
import { listedTerms } from "@/lib/ai/requirement-structure";
import { assessRequirements } from "@/lib/ai/rules/engine";

// Runs beside the production engine and changes nothing about it. Only tests and the evaluation runner call
// this, and a test enforces that. Every result keeps the rules-only verdict a person sees today.

export async function shadowAssess(request: MatchRequest, retrieve: Retrieve | null = null): Promise<{ results: ShadowResult[]; invalidClaims: string[]; model: string | null }> {
  const rules = assessRequirements(request);
  const listed = listedTerms(namesOfListedSkills(request.evidence));
  const frames = request.requirements.map(r => classifyRequirement(r, listed));
  const semantic = await semanticClaims(request, frames, retrieve);
  const invalidClaims: string[] = [];
  const results = frames.map((frame): ShadowResult => {
    const rulesOnly = rules.find(f => f.requirement_index === frame.index)!.verdict;
    const deterministic = extractClaims(request, frame);
    const claims = [...deterministic, ...(semantic.byFrame.get(frame.index) ?? [])];
    invalidClaims.push(...validateClaims(claims, request.evidence));
    const withCurated = withCuratedVerdict(rulesOnly, frame, deterministic);
    return {
      frame,
      claims,
      rulesOnly,
      table: arbitrate(frame, deterministic, rulesOnly),
      withCurated,
      proposed: proposedVerdict(withCurated, frame, claims),
      semanticStatus: semantic.status,
    };
  });
  return { results, invalidClaims, model: semantic.model };
}
