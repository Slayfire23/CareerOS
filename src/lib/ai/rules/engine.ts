import {
  citableTexts,
  employmentMonths,
  formatYears,
  quoteIsVerbatim,
  roleMonths,
  type EducationEvidence,
  type Evidence,
  type ExperienceEvidence,
  type MatchRequest,
  type MatchRequirement,
  type ProjectEvidence,
  type SkillEvidence,
  type Verdict,
} from "@/lib/ai/evidence";
import { requiredMonths, skillLikeExperience, statedYears, type RuleBasis } from "@/lib/ai/match-validation";
import { listedTerms, parseRequirement, unverifiableField, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import {
  GENERIC_TERMS,
  VOCABULARY,
  asksForField,
  canonicalTerms,
  containsPhrase,
  degreeImplied,
  degreePhrases,
  describesUse,
  fieldMatches,
  hasQualificationWords,
  namesSameDegree,
  plainSkillName,
  quoteTerms,
  relation,
  surfaceForms,
} from "@/lib/ai/skill-relations";
import { fieldOfStudyForMatching, plainQualification, plainTitle } from "@/lib/ai/rules/profile-fields";
import { qualificationText } from "@/lib/ai/untrusted-text";

// The deterministic rules engine, and the only authority for final verdicts. It runs on the Next.js
// server with no network call, so it works with the AI service, Ollama, and the laptop all off.
//
// Deliberately conservative: "not enough information" is preferred to an unsupported positive claim.
// Keyword rules cannot prove a skill is absent, so skills never get "gap". They also cannot judge
// whether experience is relevant, so a years requirement that is met is "possible". A listed skill
// is "supported" only when the requirement names exactly that skill, or a name the reviewed table
// (rules/data/skill_relations.json) records as the same technology, and asks for no duration or
// credential. A related technology is at most "possible". Free text is at most "possible", and only
// when it describes the technology as used in work; a mention alone is not evidence.
//
// Job and profile text is untrusted: parts directed at an AI or reviewer are removed before matching.

export const RULES_VERSION = "rules-v6";

export const PROJECT_NOT_EMPLOYMENT = "Projects are not counted as professional employment.";
const PROJECT_MENTION = "Mentioned in a project, not listed as a skill.";
const PART_OF_LONGER_NAME = "Your listed skill appears inside a longer name here, which may be a different technology.";
const YEARS_PER_SKILL = "This asks for time with the skill; your profile does not record time per skill.";
const RELATED_TECHNOLOGY = "A related technology, not the same one. Check that it fits.";
const UNVERIFIABLE_FIELD = "Whether your field counts as related can't be confirmed automatically.";
const CREDENTIAL_NOT_SHOWN = "Listing a skill does not show the certification or license this asks for.";
const JUDGED_AS_SKILL = "This names a technology with no duration or role, so it was judged as a skill.";
const NEEDS_CONFIRMATION = "This requirement's wording reads partly like instructions or a judgment about how to evaluate it, so it was not assessed. Check it in the job review and confirm it if it is a real requirement; confirming it does not count as evidence that you meet it.";
const INSTRUCTIONS_IGNORED = "Part of this requirement reads like instructions to an AI or reviewer, or a claim about how it should be judged, so it was ignored. Check its wording in the job review.";
const INSTRUCTION_TEXT = "This requirement reads like instructions to an AI or reviewer rather than a qualification, so it was not assessed. Check its wording in the job review.";
const FIELD_NOT_USED = "Your field of study contains a remark or claim, so it wasn't used. Enter only the field's name.";
const QUALIFICATION_NOT_USED = "A listed qualification contains a remark, a claim, or wording that it isn't finished, so it wasn't counted as a completed degree.";
const NOT_FINISHED = "You list this as still in progress, so it isn't counted as a completed degree.";
const UNVERIFIED_EVIDENCE = "Some cited evidence could not be verified and was removed.";
const UNVERIFIED_DURATION = "A stated duration could not be verified against your listed employment.";

const notAllItems = (missing: string[]) =>
  `This asks for several things; your listed skills don't show ${missing.slice(0, 3).map(m => `“${m}”`).join("; ")}.`;

/** Words too generic to count as a match on their own. */
const GENERIC_WORDS = new Set(`a an and the or of in on to for with as such like using use including plus etc
year years month months experience experienced professional work working ability able
knowledge familiarity familiar proficiency proficient skill skills strong solid good excellent
understanding tools tool required preferred minimum must nice have having demonstrated proven
related relevant equivalent field degree team`.split(/\s+/));

const REQUIRED_LEVELS: [number, string, RegExp][] = [
  [3, "an expert or advanced", /\b(expert|advanced|in-depth|extensive|deep|senior|mastery)\b/i],
  [2, "an intermediate", /\b(intermediate|working knowledge|solid|strong)\b/i],
];
const PROFICIENCY_RANK: Record<string, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };
const PROFICIENCY_LABEL: Record<string, string> = { BEGINNER: "beginner", INTERMEDIATE: "intermediate", ADVANCED: "advanced" };

function requiredLevel(text: string): [number, string] | null {
  for (const [rank, label, pattern] of REQUIRED_LEVELS) if (pattern.test(text)) return [rank, label];
  return null;
}

const LEVEL_LABELS: Record<number, string> = { 4: "doctorate", 3: "master's", 2: "bachelor's", 1: "associate", 0: "high school" };
const LEVELS: [number, string, RegExp[]][] = [
  [4, "doctorate", [/\bph\.?\s?d\b/i, /\bd\.?\s?phil\b/i, /\bdoctorate\b/i, /\bdoctoral\b/i, /\bed\.?\s?d\b/i]],
  [3, "master's", [/\bmaster'?s?\b/i, /\bm\.?\s?s\.?(?=\s|$|,)/i, /\bm\.?\s?eng\b/i, /\bm\.?\s?sc\b/i, /\bm\.?\s?phil\b/i, /\bm\.?\s?res\b/i, /\bm\.?\s?ed\b/i, /\bmba\b/i, /\bm\.?\s?a\.?(?=\s|$|,)/i]],
  [2, "bachelor's", [/\bbachelor'?s?\b/i, /\bb\.?\s?s\.?(?=\s|$|,)/i, /\bb\.?\s?sc\b/i, /\bb\.?\s?a\.?(?=\s|$|,)/i, /\bb\.?\s?eng\b/i, /\bundergraduate degree\b/i]],
  [1, "associate", [/\bassociate'?s? degree\b/i, /\ba\.?\s?a\.?s\.?(?=\s|$|,)/i]],
  [0, "high school", [/\bhigh[\s-]school\b/i, /\bsecondary school\b/i, /\bged\b/i, /\bhs diploma\b/i]],
];

type Level = [number, string];
type Implied = [number, string, string];

/** Level, label, and field for degree names that imply them, such as "MBA" or "BSN". */
function implied(text: string): Implied[] {
  const found: Implied[] = [];
  const low = ` ${(text.toLowerCase().match(/[a-z]+/g) ?? []).join(" ")} `;
  for (const [phrase, info] of Object.entries(degreePhrases)) {
    if (low.includes(` ${phrase} `)) found.push([info.level, LEVEL_LABELS[info.level], info.field]);
  }
  for (const token of text.match(/[A-Za-z.]+/g) ?? []) {
    const info = degreeImplied[token.replaceAll(".", "").toLowerCase()];
    if (info) found.push([info.level, LEVEL_LABELS[info.level], info.field]);
  }
  return found;
}

const impliedField = (qualification: string) => implied(qualification).find(([, , field]) => field)?.[2] ?? null;
const compare = (a: readonly (number | string)[], b: readonly (number | string)[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};

/** The lowest degree level a requirement accepts ("Master's or PhD" -> master's). A degree with no
 * level named ("Degree in Mathematics") accepts any degree. */
function requiredDegreeRank(text: string): Level | null {
  const found: Level[] = LEVELS.filter(([, , patterns]) => patterns.some(p => p.test(text))).map(([rank, label]) => [rank, label]);
  for (const [rank, label] of implied(text)) found.push([rank, label]);
  if (!found.length) return /\bdegree\b/i.test(text) ? [1, "a degree"] : null;
  return found.sort(compare)[0];
}

function degreeRank(text: string): Level | null {
  for (const [rank, label, patterns] of LEVELS) if (patterns.some(p => p.test(text))) return [rank, label];
  const all = implied(text).sort(compare);
  return all.length ? [all[all.length - 1][0], all[all.length - 1][1]] : null;
}

export type RawCitation = { evidence_id: string; quote: string };
export type RawFinding = {
  requirement_index: number;
  verdict: Verdict;
  explanation: string;
  citations: RawCitation[];
  caveats: string[];
  review?: "needs_confirmation";
  basis: RuleBasis;
  method?: "rules";
};

const unique = <T,>(items: T[]) => [...new Set(items)];

function finding(
  requirement: MatchRequirement,
  verdict: Verdict,
  explanation: string,
  options: { citations?: RawCitation[]; caveats?: string[]; review?: "needs_confirmation"; basis?: RuleBasis } = {},
): RawFinding {
  return {
    requirement_index: requirement.index,
    verdict,
    explanation,
    citations: (options.citations ?? []).slice(0, 10),
    caveats: unique(options.caveats ?? []).slice(0, 5),
    ...(options.review && { review: options.review }),
    basis: options.basis ?? (options.review ? "needs_confirmation" : "no_evidence"),
  };
}

const isSkill = (e: Evidence): e is SkillEvidence => e.kind === "skill";
const isProject = (e: Evidence): e is ProjectEvidence => e.kind === "project";
const isRole = (e: Evidence): e is ExperienceEvidence => e.kind === "experience";
const isEducation = (e: Evidence): e is EducationEvidence => e.kind === "education";

function listed(request: MatchRequest): Set<string> {
  const names = [...request.evidence.filter(isSkill).map(s => s.name), ...request.evidence.filter(isProject).flatMap(p => p.skills)];
  return listedTerms(names.filter(plainSkillName));
}

/** The requirement names this skill exactly, or by a name the reviewed table records as the same
 * technology. Every specific word of the skill's name must be accounted for. */
function sameSkill(requirementText: string, name: string): boolean {
  if (!plainSkillName(name)) return false;
  const terms = canonicalTerms(name);
  if (containsPhrase(requirementText, name)) return true;
  const wanted = canonicalTerms(requirementText);
  return terms.size > 0 && [...terms].every(t => wanted.has(t));
}

const exactSkill = (requirementText: string, name: string) => plainSkillName(name) && containsPhrase(requirementText, name);

/** A specific word or two-word phrase found in both texts, quoted exactly as in the evidence. Parts
 * of the text aimed at an AI or reviewer are skipped, an ordinary-English word ("rust") needs a
 * technical word nearby, and a named technology must be described as used in work. */
function sharedTerm(requirementText: string, evidenceText: string): string | null {
  const directed = untrustedEvidenceSpans(evidenceText);
  const usable = (quote: string, start: number, end: number) => {
    if (directed.some(([s, e]) => s < end && start < e)) return false;
    if (!quoteTerms(quote, evidenceText).size) return false;
    const namesTechnology = [...canonicalTerms(quote)].some(t => VOCABULARY.has(t)) || /\p{Lu}/u.test(quote);
    return !namesTechnology || describesUse(evidenceText, quote);
  };
  const find = (phrase: string) => {
    const pattern = new RegExp(`(?<![A-Za-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "gi");
    for (const match of evidenceText.matchAll(pattern)) if (usable(match[0], match.index, match.index + match[0].length)) return match[0];
    return null;
  };

  // A name the reviewed table records as the same technology ("k8s" for Kubernetes).
  for (const term of canonicalTerms(requirementText)) {
    if (!VOCABULARY.has(term)) continue;
    for (const form of surfaceForms(term)) {
      const quote = find(form);
      if (quote) return quote;
    }
  }
  const tokens = requirementText.match(/[A-Za-z][A-Za-z0-9+#.&-]*/g) ?? [];
  for (const size of [2, 1]) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const window = tokens.slice(i, i + size);
      if (window.some(w => {
        const low = w.toLowerCase();
        return GENERIC_WORDS.has(low) || GENERIC_TERMS.has(low) || (w.length < 3 && !VOCABULARY.has(low));
      })) continue; // two-letter words only when they name a known technology ("Go")
      const phrase = window.join(" ");
      if (!containsPhrase(evidenceText, phrase)) continue;
      const quote = find(phrase);
      if (quote) return quote;
    }
  }
  return null;
}

function assessExperience(request: MatchRequest, requirement: MatchRequirement): RawFinding {
  const roles = request.evidence.filter(isRole);
  const caveats = request.evidence.some(isProject) ? [PROJECT_NOT_EMPLOYMENT] : [];
  const roleCitations = roles.map(r => ({ evidence_id: r.id, quote: r.job_title }));
  const needed = requiredMonths(requirement.text); // "3+ years", "two years", "2-3 years", "six months"

  if (!roles.length) return finding(requirement, "insufficient_information", "No professional employment is listed in your profile, so this cannot be assessed.", { caveats });
  if (needed !== null) {
    const amount = needed % 12 ? `${needed}-month` : `${needed / 12}-year`;
    const months = employmentMonths(request.evidence, request.as_of_month);
    const total = formatYears(months);
    if (months >= needed) {
      return finding(requirement, "possible", `Your listed employment totals ${total} years, which meets the ${amount} amount. Keyword rules cannot judge whether that experience is in the field this requirement means.`, { citations: roleCitations, caveats, basis: "employment_dates" });
    }
    return finding(requirement, "gap", `Your listed employment totals ${total} years, less than the ${amount} amount stated.`, { citations: roleCitations, caveats, basis: "employment_dates" });
  }
  const related: RawCitation[] = [];
  for (const role of roles) {
    // The requirement names this exact role ("Experience as a project manager").
    if (plainTitle(role.job_title) && !hasQualificationWords(requirement.text) && containsPhrase(requirement.text, role.job_title)) {
      related.push({ evidence_id: role.id, quote: role.job_title });
      continue;
    }
    for (const text of [role.job_title, role.description ?? ""]) {
      const quote = sharedTerm(requirement.text, text);
      if (quote) related.push({ evidence_id: role.id, quote });
    }
  }
  if (related.length) {
    return finding(requirement, "possible", "Some of your listed roles mention terms from this requirement. Check that they match what it asks for.", { citations: related, caveats, basis: "role_description" });
  }
  return finding(requirement, "insufficient_information", "None of your listed roles mention terms from this requirement.", { caveats });
}

function assessEducation(request: MatchRequest, requirement: MatchRequirement): RawFinding {
  const listedEntries = request.evidence.filter(isEducation);
  if (!listedEntries.length) return finding(requirement, "insufficient_information", "No education is listed in your profile, so this cannot be assessed.");
  // Typed fields are data: a qualification or field holding a remark or claim isn't evidence.
  const entries = listedEntries.filter(e => plainQualification(e.qualification));
  const notUsed = entries.length < listedEntries.length ? [QUALIFICATION_NOT_USED] : [];
  const wanted = requiredDegreeRank(requirement.text);
  const requiredFields = implied(requirement.text).map(([, , field]) => field).filter(Boolean);
  let best: { entry: EducationEvidence; fieldMatch: boolean } | null = null;
  const ranks: (number | null)[] = listedEntries.length > entries.length ? [null] : [];
  for (const entry of entries) {
    const level = degreeRank(entry.qualification);
    ranks.push(level ? level[0] : null);
    if (wanted && level && level[0] >= wanted[0]) {
      // A degree name can imply its field: an MBA is in business administration, on either side.
      const field = entry.field_of_study ? fieldOfStudyForMatching(entry.field_of_study) : impliedField(entry.qualification);
      const fieldMatch = !!field && (requiredFields.length ? requiredFields.some(f => fieldMatches(f, field)) : fieldMatches(requirement.text, field));
      if (!best || (fieldMatch && !best.fieldMatch)) best = { entry, fieldMatch };
    }
  }

  if (best) {
    const { entry, fieldMatch } = best;
    const citations: RawCitation[] = [{ evidence_id: entry.id, quote: entry.qualification }];
    const unverifiable = unverifiableField(requirement.text);
    const asksField = asksForField(requirement.text) || requiredFields.length > 0 || unverifiable;
    const sameDegree = namesSameDegree(requirement.text, entry.qualification);
    const fieldNotUsed = !!entry.field_of_study && !fieldOfStudyForMatching(entry.field_of_study);
    if (fieldNotUsed && asksField && !sameDegree) {
      return finding(requirement, "insufficient_information", "Your listed field of study couldn't be read as a field, so this cannot be assessed.", { caveats: [FIELD_NOT_USED, ...notUsed], basis: "education" });
    }
    // Still studying, or finishing after today: the level isn't earned yet.
    const finished = entry.end_month !== null && entry.end_month <= request.as_of_month;
    if ((fieldMatch || sameDegree || !asksField) && !finished) {
      return finding(requirement, "possible", `You list a ${wanted![1]} level qualification that isn't finished yet.`, { citations, caveats: [NOT_FINISHED, ...notUsed], basis: "education" });
    }
    if (fieldMatch) {
      const field = entry.field_of_study ? fieldOfStudyForMatching(entry.field_of_study) : impliedField(entry.qualification);
      if (entry.field_of_study) citations.push({ evidence_id: entry.id, quote: entry.field_of_study });
      return finding(requirement, "supported", `You list a ${wanted![1]} level qualification in ${field}.`, { citations, caveats: notUsed, basis: "education" });
    }
    if (sameDegree) return finding(requirement, "supported", `You list this ${wanted![1]} level degree.`, { citations, caveats: notUsed, basis: "education" });
    if (!asksField) {
      // Any field will do, and a higher degree meets a lower minimum.
      return finding(requirement, "supported", `You list a qualification at or above the ${wanted![1]} level this asks for.`, { citations, caveats: notUsed, basis: "education" });
    }
    return finding(requirement, "possible", `You list a ${wanted![1]} level qualification, but its field could not be matched to this requirement.`, { citations, caveats: [...(unverifiable ? [UNVERIFIABLE_FIELD] : []), ...notUsed], basis: "education" });
  }
  if (wanted && ranks.length && ranks.every(rank => rank !== null && rank < wanted[0])) {
    return finding(requirement, "gap", `This asks for a ${wanted[1]} degree; your listed qualifications are at a lower level.`, {
      citations: entries.map(e => ({ evidence_id: e.id, quote: e.qualification })),
      basis: "education",
    });
  }
  return finding(requirement, "insufficient_information", "Your listed education could not be compared with this requirement by keyword rules.", { caveats: notUsed });
}

/** Why a listed skill named in the requirement does not fully meet it (empty if it does). */
function skillCaveats(requirementText: string, matched: SkillEvidence[]): string[] {
  const caveats: string[] = [];
  const wanted = canonicalTerms(requirementText);
  // "React" inside "React Native": the words match, but the requirement names another technology.
  if (!matched.some(s => [...canonicalTerms(s.name)].every(t => wanted.has(t)))) caveats.push(PART_OF_LONGER_NAME);
  if (requiredMonths(requirementText) !== null) caveats.push(YEARS_PER_SKILL);
  if (hasQualificationWords(requirementText)) caveats.push(CREDENTIAL_NOT_SHOWN);
  return caveats;
}

function assessSkills(request: MatchRequest, requirement: MatchRequirement): RawFinding {
  // Only the requirement's head (and later clauses that state a need) can earn credit. Later text can
  // add mandatory items, never substitute for them. A skill name carrying a claim is never matched.
  const skills = request.evidence.filter(isSkill).filter(s => plainSkillName(s.name));
  const projectSkills = request.evidence.filter(isProject).flatMap(p => p.skills);
  const structure = parseRequirement(requirement.text, listedTerms([...skills.map(s => s.name), ...projectSkills]), true);
  const head = structure.creditText;
  const notes = structure.instructions.length ? [INSTRUCTIONS_IGNORED] : [];
  const matched = skills.filter(s => sameSkill(head, s.name));
  if (matched.length) {
    const missing = structure.pieces.filter(piece => !skills.some(s => sameSkill(piece, s.name)));
    const alternate = !matched.some(s => exactSkill(head, s.name));
    const basis: RuleBasis = alternate ? "alternate_name" : "listed_skill";
    const citations = matched.map(s => ({ evidence_id: s.id, quote: s.name }));
    const names = citations.map(c => c.quote).join(", ");
    const required = requiredLevel(requirement.text);
    let levelCaveat: string | null = null;
    if (required && !matched.some(s => (PROFICIENCY_RANK[s.proficiency ?? ""] ?? 0) >= required[0])) {
      // The skill is listed, but not at the level asked for (or no level was given).
      const rated = matched.filter(s => s.proficiency);
      levelCaveat = rated.length
        ? `You rated ${rated.map(s => `${s.name} as ${PROFICIENCY_LABEL[s.proficiency!]}`).join(", ")}; this requirement asks for ${required[1]} level.`
        : `No skill level is listed, so keyword rules cannot confirm ${required[1]} level.`;
    }
    if (levelCaveat) {
      return finding(requirement, "possible", `You list ${names} as a skill, but not at the level this requirement asks for.`, {
        citations, caveats: [levelCaveat, ...(missing.length ? [notAllItems(missing)] : []), ...notes], basis,
      });
    }
    if (missing.length) {
      return finding(requirement, "possible", `You list ${names} as a skill, but this requirement asks for more than that.`, { citations, caveats: [notAllItems(missing), ...notes], basis });
    }
    const caveats = skillCaveats(requirement.text, matched);
    if (caveats.length) {
      return finding(requirement, "possible", `You list ${names} as a skill, but that alone may not meet this requirement.`, { citations, caveats: [...caveats, ...notes], basis });
    }
    const explanation = alternate ? `You list ${names}, a known name for what this requirement asks for.` : `You list ${names} as a skill.`;
    return finding(requirement, "supported", explanation, { citations, caveats: notes, basis });
  }

  // A related technology from the reviewed table is a lead, never a match.
  const family = skills.filter(s => relation(head, s.name) === "related");
  if (family.length) {
    return finding(requirement, "possible", `You list ${family.map(s => s.name).join(", ")}, a related technology rather than the same one.`, {
      citations: family.map(s => ({ evidence_id: s.id, quote: s.name })),
      caveats: [RELATED_TECHNOLOGY, ...notes],
      basis: "related_technology",
    });
  }

  const related: RawCitation[] = [];
  const caveats: string[] = [];
  let projectOnly = true;
  for (const item of request.evidence) {
    if (isProject(item)) {
      const quotes = item.skills.filter(s => sameSkill(head, s));
      for (const text of [item.description, item.contribution, item.results]) {
        const quote = text && sharedTerm(head, text);
        if (quote) quotes.push(quote);
      }
      if (quotes.length) {
        for (const quote of unique(quotes)) related.push({ evidence_id: item.id, quote });
        caveats.push(PROJECT_MENTION);
      }
    } else if (isRole(item) && item.description) {
      const quote = sharedTerm(head, item.description);
      if (quote) {
        related.push({ evidence_id: item.id, quote });
        projectOnly = false;
      }
    }
  }
  if (related.length) {
    return finding(requirement, "possible", "This requirement's terms appear in your roles or projects, but not as a listed skill.", {
      citations: related, caveats: [...caveats, ...notes], basis: projectOnly ? "project" : "described_in_work",
    });
  }
  return finding(requirement, "insufficient_information", "No listed skill, role, or project mentions this requirement's terms. Keyword rules cannot tell whether you have it under a different name.", { caveats: notes });
}

function assess(request: MatchRequest, requirement: MatchRequirement, terms: Set<string>): RawFinding {
  // A requirement containing instructions or evaluation language is not judged until the person
  // confirms it. Otherwise only its qualification is judged.
  const structure = parseRequirement(requirement.text, terms, requirement.confirmed === true);
  if (structure.needsReview) return finding(requirement, "insufficient_information", NEEDS_CONFIRMATION, { review: "needs_confirmation" });
  const notes: string[] = [];
  let current = requirement;
  if (structure.instructions.length) {
    const text = qualificationText(requirement.text);
    if (!text) return finding(requirement, "insufficient_information", INSTRUCTION_TEXT);
    current = { ...requirement, text };
    notes.push(INSTRUCTIONS_IGNORED);
  }
  let result: RawFinding;
  if (current.category === "Experience" && skillLikeExperience(current.text)) {
    result = assessSkills(request, current);
    notes.push(JUDGED_AS_SKILL);
  } else if (current.category === "Experience") result = assessExperience(request, current);
  else if (current.category === "Education") result = assessEducation(request, current);
  else result = assessSkills(request, current);
  return notes.length ? { ...result, caveats: unique([...result.caveats, ...notes]).slice(0, 5) } : result;
}

function areaIsEmpty(request: MatchRequest, requirement: MatchRequirement): boolean {
  const employment = requirement.category === "Experience" && !skillLikeExperience(qualificationText(requirement.text));
  const kinds = employment ? ["experience"] : requirement.category === "Education" ? ["education"] : ["skill", "experience", "project"];
  return !request.evidence.some(e => kinds.includes(e.kind));
}

/** Rules every finding must obey, however it was produced: citations are verbatim, a positive verdict
 * has evidence, projects are never employment, and a stated duration is one code can verify. */
export function checkFinding(request: MatchRequest, requirement: MatchRequirement, f: RawFinding, evidence: Map<string, Evidence>): RawFinding {
  let verdict = f.verdict;
  let caveats = [...f.caveats];
  const citations = f.citations.filter(c => quoteIsVerbatim(evidence.get(c.evidence_id)!, c.quote));
  if (citations.length < f.citations.length) caveats.push(UNVERIFIED_EVIDENCE);
  if ((verdict === "supported" || verdict === "possible") && !citations.length) verdict = "insufficient_information";

  if (requirement.category === "Experience" && !skillLikeExperience(qualificationText(requirement.text))) {
    const cited = citations.map(c => evidence.get(c.evidence_id)!);
    if (cited.some(isProject)) caveats.push(PROJECT_NOT_EMPLOYMENT);
    if ((verdict === "supported" || verdict === "possible") && !cited.some(isRole)) {
      if (verdict === "supported") verdict = "possible";
      caveats.push(PROJECT_NOT_EMPLOYMENT);
    }
  }

  const allowed = new Set([
    ...statedYears(requirement.text),
    Number(formatYears(employmentMonths(request.evidence, request.as_of_month))),
    ...request.evidence.filter(isRole).map(r => Number(formatYears(roleMonths(r, request.as_of_month)))),
  ]);
  if (statedYears(f.explanation).some(y => !allowed.has(y))) {
    verdict = "insufficient_information";
    caveats.push(UNVERIFIED_DURATION);
  }
  if (verdict === "gap" && areaIsEmpty(request, requirement)) verdict = "insufficient_information";
  // "Supported" comes only from a clean listed skill or a clean qualification, whatever happened above.
  if (verdict === "supported" && !citations.some(c => {
    const item = evidence.get(c.evidence_id)!;
    return (item.kind === "skill" && plainSkillName(item.name) && c.quote === item.name)
      || (item.kind === "education" && plainQualification(item.qualification) && c.quote === item.qualification);
  })) {
    verdict = "insufficient_information";
    caveats.push(UNVERIFIED_EVIDENCE);
  }
  caveats = unique(caveats).slice(0, 5);
  return { ...f, verdict, citations, caveats };
}

/** Decide every requirement. Pure and synchronous: no network, no database, no clock. */
export function assessRequirements(request: MatchRequest): RawFinding[] {
  const evidence = new Map(request.evidence.map(e => [e.id, e]));
  const terms = listed(request);
  return request.requirements
    .map(requirement => {
      const result = checkFinding(request, requirement, assess(request, requirement, terms), evidence);
      for (const citation of result.citations) if (!citableTexts(evidence.get(citation.evidence_id)!).length) throw new Error("citation without citable text");
      return result;
    })
    .sort((a, b) => a.requirement_index - b.requirement_index);
}

const countVerdicts = (findings: RawFinding[]) => {
  const counts: Record<Verdict, number> = { supported: 0, possible: 0, gap: 0, insufficient_information: 0 };
  for (const f of findings) counts[f.verdict]++;
  return counts;
};

/** The engine's result in the service response format, so the same independent validator checks it. */
export function rulesResponse(request: MatchRequest, source: { provider: "rules" | "assisted"; model: string | null; methodVersion: string }) {
  const findings = assessRequirements(request).map(f => (source.provider === "assisted" ? { ...f, method: "rules" as const } : f));
  return {
    request_id: request.request_id,
    findings,
    verdict_counts: countVerdicts(findings),
    provider: source.provider,
    model: source.model,
    method_version: source.methodVersion,
    usage: null,
    provider_request_id: null,
  };
}
