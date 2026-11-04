import {
  VERDICTS,
  citationOrigin,
  employmentMonths,
  formatYears,
  quoteIsVerbatim,
  roleMonths,
  sharesTerm,
  type Evidence,
  type EvidenceOrigin,
  type ExperienceEvidence,
  type MatchRequest,
  type Verdict,
} from "@/lib/ai/evidence";
import { parseProviderRequestId, parseUsage } from "@/lib/ai/client-parsing";
import { LOCAL_PROVIDERS } from "@/lib/ai/config";
import { PROFICIENCY_RANK, hasQualificationWords, namesEmployment, relation, requiredSkillLevel, technologyTerms } from "@/lib/ai/skill-relations";
import { hasDirectedText, qualificationText, quoteInTrustedText } from "@/lib/ai/untrusted-text";
import { namesOfListedSkills } from "@/lib/ai/listed-skills";
import { listedTerms, parseRequirement, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import type { TokenUsage } from "@/lib/ai/pricing";

// Independent re-validation of the AI service's response. The service already enforces these
// rules, so any violation here means the response cannot be trusted: the whole result is rejected
// (never partially stored or shown).

export const PROJECT_NOT_EMPLOYMENT = "Projects are not counted as professional employment.";

export type Citation = { evidenceId: string; quote: string };
/** Hybrid analysis only: which method produced a finding, and what happened to local AI for it. */
export type FindingMethod = "rules" | "local_ai";
export type AiStatus = "accepted" | "not_eligible" | "contains_instructions" | "not_needed" | "no_match" | "rejected" | "unavailable";
export const AI_STATUSES: AiStatus[] = ["accepted", "not_eligible", "contains_instructions", "not_needed", "no_match", "rejected", "unavailable"];
/** Which deterministic rule decided a finding (shown as where the result came from). */
export type RuleBasis = "stated_absent" | "listed_skill" | "alternate_name" | "related_technology" | "described_in_work" | "project" | "employment_dates" | "role_description" | "education" | "no_evidence" | "needs_confirmation";
export const RULE_BASES: RuleBasis[] = ["stated_absent", "listed_skill", "alternate_name", "related_technology", "described_in_work", "project", "employment_dates", "role_description", "education", "no_evidence", "needs_confirmation"];
export type SuggestionKind = "alternate_name" | "related_technology" | "relevant_evidence" | "profile_gap";
/** An AI suggestion. Stored and shown apart from findings; it never changes a verdict. */
export type Suggestion = { requirementIndex: number; kind: SuggestionKind; text: string; citation: Citation | null; term: string | null; knownToRules: boolean };
export type AiAssist = "used" | "unavailable" | "not_needed";
export type Finding = {
  requirementIndex: number;
  verdict: Verdict;
  explanation: string;
  citations: Citation[];
  caveats: string[];
  method?: FindingMethod;
  aiStatus?: AiStatus;
  /** The requirement needs the person's confirmation in the job review before it is judged. */
  review?: "needs_confirmation";
  basis?: RuleBasis;
  /** Where the cited evidence came from, worked out here from the citations. Kept apart from the verdict.
   * Older stored findings don't have it, and all of it is self-reported. */
  evidenceSources?: EvidenceOrigin[];
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
const NUMBER = `\\d+(?:\\.\\d+)?|${NUMBER_WORDS.join("|")}`;
const YEAR_UNIT = "(?:years?|yrs?)";
const MONTH_UNIT = "(?:months?|mos?|mths?)";
const YEARS = new RegExp(`(?<![\\p{L}\\p{N}.])(${NUMBER})\\s*\\+?\\s*(?:or more\\s+)?-?\\s*${YEAR_UNIT}(?![\\p{L}\\p{N}])`, "giu");
/** The lower end of a range: "2-3 years", "two to three yrs". */
const YEAR_RANGE = new RegExp(`(?<![\\p{L}\\p{N}.])(${NUMBER})\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:${NUMBER})\\s*\\+?\\s*${YEAR_UNIT}(?![\\p{L}\\p{N}])`, "giu");
const MONTHS = new RegExp(`(?<![\\p{L}\\p{N}.])(${NUMBER})\\s*\\+?\\s*(?:or more\\s+)?-?\\s*${MONTH_UNIT}(?![\\p{L}\\p{N}])`, "giu");
/** One amount in two units: "2 yrs 6 mos", "2 years and 6 months". */
const YEARS_AND_MONTHS = new RegExp(`(?<![\\p{L}\\p{N}.])(${NUMBER})\\s*-?\\s*${YEAR_UNIT}\\.?(?:\\s*,|\\s+and)?\\s+(${NUMBER})\\s*-?\\s*${MONTH_UNIT}(?![\\p{L}\\p{N}])`, "giu");

const WORDED_YEARS: [RegExp, number][] = [
  [/\bhalf\s+a\s+decade\b/i, 5],
  [/(?<!half\s)\b(?:a|one)\s+decade\b/i, 10],
  [/\btwo\s+decades\b/i, 20],
  [/\bone\s+and\s+a\s+half\s+(?:years?|yrs?)\b/i, 1.5],
  [/\btwo\s+and\s+a\s+half\s+(?:years?|yrs?)\b/i, 2.5],
  [/\ba\s+couple\s+(?:of\s+)?(?:years?|yrs?)\b/i, 2],
  [/\b(?:a|an|one)\s+(?:full\s+)?(?:year|yr)\b/i, 1],
];
const numberValue = (raw: string) => {
  const word = NUMBER_WORDS.indexOf(raw.toLowerCase());
  return word >= 0 ? word : Number(raw);
};
// Full-width digits and similar are the same characters to a reader, so they are to the rules.
const plain = (text: string) => text.normalize("NFKC");

export function statedYears(text: string): number[] {
  const normalized = plain(text);
  const combined = [...normalized.matchAll(YEARS_AND_MONTHS)].map(m => numberValue(m[1]) + numberValue(m[2]) / 12);
  const rest = normalized.replace(YEARS_AND_MONTHS, " ");
  const found = [...combined, ...[...rest.matchAll(YEARS), ...rest.matchAll(YEAR_RANGE)].map(m => numberValue(m[1]))];
  for (const [pattern, years] of WORDED_YEARS) if (pattern.test(rest)) found.push(years);
  return found;
}

/** The shortest duration a requirement states, in months ("2-3 years" -> 24, "six months" -> 6). */
export function requiredMonths(text: string): number | null {
  const normalized = plain(text);
  const found = statedYears(normalized).map(y => Math.round(y * 12));
  found.push(...[...normalized.replace(YEARS_AND_MONTHS, " ").matchAll(MONTHS)].map(m => numberValue(m[1])));
  if (/\bhalf\s+a\s+year\b/i.test(normalized)) found.push(6);
  // "half a year" also reads as "a year" above; the shortest amount is the one meant.
  return found.length ? Math.min(...found) : null;
}

/** Asks for time without saying how much ("several years", "long tenure"), so no dates can settle it. */
const VAGUE_TIME = /\b(?:several|many|multiple|numerous|some|few|various)\s+(?:\w+\s+)?(?:years?|yrs?|decades?)\b|(?:^|[\s,(])years\s+of\b|\b(?:long|significant|extensive|lengthy)\s+tenure\b/i;
export const unquantifiedTime = (text: string) => requiredMonths(text) === null && VAGUE_TIME.test(plain(text));

/** "Experience with <technology>", with no duration, role, domain, or credential (requirement_text.py). */
export function skillLikeExperience(text: string): boolean {
  // "Experience as the administrator for Linux servers" asks about a role, not just a tool.
  return requiredMonths(text) === null && !unquantifiedTime(text) && !hasQualificationWords(text) && !namesEmployment(text) && !/\bas\s+(a|an|the)\b/i.test(text) && technologyTerms(text).size > 0;
}

/** Local AI may only look at skill requirements, never hard qualifications (hybrid_checks.py). */
export function semanticEligible(requirement: MatchRequest["requirements"][number]): boolean {
  const skill = requirement.category === "Skills" || requirement.category === "Other"
    || (requirement.category === "Experience" && skillLikeExperience(requirement.text));
  return skill
    && requiredMonths(requirement.text) === null
    && !hasQualificationWords(requirement.text)
    && !hasDirectedText(requirement.text);
}

/** Where a quote may come from: structured fields, or trusted parts of free text (returned). */
function quoteSource(item: Evidence, quote: string): { allowed: boolean; freeText: string | null } {
  if (item.kind === "skill") return { allowed: item.name.includes(quote), freeText: null };
  if (item.kind === "education") return { allowed: false, freeText: null };
  const [structured, free] = item.kind === "experience"
    ? [[item.job_title], [item.description]]
    : [[item.title, ...item.skills], [item.description, item.contribution, item.results]];
  if (structured.some(f => f.includes(quote))) return { allowed: true, freeText: null };
  const field = free.find(f => f && f.includes(quote) && quoteInTrustedText(f, quote, untrustedEvidenceSpans(f)));
  return field ? { allowed: true, freeText: field } : { allowed: false, freeText: null };
}

/** Re-check a local-AI finding from a hybrid analysis: how far its citations allow it to go. */
function checkLocalAiFinding(requirement: MatchRequest["requirements"][number], verdict: Verdict, citations: Citation[], evidence: Map<string, Evidence>) {
  if (!semanticEligible(requirement)) reject("local AI judged a requirement it may not judge");
  if (verdict !== "supported" && verdict !== "possible") reject("local AI may only add a match");
  // Judged only against the requirement's head and later required clauses (requirement_structure.py).
  const skills = [...evidence.values()].filter(e => e.kind === "skill");
  const structure = parseRequirement(requirement.text, listedTerms(namesOfListedSkills([...evidence.values()])), requirement.confirmed === true);
  if (structure.instructions.length || structure.needsReview) reject("local AI judged a requirement containing instructions or claims");
  // Only what the requirement requests (its head and listed alternatives) can make a citation relevant.
  const target = structure.creditText || requirement.text;
  const strengths = citations.map(c => {
    const item = evidence.get(c.evidenceId)!;
    if (item.kind === "education") reject("local AI cited education");
    const source = quoteSource(item, c.quote);
    if (!source.allowed) reject("local AI cited text directed at an AI or reviewer, or about the evaluation");
    return { item, quote: c.quote, strength: relation(target, c.quote, source.freeText) ?? reject("local AI cited unrelated evidence") };
  });
  if (verdict === "supported") {
    const needed = requiredSkillLevel(requirement.text);
    const proven = strengths.some(({ item, quote, strength }) =>
      item.kind === "skill" && quote === item.name && strength === "same" && (!needed || (PROFICIENCY_RANK[item.proficiency ?? ""] ?? 0) >= needed));
    if (!proven) reject("local AI supported claim is not a listed skill at the level asked for");
    // Every mandatory part needs a listed skill that is the same technology.
    const covered = structure.pieces.every(piece => skills.some(s => s.kind === "skill" && relation(piece, s.name) === "same"));
    if (!covered) reject("local AI supported a requirement whose mandatory parts are not all listed");
  }
}

/** Employment rules apply to real employment requirements, not "Experience with <technology>". */
const isEmployment = (requirement: MatchRequest["requirements"][number]) =>
  requirement.category === "Experience" && !skillLikeExperience(qualificationText(requirement.text));

function areaIsEmpty(request: MatchRequest, requirement: MatchRequest["requirements"][number]): boolean {
  const kinds = isEmployment(requirement) ? ["experience"] : requirement.category === "Education" ? ["education"] : ["skill", "experience", "project"];
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

  const listed = listedTerms(namesOfListedSkills(request.evidence));
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
    } else if (expected.provider === "assisted") {
      // Every verdict comes from the rules engine; local AI may only add suggestions.
      if (f.method !== "rules" || f.ai_status !== undefined) reject("an AI-assisted verdict must come from the rules engine");
      method = "rules";
    } else if (f.method !== undefined || f.ai_status !== undefined) {
      reject("method labels from a provider that may not set them");
    }
    const usesRules = ["rules", "hybrid", "assisted"].includes(expected.provider);
    if (f.basis !== undefined && (!usesRules || !RULE_BASES.includes(f.basis as RuleBasis))) reject("invalid rule basis");
    const basis = f.basis as RuleBasis | undefined;
    // Language-model results only: a supported claim must cite evidence that mentions the requirement.
    if (!usesRules && verdict === "supported" && !citations.some(c => sharesTerm(requirement.text, c.quote))) {
      reject("supported claim cites evidence unrelated to the requirement");
    }
    if (isEmployment(requirement)) {
      const kinds = citations.map(c => evidence.get(c.evidenceId)!.kind);
      if (verdict === "supported" && !kinds.includes("experience")) reject("project or non-employment evidence used as employment");
      if (kinds.includes("project") && !caveats.includes(PROJECT_NOT_EMPLOYMENT)) reject("project cited without the employment caveat");
    }
    if (verdict === "gap" && areaIsEmpty(request, requirement)) reject("gap claimed for an empty profile area");

    // A requirement that needs confirmation is never judged automatically, whatever produced it.
    const review = f.review === undefined || f.review === null ? undefined : f.review === "needs_confirmation" ? "needs_confirmation" as const : reject("invalid review flag");
    const needsReview = parseRequirement(requirement.text, listed, requirement.confirmed === true).needsReview;
    if (review && (verdict !== "insufficient_information" || citations.length)) reject("a requirement that needs confirmation was judged");
    if (needsReview && verdict === "supported") reject("supported verdict for a requirement that needs confirmation");
    if (needsReview && usesRules && !review) reject("a requirement that needs confirmation was not flagged");
    if (review && !needsReview) reject("review flag on a requirement that does not need confirmation");

    const months = requiredMonths(requirement.text);
    const requirementYears = new Set([...statedYears(requirement.text), ...(months === null ? [] : [months / 12])]);
    for (const years of statedYears(explanation)) {
      // 0.05 tolerance absorbs rounding differences between Python and JavaScript.
      const known = requirementYears.has(years) || [...allowedYears].some(a => Math.abs(a - years) < 0.05);
      if (!known) reject("unverified duration in explanation");
    }
    const evidenceSources = [...new Set(citations.map(c => citationOrigin(evidence.get(c.evidenceId)!, c.quote)))];
    return { requirementIndex: index as number, verdict, explanation, citations, caveats, ...(method && { method }), ...(aiStatus && { aiStatus }), ...(review && { review }), ...(basis && { basis }), evidenceSources };
  });
  if (seen.size !== requirements.size) reject("a requirement has no finding");

  const verdictCounts = Object.fromEntries(VERDICTS.map(v => [v, findings.filter(f => f.verdict === v).length])) as Record<Verdict, number>;
  const reported = body.verdict_counts;
  if (!isObject(reported) || VERDICTS.some(v => reported[v] !== verdictCounts[v])) reject("verdict counts do not match findings");

  // A service response can never carry suggestions: they are added separately, after saving (rules/suggestions.ts).
  if (body.suggestions !== undefined || body.ai_assist !== undefined) reject("suggestions in a verdict response");

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
