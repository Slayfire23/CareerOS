import { createHash } from "node:crypto";
import type { Requirement } from "@/lib/job-requirements";

// Builds the request sent to the AI service from the owner's own, user-confirmed data.
// Data minimization: only what matching needs. Excluded: email, display name, headline, career
// goals, preferences, salary, location, company and institution names, project links, and resume text.

export type Verdict = "supported" | "possible" | "gap" | "insufficient_information";
export const VERDICTS: Verdict[] = ["supported", "possible", "gap", "insufficient_information"];
export type EvidenceKind = "skill" | "experience" | "education" | "project";

export type SkillEvidence = { id: string; kind: "skill"; name: string; proficiency: string | null };
/** `source`: this came from answering a question about a requirement. Absent means typed into the profile.
 * Either way it's self-reported: nothing here says anything was independently checked. */
export type AnswerSource = { source?: "clarification" };
export type ExperienceEvidence = { id: string; kind: "experience"; job_title: string; start_month: string; end_month: string | null; description: string | null } & AnswerSource;
export type EducationEvidence = { id: string; kind: "education"; qualification: string; field_of_study: string | null; start_month: string; end_month: string | null; description: string | null } & AnswerSource;
export type ProjectEvidence = { id: string; kind: "project"; title: string; description: string | null; contribution: string | null; results: string | null; skills: string[] };
export type Evidence = SkillEvidence | ExperienceEvidence | EducationEvidence | ProjectEvidence;

/** `confirmed`: the person confirmed in the job review that a flagged requirement is real (never evidence). */
export type MatchRequirement = { index: number; text: string; category: Requirement["category"]; priority: Requirement["priority"]; confirmed?: true };
/** "assisted" is the rules engine, the only authority for verdicts, plus local AI suggestions. "hybrid"
 * is retired: it let local AI raise a verdict. It remains so stored analyses still display. */
export type AnalysisProvider = "rules" | "anthropic" | "ollama" | "hybrid" | "assisted";
export type TokenBudget = { max_input_tokens: number; max_output_tokens: number };
export type MatchRequest = {
  request_id: string;
  provider: AnalysisProvider;
  /** Cloud providers only: the token bounds Next.js reserved budget for. */
  budget?: TokenBudget;
  as_of_month: string;
  requirements: MatchRequirement[];
  evidence: Evidence[];
};

export type EvidenceProfile = {
  technicalSkills: { id: string; name: string; proficiency: string | null }[];
  professionalExperiences: { id: string; jobTitle: string; startMonth: string; endMonth: string | null; description: string | null; clarifications?: { id: string; detail: string | null }[] }[];
  educationEntries: { id: string; qualification: string; fieldOfStudy: string | null; startMonth: string; endMonth: string | null; description: string | null; clarifications?: { id: string }[] }[];
  projects: { id: string; title: string; description: string | null; contribution: string | null; results: string | null; skills: string[] }[];
};

export const MAX_EVIDENCE = 200;
export const MAX_REQUIREMENTS = 50;

export class EvidenceError extends Error {
  constructor(public code: "profile_too_large" | "no_requirements") {
    super(code);
  }
}

const text = (value: string | null | undefined, max: number) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** Evidence for the AI service. IDs are `<kind>:<uuid>` using the profile entries' own IDs. */
export function buildEvidence(profile: EvidenceProfile): Evidence[] {
  const evidence: Evidence[] = [
    ...profile.technicalSkills.map((s): SkillEvidence => ({ id: `skill:${s.id}`, kind: "skill", name: s.name.trim(), proficiency: s.proficiency })),
    ...profile.professionalExperiences.map((e): ExperienceEvidence => ({
      id: `experience:${e.id}`, kind: "experience", job_title: e.jobTitle.trim(), start_month: e.startMonth, end_month: e.endMonth, description: text(e.description, 5000),
    })),
    // An answer about a role is its own entry with that role's title and dates, so the same rules read it,
    // time is never counted twice (overlaps merge), and its source stays separate from what the role says.
    ...profile.professionalExperiences.flatMap(e => (e.clarifications ?? []).filter(c => c.detail).map((c): ExperienceEvidence => ({
      id: `experience:${c.id}`, kind: "experience", job_title: e.jobTitle.trim(), start_month: e.startMonth, end_month: e.endMonth, description: text(c.detail, 1000), source: "clarification",
    }))),
    ...profile.educationEntries.map((e): EducationEvidence => ({
      id: `education:${e.id}`, kind: "education", qualification: e.qualification.trim(), field_of_study: text(e.fieldOfStudy, 200), start_month: e.startMonth, end_month: e.endMonth, description: text(e.description, 5000),
      ...(e.clarifications?.length ? { source: "clarification" as const } : {}),
    })),
    ...profile.projects.map((p): ProjectEvidence => ({
      id: `project:${p.id}`, kind: "project", title: p.title.trim(), description: text(p.description, 5000), contribution: text(p.contribution, 5000), results: text(p.results, 5000),
      skills: p.skills.map(s => s.trim()).filter(Boolean).slice(0, 10),
    })),
  ];
  if (evidence.length > MAX_EVIDENCE) throw new EvidenceError("profile_too_large");
  return evidence.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** SHA-256 of the evidence; a different value means the profile changed since an analysis. */
export function evidenceFingerprint(evidence: Evidence[]): string {
  return createHash("sha256").update(JSON.stringify(evidence), "utf8").digest("hex");
}

export function buildRequirements(requirements: Requirement[]): MatchRequirement[] {
  if (!requirements.length) throw new EvidenceError("no_requirements");
  return requirements.slice(0, MAX_REQUIREMENTS).map((r, index) => ({
    index, text: r.text, category: r.category, priority: r.priority, ...(r.confirmed ? { confirmed: true as const } : {}),
  }));
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// --- Deterministic helpers shared with response validation (mirror ai-service/app/matching) ---------

export function monthIndex(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}

/** A role's span in months, or null if its dates can't be right (end before start, starting in the
 * future, before 1950, or not a month). Time after the analysis date never counts. */
function roleSpan(role: ExperienceEvidence, asOf: string): [number, number] | null {
  const now = monthIndex(asOf);
  const start = monthIndex(role.start_month);
  const end = Math.min(monthIndex(role.end_month ?? asOf), now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || end < start || start < 1950 * 12) return null;
  return [start, end];
}

export function roleMonths(role: ExperienceEvidence, asOf: string): number {
  const span = roleSpan(role, asOf);
  return span ? span[1] - span[0] + 1 : 0;
}

/** Total months of listed employment, merging overlaps. Projects never count. */
export function employmentMonths(evidence: Evidence[], asOf: string): number {
  const spans = evidence
    .filter((e): e is ExperienceEvidence => e.kind === "experience")
    .map(e => roleSpan(e, asOf))
    .filter((span): span is [number, number] => span !== null)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of spans) {
    if (!current || start > current[1] + 1) {
      if (current) total += current[1] - current[0] + 1;
      current = [start, end];
    } else current[1] = Math.max(current[1], end);
  }
  if (current) total += current[1] - current[0] + 1;
  return total;
}

export function formatYears(months: number): string {
  return String(Math.round((months / 12) * 10) / 10);
}

export function citableTexts(item: Evidence): string[] {
  const fields =
    item.kind === "skill" ? [item.name]
    : item.kind === "experience" ? [item.job_title, item.description]
    : item.kind === "project" ? [item.title, item.description, item.contribution, item.results, ...item.skills]
    : [item.qualification, item.field_of_study, item.description];
  return fields.filter((f): f is string => !!f);
}

/** Where cited evidence came from. There's no "verified": CareerOS has no independent check of anything. */
export type EvidenceOrigin = "profile" | "candidate_answer";
export function citationOrigin(item: Evidence, quote: string): EvidenceOrigin {
  if (item.kind === "skill" || item.kind === "project" || item.source !== "clarification") return "profile";
  // An answer's entry repeats its role's title, which came from the profile.
  return item.kind === "experience" && quote === item.job_title ? "profile" : "candidate_answer";
}

export const MIN_QUOTE_CHARS = 3;

/** A short quote (under three characters) counts only as a whole field or a standalone word in one
 * ("services in Go"), never inside a word or compound ("go-kart"). Mirrors evidence.py. */
export function quoteIsVerbatim(item: Evidence, quote: string): boolean {
  const texts = citableTexts(item);
  if (quote.trim().length < MIN_QUOTE_CHARS) {
    if (!quote.trim()) return false;
    const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const standalone = new RegExp(`(?<![A-Za-z0-9+#.\\-])${escaped}(?![A-Za-z0-9+#\\-])`);
    return texts.includes(quote) || texts.some(t => standalone.test(t));
  }
  return texts.some(t => t.includes(quote));
}

// --- Relevance: a "supported" claim must cite something that mentions the requirement ----------
// Mirrors ai-service/app/matching/evidence.py (shares_term). Applied to language-model results.

export const RELEVANCE_STOPWORDS = new Set(`a an and the or of in on to for with as at by from such like using use including plus etc via
year years month months experience experienced professional work working ability able knowledge
familiarity familiar proficiency proficient skill skills strong solid good excellent understanding
tools tool required requirement preferred minimum must nice have having demonstrated proven related
relevant equivalent field team level expert expert-level advanced senior junior degree degrees`.split(/\s+/));
export const DEGREE_WORDS: Record<string, string> = {
  bs: "bachelor", ba: "bachelor", bsc: "bachelor", beng: "bachelor", bachelor: "bachelor",
  ms: "master", ma: "master", msc: "master", meng: "master", mba: "master", master: "master",
  phd: "doctorate", doctorate: "doctorate", doctoral: "doctorate",
};

function terms(text: string): Set<string> {
  const found = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}_+#.']+/gu) ?? []) {
    let token = raw.replace(/^[.']+|[.']+$/g, "");
    if (token.endsWith("'s")) token = token.slice(0, -2);
    token = token.replaceAll(".", "");
    token = DEGREE_WORDS[token] ?? token;
    if (token && !RELEVANCE_STOPWORDS.has(token)) found.add(token);
  }
  return found;
}

/** True when the quote mentions something specific from the requirement (see the Python version). */
export function sharesTerm(requirementText: string, quote: string): boolean {
  const found = [...terms(quote)];
  for (const a of terms(requirementText)) {
    for (const b of found) {
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      if (a === b || (short.length >= 4 && long.startsWith(short))) return true;
    }
  }
  return false;
}
