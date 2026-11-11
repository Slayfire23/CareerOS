import type { Evidence, MatchRequirement } from "@/lib/ai/evidence";

// Replaces known personal and company details in text before it is sent to a cloud AI provider.
// Structured fields already exclude names, companies, institutions, links, and contact details.
// In free text (descriptions, requirement wording) this replaces values from the user's own records
// (profile name, employers, schools, the job's company, account email) and patterns (email
// addresses, phone numbers, links). It cannot recognize other names (colleagues, clients, products,
// organizations not in the profile); the consent text says so.
// Citations quote the redacted text that was sent, so evidence validation still applies unchanged.

export type RedactionTerms = {
  names: string[]; // the profile display name
  companies: string[]; // employers from professional experience
  schools: string[]; // institutions from education
  employers: string[]; // the saved job's company
  emails: string[]; // the account email
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Ten or more digits with common separators; date ranges such as 2019-2023 have fewer digits.
const PHONE = /\+?\(?\d[\d\s().-]{8,}\d/g;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function termPatterns(terms: RedactionTerms): [RegExp, string][] {
  const entries: [string, string][] = [];
  const add = (values: string[], placeholder: string, splitWords = false) => {
    for (const raw of values) {
      const value = raw.trim();
      if (value.length < 2) continue;
      entries.push([value, placeholder]);
      // Parts of a personal name ("Jane", "Doe") are redacted too; short parts are skipped.
      if (splitWords) for (const part of value.split(/\s+/)) if (part.length >= 3) entries.push([part, placeholder]);
    }
  };
  add(terms.emails, "[email]");
  add(terms.names, "[name]", true);
  add(terms.companies, "[company]");
  add(terms.employers, "[employer]");
  add(terms.schools, "[school]");
  // Longest first, so "Acme Robotics Inc" wins over "Acme Robotics".
  entries.sort((a, b) => b[0].length - a[0].length);
  return entries.map(([value, placeholder]) => [new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`, "giu"), placeholder]);
}

export function redactText(text: string, patterns: [RegExp, string][]): string {
  let result = text.replace(EMAIL, "[email]").replace(LINK, "[link]");
  result = result.replace(PHONE, match => (match.replace(/\D/g, "").length >= 10 ? "[phone]" : match));
  for (const [pattern, placeholder] of patterns) result = result.replace(pattern, placeholder);
  return result;
}

export function redactForCloud(
  evidence: Evidence[],
  requirements: MatchRequirement[],
  terms: RedactionTerms,
): { evidence: Evidence[]; requirements: MatchRequirement[] } {
  const patterns = termPatterns(terms);
  const r = (value: string) => redactText(value, patterns);
  const rn = (value: string | null) => (value === null ? null : r(value));
  return {
    requirements: requirements.map(req => ({ ...req, text: r(req.text) })),
    evidence: evidence.map((item): Evidence => {
      switch (item.kind) {
        case "skill":
          return { ...item, name: r(item.name) };
        case "experience":
          return { ...item, job_title: r(item.job_title), description: rn(item.description) };
        case "education":
          return { ...item, qualification: r(item.qualification), field_of_study: rn(item.field_of_study), description: rn(item.description) };
        case "project":
          return {
            ...item, title: r(item.title), description: rn(item.description), contribution: rn(item.contribution), results: rn(item.results),
            skills: item.skills.map(r),
          };
      }
    }),
  };
}
