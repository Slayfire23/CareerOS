import {
  VERDICTS,
  employmentMonths,
  formatYears,
  quoteIsVerbatim,
  roleMonths,
  sharesTerm,
  type Evidence,
  type ExperienceEvidence,
  type MatchRequest,
  type Verdict,
} from "@/lib/ai/evidence";
import { parseProviderRequestId, parseUsage } from "@/lib/ai/client-parsing";
import { LOCAL_PROVIDERS } from "@/lib/ai/config";
import { PROFICIENCY_RANK, hasQualificationWords, looksLikeInstructions, relation, requiredSkillLevel } from "@/lib/ai/skill-relations";
import type { TokenUsage } from "@/lib/ai/pricing";

// Independent re-validation of the AI service's response. The service already enforces these
// rules, so any violation here means the response cannot be trusted: the whole result is rejected
// (never partially stored or shown).

export const PROJECT_NOT_EMPLOYMENT = "Projects are not counted as professional employment.";

export type Citation = { evidenceId: string; quote: string };
/** Hybrid analysis only: which method produced a finding, and what happened to local AI for it. */
export type FindingMethod = "rules" | "local_ai";
export type AiStatus = "accepted" | "not_eligible" | "not_needed" | "no_match" | "rejected" | "unavailable";
export const AI_STATUSES: AiStatus[] = ["accepted", "not_eligible", "not_needed", "no_match", "rejected", "unavailable"];
export type Finding = {
  requirementIndex: number;
  verdict: Verdict;
  explanation: string;
  citations: Citation[];
  caveats: string[];
  method?: FindingMethod;
  aiStatus?: AiStatus;
};
export type ValidatedMatch = {
  findings: Finding[];
  verdictCounts: Record<Verdict, number>;
  provider: string;
  model: string | null;
  methodVersion: string;
  usage: TokenUsage | null;
  providerRequestId: string | null;
};
/** The provider and model this request asked for; anything else is rejected. */
export type ExpectedSource = { provider: string; model: string | null };

export class MatchValidationError extends Error {
  constructor(reason: string) {
    super(`AI service response rejected: ${reason}`);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const reject = (reason: string): never => {
  throw new MatchValidationError(reason);
};
const str = (v: unknown, max: number, field: string, min = 1): string =>
  typeof v === "string" && v.trim().length >= min && v.length <= max ? v : reject(`invalid ${field}`);

const NUMBER_WORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
const YEARS = new RegExp(`\\b(\\d+(?:\\.\\d+)?|${NUMBER_WORDS.join("|")})\\s*\\+?\\s*(?:or more\\s+)?-?\\s*years?\\b`, "gi");

export function statedYears(text: string): number[] {
  return [...text.matchAll(YEARS)].map(m => {
    const raw = m[1].toLowerCase();
    const word = NUMBER_WORDS.indexOf(raw);
    return word >= 0 ? word : Number(raw);
  });
}

/** Local AI may only look at skill requirements, never hard qualifications (hybrid_checks.py). */
export function semanticEligible(requirement: MatchRequest["requirements"][number]): boolean {
  return (requirement.category === "Skills" || requirement.category === "Other")
    && statedYears(requirement.text).length === 0
    && !hasQualificationWords(requirement.text)
    && !looksLikeInstructions(requirement.text);
}

/** Re-check a local-AI finding from a hybrid analysis: how far its citations allow it to go. */
function checkLocalAiFinding(requirement: MatchRequest["requirements"][number], verdict: Verdict, citations: Citation[], evidence: Map<string, Evidence>) {
  if (!semanticEligible(requirement)) reject("local AI judged a requirement it may not judge");
  if (verdict !== "supported" && verdict !== "possible") reject("local AI may only add a match");
  const strengths = citations.map(c => {
    const item = evidence.get(c.evidenceId)!;
    if (item.kind === "education") reject("local AI cited education");
    return { item, quote: c.quote, strength: relation(requirement.text, c.quote) ?? reject("local AI cited unrelated evidence") };
  });
  if (verdict === "supported") {
    const needed = requiredSkillLevel(requirement.text);
    const proven = strengths.some(({ item, quote, strength }) =>
      item.kind === "skill" && quote === item.name && strength === "same" && (!needed || (PROFICIENCY_RANK[item.proficiency ?? ""] ?? 0) >= needed));
    if (!proven) reject("local AI supported claim is not a listed skill at the level asked for");
  }
}

function areaIsEmpty(request: MatchRequest, category: string): boolean {
  const kinds = category === "Experience" ? ["experience"] : category === "Education" ? ["education"] : ["skill", "experience", "project"];
  return !request.evidence.some(e => kinds.includes(e.kind));
}

export function validateMatchResponse(request: MatchRequest, raw: unknown, expected: ExpectedSource): ValidatedMatch {
  if (!isObject(raw)) reject("not an object");
  const body = raw as Record<string, unknown>;
  if (body.request_id !== request.request_id) reject("request id mismatch");
  const provider = str(body.provider, 40, "provider");
  if (provider !== expected.provider) reject(`provider ${provider} was not requested`);
  const model = body.model === null ? null : str(body.model, 100, "model");
  if (model !== expected.model) reject("model was not requested");
  const methodVersion = str(body.method_version, 60, "method_version");
  const usage = body.usage === null || body.usage === undefined ? null : parseUsage(body.usage) ?? reject("invalid usage");
  // A cloud result must report usage, or its cost could not be confirmed. Local results are free;
  // a hybrid result has none when local AI was never reached.
  if (!LOCAL_PROVIDERS.has(expected.provider) && !usage) reject("usage missing");
  const providerRequestId =
    body.provider_request_id === null || body.provider_request_id === undefined
      ? null
      : parseProviderRequestId(body.provider_request_id) ?? reject("invalid provider_request_id");
  if (!Array.isArray(body.findings)) reject("findings missing");

  const requirements = new Map(request.requirements.map(r => [r.index, r]));
  const evidence = new Map<string, Evidence>(request.evidence.map(e => [e.id, e]));
  const allowedYears = new Set<number>([
    Number(formatYears(employmentMonths(request.evidence, request.as_of_month))),
    ...request.evidence
      .filter((e): e is ExperienceEvidence => e.kind === "experience")
      .map(e => Number(formatYears(roleMonths(e, request.as_of_month)))),
  ]);

  const seen = new Set<number>();
  const findings = (body.findings as unknown[]).map((item): Finding => {
    if (!isObject(item)) reject("finding is not an object");
    const f = item as Record<string, unknown>;
    const index = f.requirement_index;
    if (typeof index !== "number" || !requirements.has(index) || seen.has(index)) reject("unknown or duplicate requirement index");
    seen.add(index as number);
    const requirement = requirements.get(index as number)!;
    const verdict = f.verdict as Verdict;
    if (!VERDICTS.includes(verdict)) reject("invalid verdict");
    const explanation = str(f.explanation, 1000, "explanation");
    if (!Array.isArray(f.citations) || f.citations.length > 10) reject("invalid citations");
    if (!Array.isArray(f.caveats) || f.caveats.length > 5) reject("invalid caveats");
    const caveats = (f.caveats as unknown[]).map(c => str(c, 300, "caveat"));

    const citations = (f.citations as unknown[]).map((c): Citation => {
      if (!isObject(c)) reject("citation is not an object");
      const cite = c as Record<string, unknown>;
      const item = evidence.get(cite.evidence_id as string);
      if (!item) reject("citation refers to evidence that was not sent");
      const quote = str(cite.quote, 300, "quote");
      if (!quoteIsVerbatim(item!, quote)) reject("quote is not verbatim from the cited entry");
      return { evidenceId: item!.id, quote };
    });

    if ((verdict === "supported" || verdict === "possible") && !citations.length) reject("verdict without evidence");
    // Hybrid results say which method produced each finding; no other provider may.
    let method: FindingMethod | undefined;
    let aiStatus: AiStatus | undefined;
    if (expected.provider === "hybrid") {
      method = f.method === "rules" || f.method === "local_ai" ? f.method : reject("hybrid finding without a method");
      aiStatus = AI_STATUSES.includes(f.ai_status as AiStatus) ? (f.ai_status as AiStatus) : reject("hybrid finding without a local AI status");
      if ((method === "local_ai") !== (aiStatus === "accepted")) reject("method and local AI status disagree");
      if (method === "local_ai") checkLocalAiFinding(requirement, verdict, citations, evidence);
    } else if (f.method !== undefined || f.ai_status !== undefined) {
      reject("method labels from a provider that may not set them");
    }
    // Language-model results only: a supported claim must cite evidence that mentions the requirement.
    if (!["rules", "hybrid"].includes(expected.provider) && verdict === "supported" && !citations.some(c => sharesTerm(requirement.text, c.quote))) {
      reject("supported claim cites evidence unrelated to the requirement");
    }
    if (requirement.category === "Experience") {
      const kinds = citations.map(c => evidence.get(c.evidenceId)!.kind);
      if (verdict === "supported" && !kinds.includes("experience")) reject("project or non-employment evidence used as employment");
      if (kinds.includes("project") && !caveats.includes(PROJECT_NOT_EMPLOYMENT)) reject("project cited without the employment caveat");
    }
    if (verdict === "gap" && areaIsEmpty(request, requirement.category)) reject("gap claimed for an empty profile area");

    const requirementYears = new Set(statedYears(requirement.text));
    for (const years of statedYears(explanation)) {
      // 0.05 tolerance absorbs rounding differences between Python and JavaScript.
      const known = requirementYears.has(years) || [...allowedYears].some(a => Math.abs(a - years) < 0.05);
      if (!known) reject("unverified duration in explanation");
    }
    return { requirementIndex: index as number, verdict, explanation, citations, caveats, ...(method && { method, aiStatus }) };
  });
  if (seen.size !== requirements.size) reject("a requirement has no finding");

  const verdictCounts = Object.fromEntries(VERDICTS.map(v => [v, findings.filter(f => f.verdict === v).length])) as Record<Verdict, number>;
  const reported = body.verdict_counts;
  if (!isObject(reported) || VERDICTS.some(v => reported[v] !== verdictCounts[v])) reject("verdict counts do not match findings");

  return {
    findings: findings.sort((a, b) => a.requirementIndex - b.requirementIndex),
    verdictCounts,
    provider,
    model,
    methodVersion,
    usage,
    providerRequestId,
  };
}
