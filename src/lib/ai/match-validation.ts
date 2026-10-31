import {
  VERDICTS,
  employmentMonths,
  formatYears,
  quoteIsVerbatim,
  roleMonths,
  type Evidence,
  type ExperienceEvidence,
  type MatchRequest,
  type Verdict,
} from "@/lib/ai/evidence";

// Independent re-validation of the AI service's response. The service already enforces these
// rules, so any violation here means the response cannot be trusted: the whole result is rejected
// (never partially stored or shown).

export const PROJECT_NOT_EMPLOYMENT = "Projects are not counted as professional employment.";

export type Citation = { evidenceId: string; quote: string };
export type Finding = { requirementIndex: number; verdict: Verdict; explanation: string; citations: Citation[]; caveats: string[] };
export type ValidatedMatch = { findings: Finding[]; verdictCounts: Record<Verdict, number>; provider: string; model: string | null; methodVersion: string };

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

function areaIsEmpty(request: MatchRequest, category: string): boolean {
  const kinds = category === "Experience" ? ["experience"] : category === "Education" ? ["education"] : ["skill", "experience", "project"];
  return !request.evidence.some(e => kinds.includes(e.kind));
}

export function validateMatchResponse(request: MatchRequest, raw: unknown, allowedProviders: readonly string[]): ValidatedMatch {
  if (!isObject(raw)) reject("not an object");
  const body = raw as Record<string, unknown>;
  if (body.request_id !== request.request_id) reject("request id mismatch");
  const provider = str(body.provider, 40, "provider");
  if (!allowedProviders.includes(provider)) reject(`provider ${provider} is not allowed`);
  const model = body.model === null ? null : str(body.model, 100, "model");
  const methodVersion = str(body.method_version, 40, "method_version");
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
    return { requirementIndex: index as number, verdict, explanation, citations, caveats };
  });
  if (seen.size !== requirements.size) reject("a requirement has no finding");

  const verdictCounts = Object.fromEntries(VERDICTS.map(v => [v, findings.filter(f => f.verdict === v).length])) as Record<Verdict, number>;
  const reported = body.verdict_counts;
  if (!isObject(reported) || VERDICTS.some(v => reported[v] !== verdictCounts[v])) reject("verdict counts do not match findings");

  return { findings: findings.sort((a, b) => a.requirementIndex - b.requirementIndex), verdictCounts, provider, model, methodVersion };
}
