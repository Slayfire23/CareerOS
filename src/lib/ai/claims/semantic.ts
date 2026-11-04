import { randomUUID } from "node:crypto";
import type { Evidence, MatchRequest } from "@/lib/ai/evidence";
import { check, checkAssertion, checkOwnership, screenText } from "@/lib/ai/claims/checks";
import { fieldsOf } from "@/lib/ai/claims/extract";
import { semanticGate } from "@/lib/ai/claims/language";
import type { EvidenceClaim, RequirementFrame, SourceField } from "@/lib/ai/claims/types";
import { citationOrigin } from "@/lib/ai/evidence";
import { canonicalTerms, isKnownTechnology, relation } from "@/lib/ai/skill-relations";

// Semantic retrieval, in shadow. The model never sees text that failed a check, and it returns only ids
// and scores, so it can't write a citation: code holds the offsets. Requirements about credentials,
// education, or an amount of time are never sent, so similarity can't touch them.

// Chosen on seen development data before the newest sealed split was opened: 8 recovered, 0 false promotions.
export const SIMILARITY_THRESHOLD = Number(process.env.M11_SIMILARITY_THRESHOLD ?? 0.66);
export const MAX_PASSAGES = 200;
export const TOP_K = 3;
const FREE_TEXT: ReadonlySet<SourceField> = new Set(["description", "contribution", "results"]);

export type Passage = { id: string; text: string; item: Evidence; field: SourceField; itemIndex: number | null; start: number; end: number };
export type Retrieve = (body: RetrieveRequest) => Promise<RetrieveResponse>;
export type RetrieveRequest = { request_id: string; queries: { id: string; text: string }[]; passages: { id: string; text: string }[]; top_k: number };
export type RetrieveResponse = { request_id: string; model: string; status: "used" | "unavailable"; scores: { query_id: string; passage_id: string; similarity: number }[] };

export const semanticAllowed = (frame: RequirementFrame) => (frame.kind === "skill" || frame.kind === "employment") && frame.requiredMonths === null && !frame.timeUnstated;

/** Sentences that passed screening, assertion, and ownership. Dates, education, and rejected text stay here. */
export function passagesFrom(request: MatchRequest, blocked: Partial<Record<string, number>> = {}): Passage[] {
  const passages: Passage[] = [];
  for (const item of request.evidence) {
    if (item.kind === "education") continue;
    for (const ref of fieldsOf(item)) {
      if (!FREE_TEXT.has(ref.field)) continue;
      for (const match of ref.value.matchAll(/[^.!?;\n]+/g)) {
        const trimmed = match[0].trim();
        if (trimmed.length < 8) continue;
        const start = match.index + match[0].indexOf(trimmed);
        const end = start + trimmed.length;
        if (screenText(ref.value, ref.field, start, end) || checkAssertion(ref.value, ref.field, start, end).reason || checkOwnership(ref.value, ref.field, start, end).holder !== "candidate") continue;
        const gate = semanticGate(trimmed);
        if (gate) {
          blocked[gate] = (blocked[gate] ?? 0) + 1;
          continue;
        }
        passages.push({ id: `p${passages.length}`, text: trimmed, item, field: ref.field, itemIndex: ref.itemIndex, start, end });
        if (passages.length >= MAX_PASSAGES) return passages;
      }
    }
  }
  return passages;
}

/** Same-family tools are different things: a passage naming one is never evidence for the other. */
export function namesDifferentThing(asked: string, passage: string): boolean {
  const wanted = [...canonicalTerms(asked)];
  return [...canonicalTerms(passage)].some(term => isKnownTechnology(term) && !wanted.includes(term) && relation(asked, term) === "related");
}

export type SemanticOutcome = { status: "used" | "unavailable" | "not_eligible"; byFrame: Map<number, EvidenceClaim[]>; model: string | null; blocked: Partial<Record<string, number>> };

/** Asks for candidates and makes each surviving one a claim at Possible at most. Any failure means no
 * candidates and nothing else changes. */
export async function semanticClaims(request: MatchRequest, frames: RequirementFrame[], retrieve: Retrieve | null, threshold = SIMILARITY_THRESHOLD): Promise<SemanticOutcome> {
  const eligible = frames.filter(semanticAllowed);
  const byFrame = new Map<number, EvidenceClaim[]>();
  const blocked: Partial<Record<string, number>> = {};
  if (!retrieve) return { status: "unavailable", byFrame, model: null, blocked };
  if (!eligible.length) return { status: "not_eligible", byFrame, model: null, blocked };
  const passages = passagesFrom(request, blocked);
  if (!passages.length) return { status: "not_eligible", byFrame, model: null, blocked };
  const requestId = randomUUID();
  let reply: RetrieveResponse;
  try {
    reply = await retrieve({ request_id: requestId, queries: eligible.map(f => ({ id: `q${f.index}`, text: f.qualificationText })), passages: passages.map(p => ({ id: p.id, text: p.text })), top_k: TOP_K });
  } catch {
    return { status: "unavailable", byFrame, model: null, blocked };
  }
  if (reply.request_id !== requestId || reply.status !== "used") return { status: "unavailable", byFrame, model: null, blocked };
  const passageById = new Map(passages.map(p => [p.id, p]));
  const frameById = new Map(eligible.map(f => [`q${f.index}`, f]));
  for (const score of reply.scores) {
    const frame = frameById.get(score.query_id);
    const passage = passageById.get(score.passage_id);
    if (!frame || !passage || typeof score.similarity !== "number" || !(score.similarity >= threshold) || score.similarity > 1.0001) continue;
    const different = namesDifferentThing(frame.qualificationText, passage.text);
    const list = byFrame.get(frame.index) ?? [];
    list.push(semanticClaim(frame, passage, score.similarity, reply.model, different));
    byFrame.set(frame.index, list);
  }
  return { status: "used", byFrame, model: reply.model, blocked };
}

function semanticClaim(frame: RequirementFrame, passage: Passage, similarity: number, model: string, different: boolean): EvidenceClaim {
  const reasons = different ? (["different_named_thing"] as const) : [];
  return {
    schemaVersion: "claim-v1",
    claimId: `sem_${frame.index}_${passage.id}`,
    requirementId: frame.requirementId,
    source: { evidenceId: passage.item.id, kind: passage.item.kind, field: passage.field, itemIndex: passage.itemIndex, start: passage.start, end: passage.end, text: passage.text, origin: citationOrigin(passage.item, passage.text), verification: "self_reported" },
    extracted: { type: "action", normalized: null },
    ownership: { holder: "candidate", cueSpan: null },
    assertion: { polarity: "positive", modality: "stated", cueSpan: null },
    time: { startMonth: null, endMonth: null, months: null, mergedMonths: null, dateQuality: "not_applicable" },
    relationship: { kind: "semantic_candidate", target: frame.qualificationText, sourceId: null, tableVersion: null, modelId: model, similarity },
    confidence: { level: different ? "low" : "medium", uncertainties: ["semantic_only"] },
    validation: { status: different ? "rejected" : "needs_clarification", checks: [check("semantic_scope", different ? "different_named_thing" : null)], rejectionReasons: [...reasons] },
  };
}
