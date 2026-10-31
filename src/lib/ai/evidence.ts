import { createHash } from "node:crypto";
import type { Requirement } from "@/lib/job-requirements";

// Builds the request sent to the AI service from the owner's own, user-confirmed data.
// Data minimization: only what matching needs. Excluded: email, display name, headline, career
// goals, preferences, salary, location, company and institution names, project links, and resume text.

export type Verdict = "supported" | "possible" | "gap" | "insufficient_information";
export const VERDICTS: Verdict[] = ["supported", "possible", "gap", "insufficient_information"];
export type EvidenceKind = "skill" | "experience" | "education" | "project";

export type SkillEvidence = { id: string; kind: "skill"; name: string; proficiency: string | null };
export type ExperienceEvidence = { id: string; kind: "experience"; job_title: string; start_month: string; end_month: string | null; description: string | null };
export type EducationEvidence = { id: string; kind: "education"; qualification: string; field_of_study: string | null; start_month: string; end_month: string | null; description: string | null };
export type ProjectEvidence = { id: string; kind: "project"; title: string; description: string | null; contribution: string | null; results: string | null; skills: string[] };
export type Evidence = SkillEvidence | ExperienceEvidence | EducationEvidence | ProjectEvidence;

export type MatchRequirement = { index: number; text: string; category: Requirement["category"]; priority: Requirement["priority"] };
export type AnalysisProvider = "rules" | "anthropic";
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
  professionalExperiences: { id: string; jobTitle: string; startMonth: string; endMonth: string | null; description: string | null }[];
  educationEntries: { id: string; qualification: string; fieldOfStudy: string | null; startMonth: string; endMonth: string | null; description: string | null }[];
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
    ...profile.educationEntries.map((e): EducationEvidence => ({
      id: `education:${e.id}`, kind: "education", qualification: e.qualification.trim(), field_of_study: text(e.fieldOfStudy, 200), start_month: e.startMonth, end_month: e.endMonth, description: text(e.description, 5000),
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
  return requirements.slice(0, MAX_REQUIREMENTS).map((r, index) => ({ index, text: r.text, category: r.category, priority: r.priority }));
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// --- Deterministic helpers shared with response validation (mirror ai-service/app/matching) ---------

export function monthIndex(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}

export function roleMonths(role: ExperienceEvidence, asOf: string): number {
  return monthIndex(role.end_month ?? asOf) - monthIndex(role.start_month) + 1;
}

/** Total months of listed employment, merging overlaps. Projects never count. */
export function employmentMonths(evidence: Evidence[], asOf: string): number {
  const spans = evidence
    .filter((e): e is ExperienceEvidence => e.kind === "experience")
    .map(e => [monthIndex(e.start_month), monthIndex(e.end_month ?? asOf)] as const)
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

export const MIN_QUOTE_CHARS = 3;

export function quoteIsVerbatim(item: Evidence, quote: string): boolean {
  const texts = citableTexts(item);
  if (quote.trim().length < MIN_QUOTE_CHARS) return texts.includes(quote);
  return texts.some(t => t.includes(quote));
}
