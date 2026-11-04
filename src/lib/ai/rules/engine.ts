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
import { requiredMonths, skillLikeExperience, statedYears, unquantifiedTime, type RuleBasis } from "@/lib/ai/match-validation";
import { listedTerms, parseRequirement, unverifiableField, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import {
  GENERIC_TERMS,
  VOCABULARY,
  asksForField,
  canonicalTerms,
  comparableDegrees,
  degreeNames,
  containsPhrase,
  degreeImplied,
  degreePhrases,
  describesUse,
  fieldMatches,
  hasOtherSenses,
  hasQualificationWords,
  isCredentialName,
  isTerminologyTerm,
  labelledList,
  otherSense,
  rolesForField,
  namesSameDegree,
  plainSkillName,
  activityEvidence,
  directUse,
  equivalentWhenAsked,
  negatedSpans,
  occurrences,
  ordinaryMeaning,
  quoteTerms,
  relatedTermInText,
  saysAbsent,
  sentenceAt,
  relation,
  surfaceForms,
  words,
} from "@/lib/ai/skill-relations";
import { belowDegree, educationStatus, fieldOfStudyForMatching, fullRoleTitle, hasCredentialMarker, plainCredentialName, plainQualification, plainTitle, rolePart, saysNotCompleted, workplaceWords, type EducationStatus } from "@/lib/ai/rules/profile-fields";
import { qualificationText, quoteInTrustedText } from "@/lib/ai/untrusted-text";

// The deterministic rules engine, and the only authority for final verdicts. It runs on the Next.js
// server with no network call, so it works with the AI service, Ollama, and the laptop all off.
//
// The four verdicts and what each one takes (docs/MILESTONE_9_REPORT.md has the full thresholds):
// - Supported: direct evidence of what's asked. A listed skill, or a name the reviewed table records as
//   the same; a role stating the technology was used in the work; a completed degree at the level and in
//   the field; a credential listed as held; or roles in the field covering the time asked for.
// - Possible: plausible but not direct. A related technology, a related job, a project, a mention of real
//   use with something missing, a degree still in progress, or a foreign degree with no exact counterpart.
// - Not supported: the profile shows it isn't met. Too few years in the field, a lower degree, one the
//   entry says wasn't completed, or an explicit statement such as "No Photoshop". An omission is never this.
// - Not enough information: nothing settles it, including anything ambiguous, disguised, or manipulated.
//
// Job and profile text is untrusted: parts directed at an AI or reviewer are removed before matching.

export const RULES_VERSION = "rules-v11";

export const PROJECT_NOT_EMPLOYMENT = "Projects are not counted as professional employment.";
const PROJECT_MENTION = "Mentioned in a project, not listed as a skill.";
const PART_OF_LONGER_NAME = "Your listed skill appears inside a longer name here, which may be a different technology.";
const YEARS_PER_SKILL = "This asks for time with the skill; your profile does not record time per skill.";
const RELATED_TECHNOLOGY = "A related technology, not the same one. Check that it fits.";
const UNVERIFIABLE_FIELD = "Whether your field counts as related can't be confirmed automatically.";
const CREDENTIAL_NOT_SHOWN = "Listing a skill does not show the certification or license this asks for.";
const JUDGED_AS_SKILL = "This names a technology with no duration or role, so it was judged as a skill.";
const TIME_NOT_STATED = "This asks for time without saying how much, so your dates can't settle it.";
const NEEDS_CONFIRMATION = "This requirement's wording reads partly like instructions or a judgment about how to evaluate it, so it was not assessed. Check it in the job review and confirm it if it is a real requirement; confirming it does not count as evidence that you meet it.";
const INSTRUCTIONS_IGNORED = "Part of this requirement reads like instructions to an AI or reviewer, or a claim about how it should be judged, so it was ignored. Check its wording in the job review.";
const INSTRUCTION_TEXT = "This requirement reads like instructions to an AI or reviewer rather than a qualification, so it was not assessed. Check its wording in the job review.";
const UNREADABLE_DATES = "Check the dates on your listed roles.";
const FIELD_NOT_USED = "Your field of study contains a remark or claim, so it wasn't used. Enter only the field's name.";
const QUALIFICATION_NOT_USED = "A listed qualification contains a remark, a claim, or wording that it isn't finished, so it wasn't counted as a completed degree.";
const NOT_FINISHED = "You list this as still in progress, so it isn't counted as a completed degree.";
const OTHER_SENSE = "This word can name something else in a requirement like this one. Check that it means what you list.";
const CREDENTIAL_SELF_LISTED = "You list this credential yourself; an employer may ask to see it.";
const NOT_COMPLETED_NOTE = "Your entry says this wasn't completed, so it isn't counted as a degree.";
const STATUS_UNKNOWN = "Check that this entry says plainly whether the degree was awarded.";
const EQUIVALENCE_NOT_VERIFIED = "This degree has no exact counterpart in the requirement, and equivalence can't be confirmed automatically.";
const UNVERIFIED_EVIDENCE = "Some cited text couldn't be found in your profile and was removed.";
const UNVERIFIED_DURATION = "A stated duration doesn't match your listed employment.";

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

/** A degree whose level is standard though it's named differently ("B.Tech", "M.Tech"). All-caps "BE"
 * and "ME" count only as written, so "be" and "me" in a sentence never do. */
const compact = (text: string) => text.toLowerCase().replace(/[.\s]/g, "");
function namedDegreeRank(text: string): Level | null {
  if (/\bB\.?E\.?(?=\s|$|,)/.test(text)) return [2, LEVEL_LABELS[2]];
  if (/\bM\.?E\.?(?=\s|$|,)/.test(text)) return [3, LEVEL_LABELS[3]];
  for (const token of text.split(/[\s,/(]+/)) {
    const level = degreeNames[compact(token)];
    if (level !== undefined) return [level, LEVEL_LABELS[level]];
  }
  return null;
}

/** A foreign degree with no exact counterpart: a level it may be comparable to. */
function comparableRank(text: string): Level | null {
  const low = text.toLowerCase();
  const names = Object.entries(comparableDegrees).sort((a, b) => b[0].length - a[0].length);
  for (const [name, level] of names) {
    if (new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "iu").test(low)) return [level, LEVEL_LABELS[level]];
  }
  return null;
}

function degreeRank(text: string): Level | null {
  for (const [rank, label, patterns] of LEVELS) if (patterns.some(p => p.test(text))) return [rank, label];
  const all = implied(text).sort(compare);
  if (all.length) return [all[all.length - 1][0], all[all.length - 1][1]];
  return namedDegreeRank(text);
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

const GRADE = /\b(class|type|level|series|grade|tier|category)\s*[-:]?\s*([a-z0-9]{1,4})\b/gi;
const RANK = /\b(associate|professional|expert|master|journeyman|apprentice|practitioner|foundational|fundamentals|specialty|universal)\b/gi;
/** The two name different grades of the same thing: CDL Class A and Class B, Series 6 and 7, Associate and
 * Professional. Only what's asked can differ: a listing that names no grade says nothing either way. */
function gradeDiffers(asked: string, listed: string): boolean {
  const grades = (text: string) => new Map([...text.matchAll(GRADE)].map(m => [m[1].toLowerCase(), m[2].toLowerCase()]));
  const have = grades(listed);
  for (const [key, value] of grades(asked)) if (have.has(key) && have.get(key) !== value) return true;
  const ranks = (text: string) => new Set((text.match(RANK) ?? []).map(r => r.toLowerCase()));
  const wanted = ranks(asked);
  const held = ranks(listed);
  return held.size > 0 && wanted.size > 0 && ![...wanted].some(r => held.has(r));
}

/** The requirement names this skill exactly, or by a name the reviewed table records as the same
 * technology. Every specific word of the skill's name must be accounted for. */
function sameSkill(requirementText: string, name: string): boolean {
  if (!plainSkillName(name) || gradeDiffers(requirementText, name)) return false;
  const terms = canonicalTerms(name);
  // "SWIFT payment messaging" isn't the Swift language, though the word is the same.
  if ([...terms].some(t => otherSense(requirementText, t) !== otherSense(name, t))) return false;
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
    const sentence = evidenceText.slice(evidenceText.slice(0, start).search(/[^.!?;\n]*$/), end + (evidenceText.slice(end).search(/[.!?;\n]|$/)));
    // The same word in another sense on either side: only a match when both mean the other thing.
    const senses = [...canonicalTerms(quote)].filter(hasOtherSenses);
    if (senses.some(t => otherSense(requirementText, t) !== otherSense(sentence, t))) return false;
    if (senses.length && senses.every(t => otherSense(requirementText, t))) return true;
    if ([...canonicalTerms(quote)].some(t => ordinaryMeaning(evidenceText, t))) return false;
    if (!quoteTerms(quote, evidenceText).size) return false;
    // A capital that only starts a sentence doesn't make a name when the requirement writes it in lower case.
    const startsSentence = /(^|[.!?;\n]\s*)$/.test(evidenceText.slice(0, start));
    const plainNoun = startsSentence && requirementText.includes(quote.toLowerCase()) && !/\p{Lu}/u.test(quote.slice(1));
    const namesTechnology = [...canonicalTerms(quote)].some(t => VOCABULARY.has(t)) || (/\p{Lu}/u.test(quote) && !plainNoun);
    // "Tools: Tableau, Excel" says what was around: a lead, though not direct use.
    return !namesTechnology || describesUse(evidenceText, quote, start) || labelledList(sentence);
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
  // An occupational name is one thing: "point of sale" says nothing about the word "point" on its own.
  let remainder = requirementText;
  for (const term of canonicalTerms(requirementText)) {
    if (!isTerminologyTerm(term)) continue;
    for (const form of surfaceForms(term)) {
      if (form.includes(" ")) remainder = remainder.replace(new RegExp(`(?<![A-Za-z0-9])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "gi"), " ");
    }
  }
  const tokens = remainder.match(/[A-Za-z][A-Za-z0-9+#.&-]*/g) ?? [];
  for (const size of [2, 1]) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const window = tokens.slice(i, i + size);
      if (window.some(w => {
        const low = w.toLowerCase();
        return GENERIC_WORDS.has(low) || GENERIC_TERMS.has(low) || (w.length < 3 && !VOCABULARY.has(low));
      })) continue; // two-letter words only when they name a known technology ("Go")
      const phrase = window.join(" ");
      // Either number of a plain noun: "contract review" and "vendor contracts".
      const plainNoun = /^[A-Za-z][a-z ]*[a-z]$/.test(phrase) && !window.some(w => VOCABULARY.has(w.toLowerCase()));
      for (const form of plainNoun ? [phrase, `${phrase}s`] : [phrase]) {
        if (!containsPhrase(evidenceText, form)) continue;
        const quote = find(form);
        if (quote) return quote;
      }
    }
  }
  return null;
}

/** Words in an experience requirement that don't say which field it means. */
const NOT_A_FIELD = new Set(`a an and at or of in on to for with as the by from least minimum plus more over
year years yr yrs month months mo mos mth mths decade decades couple half exp min experience experienced professional relevant related prior previous
total overall combined progressive solid strong proven demonstrated hands-on work working role roles
position positions job jobs career field domain background including post-graduate industry
must have having required preferred ideally be is are you your our we will need needs acting act
users customers clients
environment environments setting settings fast paced dynamic company companies startup startups`.split(/\s+/));
/** Too broad to name a field when something more specific is present ("backend development"). */
const BROAD = new Set(`development developing developer developers engineering engineer engineers programming
administration administrator analysis analyst support supporting software systems services operations
management manager managing leading lead team teams`.split(/\s+/));

/** A word's stem, so "nursing" meets "Nurse" and "welding" meets "Welder". */
function stem(word: string): string {
  // An engineer's work isn't an engine's.
  if (/^engineer/.test(word)) return "engineer";
  let result = word;
  for (let i = 0; i < 2; i++) {
    const next = result.replace(/(ations?|ments?|ings?|ers?|ors?|ants?|ists?|ies|ed|es|e|s)$/, "");
    if (next.length < 3) break;
    result = next;
  }
  return result;
}
/** The same first five letters ("analytics" and "Analyst"): related, but not proof of the same field. */
const sameRoot = (a: string, b: string) => a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);

/** The clause stating the duration, without the amount: what the years must relate to. */
function durationField(text: string): { technologies: string[]; rest: string[]; stems: string[]; allStems: string[]; roles: ReturnType<typeof rolesForField>; asRole: string[] } {
  // "Experience with AWS and 3+ years of DevOps work": the years belong to DevOps.
  const clauses = text.split(/[:;.\n]\s|\s+and\s+(?=\S*\s*\d|\w+\s+(?:years?|yrs?))/);
  const clause = clauses.find(c => requiredMonths(c) !== null) ?? text;
  const technologies = [...canonicalTerms(clause)].filter(t => VOCABULARY.has(t));
  const all = words(clause).filter(w => !NOT_A_FIELD.has(w) && !/^\d/.test(w) && !NUMBER_WORD.test(w));
  const specific = all.filter(w => !BROAD.has(w));
  const named = new Set(technologies.flatMap(t => surfaceForms(t).flatMap(form => words(form))));
  const stems = [...new Set((specific.length ? specific : all).map(stem))];
  // "As a project manager" names a role, so every word of it counts: a coordinator isn't a manager.
  const role = clause.match(/\bas\s+(?:an?|the)\s+(.+?)(?=\s+(?:for|at|with|in|on|of|who|that)\b|[,.;:]|$)/i)?.[1] ?? "";
  const asRole = words(role).filter(w => !ROLE_ADJECTIVES.has(w)).map(stem);
  return { technologies, rest: [...new Set(specific.filter(w => !named.has(w)).map(stem))], stems, allStems: [...new Set(all.map(stem))], roles: rolesForField(clause), asRole };
}
const ROLE_ADJECTIVES = new Set("practicing licensed senior junior experienced professional working lead full-time part-time".split(" "));
const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/;

/** Job nouns that take their field from the word before them: "Accounting Clerk", "Welding Technician". */
const GENERIC_JOB = new Set(`manager supervisor director lead head chief foreman specialist technician tech assistant aide clerk officer
representative rep associate consultant agent analyst engineer developer programmer administrator dba instructor teacher trainer
driver operator mechanic worker attendant inspector planner estimator installer repairer`.split(/\s+/));
const JOB_MODIFIER = new Set("sales store shift floor senior staff".split(" "));
/** The title's head says the field: its last word names it, or a generic job noun follows a word that does. */
function headShowsField(field: ReturnType<typeof durationField>, part: string): boolean {
  const tokens = words(part.replace(/\([^)]*\)/g, " ")).filter(w => !/^(i|ii|iii|iv|jr|sr|\d+)$/.test(w));
  const head = tokens[tokens.length - 1];
  if (!head) return false;
  const named = (w: string | undefined) => !!w && field.allStems.includes(stem(w));
  if (named(head)) return true;
  if (!GENERIC_JOB.has(head)) return false;
  // "Retail Sales Associate", "Retail Store Manager": these words say where in the field, not another job.
  let before = tokens.length - 2;
  while (before > 0 && JOB_MODIFIER.has(tokens[before])) before--;
  return named(tokens[before]);
}

/** How a job title covers the field. Only what the person did counts: an aide at a nursing home isn't
 * nursing. When the requirement is about the setting itself, working there is a lead, never proof. */
function titleCoverage(field: ReturnType<typeof durationField>, title: string): "full" | "some" | "none" {
  const part = rolePart(title);
  const found = fieldCoverage(field, part);
  // A pharmacy delivery driver drives; a nurse recruiter recruits. The field has to be the job itself.
  if (found === "full" && !field.technologies.length && !field.roles.some(r => r.same.some(t => containsPhrase(part, t))) && !headShowsField(field, part)) return "some";
  if (found !== "none" || part === title) return found;
  return workplaceWords(title).map(stem).some(w => field.stems.includes(w)) ? "some" : "none";
}

/** How well a text names the field: "full" when most of it is named, "some" for part of it. */
function fieldCoverage(field: ReturnType<typeof durationField>, text: string): "full" | "some" | "none" {
  // A look-alike title: an account manager's job isn't accounting.
  if (field.roles.some(r => r.not?.some(title => containsPhrase(text, title)))) return "none";
  // The reviewed titles for this field: a same title covers it; a related one is only ever a lead.
  if (field.roles.some(r => r.same.some(title => containsPhrase(text, title)))) return "full";
  const base = namedCoverage(field, text);
  const stems = words(text).map(stem);
  if (base === "full" && !field.asRole.every(w => stems.includes(w))) return "some";
  if (base !== "none") return base;
  return field.roles.some(r => r.related.some(title => containsPhrase(text, title))) ? "some" : "none";
}

function namedCoverage(field: ReturnType<typeof durationField>, text: string): "full" | "some" | "none" {
  const stems = words(text).map(stem);
  const exact = (t: string) => stems.includes(t);
  const near = (t: string) => stems.some(h => sameRoot(t, h));
  if (field.technologies.length) {
    const have = canonicalTerms(text);
    const hits = field.technologies.filter(t => have.has(t) || t.split(" ").every(w => exact(stem(w)))).length;
    // "Cloud security": being a cloud engineer shows only half of what's asked.
    if (hits === field.technologies.length) return field.rest.every(exact) ? "full" : "some";
    return hits || field.rest.some(exact) ? "some" : "none";
  }
  const hits = field.stems.filter(exact).length;
  if (hits >= 1 && hits === field.stems.length) return "full";
  if (hits >= 2 && hits / field.stems.length >= 0.6) return "full";
  return hits || field.stems.some(near) ? "some" : "none";
}

function assessExperience(request: MatchRequest, requirement: MatchRequirement): RawFinding {
  const roles = request.evidence.filter(isRole);
  const caveats = request.evidence.some(isProject) ? [PROJECT_NOT_EMPLOYMENT] : [];
  const needed = requiredMonths(requirement.text); // "3+ years", "two years", "2-3 years", "six months"

  if (!roles.length) return finding(requirement, "insufficient_information", "No professional employment is listed in your profile, so this cannot be assessed.", { caveats });
  if (needed !== null) {
    const amount = needed % 12 ? `${needed}-month` : `${needed / 12}-year`;
    const asOf = request.as_of_month;
    // "4 years in supply chain or logistics": the best of the alternatives.
    const alternatives = requirement.text.split(/\s+or\s+(?!more\b|above\b|greater\b|longer\b|equivalent\b)/i);
    const options = alternatives.length > 1 && requiredMonths(alternatives[0]) !== null
      ? alternatives.map((part, i) => durationField(i ? `${amount} ${part}` : part))
      : [durationField(requirement.text)];
    const field = options[0];
    const combine = (found: ("full" | "some" | "none")[]) => (found.includes("full") ? "full" : found.includes("some") ? "some" : "none");
    const coverage = (text: string) => combine(options.map(o => fieldCoverage(o, text)));
    const titleCovers = (title: string) => combine(options.map(o => titleCoverage(o, title)));
    // Dates that can't be right say nothing about time, in any field.
    if (roles.every(r => roleMonths(r, asOf) === 0)) {
      return finding(requirement, "insufficient_information", "Your listed role dates can't be right, so this cannot be assessed.", { caveats: [UNREADABLE_DATES, ...caveats] });
    }
    // Asks only for time ("3+ years of experience"): all employment counts, but relevance can't be judged.
    if (!field.technologies.length && !field.stems.length && !field.rest.length) {
      const roleCitations = roles.map(r => ({ evidence_id: r.id, quote: r.job_title }));
      const months = employmentMonths(request.evidence, asOf);
      const total = formatYears(months);
      if (months >= needed) {
        return finding(requirement, "possible", `Your listed employment totals ${total} years, which meets the ${amount} amount. Keyword rules cannot judge whether that experience is in the field this requirement means.`, { citations: roleCitations, caveats, basis: "employment_dates" });
      }
      return finding(requirement, "gap", `Your listed employment totals ${total} years, less than the ${amount} amount stated.`, { citations: roleCitations, caveats, basis: "employment_dates" });
    }
    // Years must be in the field asked for: time in an unrelated job doesn't count toward it.
    const usable = (role: ExperienceEvidence) => plainTitle(role.job_title);
    const trustedText = (r: ExperienceEvidence) => {
      if (!r.description) return "";
      let text = "";
      let cursor = 0;
      for (const [s, e] of untrustedEvidenceSpans(r.description)) {
        if (s >= cursor) text += `${r.description.slice(cursor, s)} `;
        cursor = Math.max(cursor, e);
      }
      return text + r.description.slice(cursor);
    };
    // Technologies the role states it used count like the title naming them; a job title alone can't
    // show a technology, and a description can't show a whole non-technical field.
    const usedInRole = (r: ExperienceEvidence) => options.some(o => o.technologies.length > 0 && coverage(`${usable(r) ? rolePart(r.job_title) : ""}. ${trustedText(r)}`) === "full"
      && o.technologies.every(t => canonicalTerms(usable(r) ? rolePart(r.job_title) : "").has(t) || surfaceForms(t).some(form => directUse(trustedText(r), form))));
    const named = roles.filter(r => (usable(r) && fullRoleTitle(r.job_title) && titleCovers(r.job_title) === "full") || usedInRole(r));
    const describes = (r: ExperienceEvidence) => {
      if (!r.description) return false;
      const spans = untrustedEvidenceSpans(r.description);
      let trusted = "";
      let cursor = 0;
      for (const [s, e] of spans) {
        if (s >= cursor) trusted += r.description.slice(cursor, s) + " ";
        cursor = Math.max(cursor, e);
      }
      trusted += r.description.slice(cursor);
      return !!sharedTerm(requirement.text, r.description) || options.some(o => o.roles.some(x => x.related.some(t => containsPhrase(trusted, t))));
    };
    const partly = roles.filter(r => !named.includes(r) && ((usable(r) && titleCovers(r.job_title) !== "none") || describes(r)));
    const cite = (list: ExperienceEvidence[]) => list.map(r => ({ evidence_id: r.id, quote: r.job_title }));
    const credential = hasQualificationWords(requirement.text);
    if (named.length) {
      if (employmentMonths(named, asOf) >= needed) {
        if (credential) return finding(requirement, "possible", `Your roles in this field cover the ${amount} amount, but that doesn't show the credential this asks for.`, { citations: cite(named), caveats: [CREDENTIAL_NOT_SHOWN, ...caveats], basis: "employment_dates" });
        return finding(requirement, "supported", `Your listed roles as ${unique(named.map(r => r.job_title)).join(", ")} cover the ${amount} amount.`, { citations: cite(named), caveats, basis: "employment_dates" });
      }
      if (employmentMonths([...named, ...partly], asOf) >= needed && partly.length) {
        return finding(requirement, "possible", `Your roles in this field, together with related ones, may cover the ${amount} amount.`, { citations: cite([...named, ...partly]), caveats, basis: "employment_dates" });
      }
      return finding(requirement, "gap", `Your listed roles in this field total less than the ${amount} amount stated.`, { citations: cite(named), caveats, basis: "employment_dates" });
    }
    if (partly.length) {
      if (employmentMonths(partly, asOf) >= needed) {
        return finding(requirement, "possible", `Some of your roles may relate to this, and together they cover the ${amount} amount. Check that they are in the field it means.`, { citations: cite(partly), caveats, basis: "employment_dates" });
      }
      return finding(requirement, "gap", `The roles of yours that may relate to this total less than the ${amount} amount stated.`, { citations: cite(partly), caveats, basis: "employment_dates" });
    }
    // Even all of it together wouldn't be enough, whichever field it was in.
    if (employmentMonths(roles, asOf) < needed) {
      return finding(requirement, "gap", `All your listed employment together is less than the ${amount} amount stated.`, { citations: cite(roles), caveats, basis: "employment_dates" });
    }
    return finding(requirement, "insufficient_information", "None of your listed roles show the field this asks for, so time in other jobs wasn't counted toward it.", { caveats });
  }
  // No amount of time: a role naming the field, or stating the technologies were used, shows it.
  const field = durationField(requirement.text);
  const credential = hasQualificationWords(requirement.text);
  const trusted = (r: ExperienceEvidence) => {
    if (!r.description) return "";
    const spans = untrustedEvidenceSpans(r.description);
    return spans.length ? "" : r.description;
  };
  const shown = roles.filter(r => {
    if (!plainTitle(r.job_title) || !fullRoleTitle(r.job_title) || credential || (!field.technologies.length && !field.stems.length)) return false;
    if (titleCoverage(field, r.job_title) === "full" && !field.technologies.length) return true;
    return field.technologies.length > 0 && fieldCoverage(field, `${rolePart(r.job_title)}. ${trusted(r)}`) === "full"
      && field.technologies.every(t => canonicalTerms(rolePart(r.job_title)).has(t) || surfaceForms(t).some(form => directUse(trusted(r), form)));
  });
  // "Several years of welding": the role shows the field, but no dates can settle an unstated amount.
  if (shown.length && unquantifiedTime(requirement.text)) {
    return finding(requirement, "possible", `Your role as ${unique(shown.map(r => r.job_title)).join(", ")} is in this field, but this doesn't say how much time it asks for.`, { citations: shown.map(r => ({ evidence_id: r.id, quote: r.job_title })), caveats: [TIME_NOT_STATED, ...caveats], basis: "role_description" });
  }
  if (shown.length) {
    return finding(requirement, "supported", `Your role as ${unique(shown.map(r => r.job_title)).join(", ")} shows this.`, { citations: shown.map(r => ({ evidence_id: r.id, quote: r.job_title })), caveats, basis: "role_description" });
  }
  const related: RawCitation[] = [];
  for (const role of roles) {
    // The requirement names this exact role ("Experience as a project manager").
    if (plainTitle(role.job_title) && !hasQualificationWords(requirement.text) && containsPhrase(requirement.text, role.job_title)) {
      related.push({ evidence_id: role.id, quote: role.job_title });
      continue;
    }
    for (const text of [plainTitle(role.job_title) ? rolePart(role.job_title) : "", role.description ?? ""]) {
      const quote = text && sharedTerm(requirement.text, text);
      if (quote) related.push({ evidence_id: role.id, quote });
    }
    // Working in the setting a requirement names is a lead ("Hospital experience": a housekeeper at one).
    if (plainTitle(role.job_title) && !related.some(c => c.evidence_id === role.id) && titleCoverage(field, role.job_title) === "some" && rolePart(role.job_title) !== role.job_title) {
      related.push({ evidence_id: role.id, quote: role.job_title });
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
  const asOf = request.as_of_month;
  // Typed fields are data: a qualification holding a remark or claim isn't evidence. Below-degree
  // training stays usable: it can show that a degree isn't there.
  const plain = listedEntries.filter(e => plainQualification(e.qualification) || saysNotCompleted(e.qualification));
  const notUsed = plain.length < listedEntries.length ? [QUALIFICATION_NOT_USED] : [];
  const wanted = requiredDegreeRank(requirement.text);
  const requiredFields = implied(requirement.text).map(([, , field]) => field).filter(Boolean);
  const unverifiable = unverifiableField(requirement.text);
  const asksField = asksForField(requirement.text) || requiredFields.length > 0 || unverifiable;

  type Candidate = { entry: EducationEvidence; level: Level | null; comparable: boolean; status: EducationStatus; fieldMatch: boolean; fieldNotUsed: boolean; sameDegree: boolean; below: boolean };
  const candidates: Candidate[] = plain.map(entry => {
    const named = degreeRank(entry.qualification);
    const below = !named && belowDegree(entry.qualification);
    const known = below ? null : named;
    const comparable = known ? null : comparableRank(entry.qualification);
    const level = known ?? comparable;
    const accepted = !!comparable && equivalentWhenAsked(requirement.text, entry.qualification);
    const field = entry.field_of_study ? fieldOfStudyForMatching(entry.field_of_study) : impliedField(entry.qualification);
    return {
      entry, level, below, comparable: !known && !!comparable && !accepted, status: educationStatus(entry, asOf),
      fieldMatch: !!field && (requiredFields.length ? requiredFields.some(f => fieldMatches(f, field)) : fieldMatches(requirement.text, field)),
      fieldNotUsed: !!entry.field_of_study && !fieldOfStudyForMatching(entry.field_of_study),
      sameDegree: namesSameDegree(requirement.text, entry.qualification),
    };
  });
  const meets = (c: Candidate) => !!wanted && !!c.level && c.level[0] >= wanted[0];
  const citeQualification = (c: Candidate): RawCitation[] => [{ evidence_id: c.entry.id, quote: c.entry.qualification }];
  const score = (c: Candidate) => Number(c.fieldMatch || c.sameDegree) * 2 + Number(!c.fieldNotUsed);
  const pick = (status: EducationStatus) => candidates.filter(c => meets(c) && c.status === status).sort((a, b) => score(b) - score(a))[0];

  // Only an earned degree can support a requirement.
  const best = pick("completed");
  if (best) {
    const citations = citeQualification(best);
    const { entry, fieldMatch, sameDegree, fieldNotUsed, comparable } = best;
    if (fieldNotUsed && asksField && !sameDegree) {
      return finding(requirement, "insufficient_information", "Your listed field of study couldn't be read as a field, so this cannot be assessed.", { caveats: [FIELD_NOT_USED, ...notUsed], basis: "education" });
    }
    const satisfied = fieldMatch || sameDegree || !asksField;
    // Comparable isn't equivalent: code can't establish that a foreign degree meets this level.
    if (comparable && satisfied) {
      if (fieldMatch && entry.field_of_study) citations.push({ evidence_id: entry.id, quote: entry.field_of_study });
      return finding(requirement, "possible", `You list ${entry.qualification}, which may be comparable to the ${wanted![1]} level this asks for.`, { citations, caveats: [EQUIVALENCE_NOT_VERIFIED, ...notUsed], basis: "education" });
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
    return finding(requirement, "possible", `You list a ${wanted![1]} level qualification, but its field could not be matched to this requirement.`, { citations, caveats: [...(comparable ? [EQUIVALENCE_NOT_VERIFIED] : []), ...(unverifiable ? [UNVERIFIABLE_FIELD] : []), ...notUsed], basis: "education" });
  }
  const studying = pick("in_progress");
  if (studying) {
    return finding(requirement, "possible", `You list a ${wanted![1]} level qualification that isn't finished yet.`, { citations: citeQualification(studying), caveats: [NOT_FINISHED, ...notUsed], basis: "education" });
  }
  const uncertain = pick("unknown");
  if (uncertain) {
    return finding(requirement, "insufficient_information", "Your entry doesn't make clear whether this degree was awarded, so it isn't counted.", { caveats: [STATUS_UNKNOWN, ...notUsed], basis: "education" });
  }
  const left = pick("incomplete");
  if (left) {
    return finding(requirement, "gap", `Your entry says this ${wanted![1]} level degree wasn't completed.`, { citations: citeQualification(left), caveats: [NOT_COMPLETED_NOTE, ...notUsed], basis: "education" });
  }
  // Nothing at the level: a gap only when every entry is clearly a lower qualification.
  const lower = (c: Candidate) => (c.below || (c.level !== null && !c.comparable && c.level[0] < wanted![0]));
  if (wanted && candidates.length && !notUsed.length && candidates.every(lower)) {
    return finding(requirement, "gap", `This asks for a ${wanted[1]} degree; your listed qualifications are at a lower level.`, {
      citations: candidates.map(citeQualification).flat(),
      basis: "education",
    });
  }
  return finding(requirement, "insufficient_information", "Your listed education could not be compared with this requirement by keyword rules.", {
    caveats: [...(candidates.some(c => c.comparable) ? [EQUIVALENCE_NOT_VERIFIED] : []), ...notUsed],
  });
}

/** Why a listed skill named in the requirement does not fully meet it (empty if it does). */
function skillCaveats(requirementText: string, matched: SkillEvidence[]): string[] {
  const caveats: string[] = [];
  const wanted = canonicalTerms(requirementText);
  // "React" inside "React Native": the words match, but the requirement names another technology.
  if (!matched.some(s => [...canonicalTerms(s.name)].every(t => wanted.has(t)))) caveats.push(PART_OF_LONGER_NAME);
  if (requiredMonths(requirementText) !== null || unquantifiedTime(requirementText)) caveats.push(YEARS_PER_SKILL);
  if (hasQualificationWords(requirementText)) caveats.push(CREDENTIAL_NOT_SHOWN);
  return caveats;
}

/** An explicit statement that the thing asked for isn't there: a skill named "No Photoshop", or "never
 * used Terraform" in a role. Negation about anything else doesn't count. */
function statedAbsent(request: MatchRequest, asked: string): RawCitation | null {
  const wanted = [...canonicalTerms(asked)];
  if (!wanted.length) return null;
  const about = (text: string) => {
    const have = canonicalTerms(text);
    return wanted.some(t => have.has(t));
  };
  for (const item of request.evidence) {
    if (isSkill(item) && saysAbsent(item.name) && about(item.name)) return { evidence_id: item.id, quote: item.name };
    if (isProject(item)) for (const name of item.skills) if (saysAbsent(name) && about(name)) return { evidence_id: item.id, quote: name };
    const texts = isRole(item) ? [item.description] : isProject(item) ? [item.description, item.contribution, item.results] : [];
    for (const text of texts) {
      if (!text) continue;
      for (const [start, end] of negatedSpans(text)) {
        const clause = text.slice(start, end);
        if (about(clause) && !untrustedOther(text, start, end)) return { evidence_id: item.id, quote: clause.trim() };
      }
    }
  }
  return null;
}
/** A negated clause that's also part of a claim or an instruction isn't a plain statement. */
const untrustedOther = (text: string, start: number, end: number) => {
  const negated = new Set(negatedSpans(text).map(s => s.join(":")));
  return untrustedEvidenceSpans(text).some(([s, e]) => !negated.has(`${s}:${e}`) && s < end && start < e);
};

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
    // "SWIFT" alone, against the language "Swift": the capitals may mean the other thing.
    const capitals = matched.some(s => [...canonicalTerms(s.name)].some(t => hasOtherSenses(t) && t.length >= 3 && head.includes(t.toUpperCase()) && s.name.toLowerCase().includes(t) && !s.name.includes(t.toUpperCase())));
    if (capitals) caveats.push(OTHER_SENSE);
    if (caveats.length) {
      return finding(requirement, "possible", `You list ${names} as a skill, but that alone may not meet this requirement.`, { citations, caveats: [...caveats, ...notes], basis });
    }
    const explanation = alternate ? `You list ${names}, a known name for what this requirement asks for.` : `You list ${names} as a skill.`;
    return finding(requirement, "supported", explanation, { citations, caveats: notes, basis });
  }

  // A role stating the technology was used in the work is direct evidence, like listing it.
  const inWork = (piece: string) => {
    const wanted = canonicalTerms(piece);
    if (!wanted.size) return null;
    for (const role of request.evidence.filter(isRole)) {
      if (!role.description) continue;
      const quote = sharedTerm(piece, role.description);
      if (!quote) continue;
      const sense = [...canonicalTerms(quote)].some(t => hasOtherSenses(t) && otherSense(piece, t));
      // Judge the occurrence that can count: the same words may also sit in a sentence that can't.
      const description = role.description;
      const barred = untrustedEvidenceSpans(description);
      const at = occurrences(description, quote).find(i => !barred.some(([s, e]) => s < i + quote.length && i < e) && directUse(description, quote, sense, i));
      if (at === undefined) continue;
      const have = canonicalTerms(sentenceAt(description, at, at + quote.length));
      if (sense || [...wanted].every(t => have.has(t))) return { role, quote };
    }
    return null;
  };
  const askedFor = (() => {
    const at = head.search(/\s+for\s+/i);
    return at > 0 && canonicalTerms(head.slice(0, at)).size ? head.slice(0, at) : head;
  })();
  // "Kotlin and Terraform": each part on its own, by a listed skill or by work that shows it.
  const parts = structure.pieces.length > 1 ? structure.pieces : [askedFor];
  const shownParts = parts.map(p => inWork(p)).filter((x): x is NonNullable<typeof x> => x !== null);
  const shownInWork = shownParts[0] ?? null;
  if (shownInWork) {
    const others = parts.filter(p => !skills.some(s => sameSkill(p, s.name)) && !inWork(p));
    const citations = shownParts.map(x => ({ evidence_id: x.role.id, quote: x.quote }));
    const needsMore = others.length > 0 || requiredLevel(requirement.text) !== null || requiredMonths(requirement.text) !== null || unquantifiedTime(requirement.text) || hasQualificationWords(requirement.text);
    if (needsMore) {
      return finding(requirement, "possible", "Your role describes using this, but that alone may not meet everything it asks for.", {
        citations, caveats: [...(others.length ? [notAllItems(others)] : []), ...notes], basis: "described_in_work",
      });
    }
    return finding(requirement, "supported", `Your role as ${shownInWork.role.job_title} describes using this in the work.`, { citations, caveats: notes, basis: "described_in_work" });
  }
  for (const role of request.evidence.filter(isRole)) {
    if (!role.description) continue;
    const activity = activityEvidence(requirement.text, role.description, plainTitle(role.job_title) ? rolePart(role.job_title) : "");
    if (!activity) continue;
    const start = role.description.indexOf(activity.quote);
    if (untrustedEvidenceSpans(role.description).some(([s, e]) => s <= start && start < e)) continue;
    const supported = activity.level === "supported" && requiredLevel(requirement.text) === null && requiredMonths(requirement.text) === null && !unquantifiedTime(requirement.text);
    return finding(requirement, supported ? "supported" : "possible", supported ? `Your role as ${role.job_title} describes this work.` : `Your role as ${role.job_title} suggests this. Check that it fits.`, {
      citations: [{ evidence_id: role.id, quote: activity.quote }], caveats: notes, basis: "described_in_work",
    });
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
  // "Swift for iOS apps" asks for Swift: its purpose can't earn credit on its own.
  const purpose = head.search(/\s+for\s+/i);
  const asked = purpose > 0 && canonicalTerms(head.slice(0, purpose)).size ? head.slice(0, purpose) : head;
  const inText = (text: string) => {
    const same = sharedTerm(asked, text);
    if (same) return { quote: same, kin: false };
    const directed = untrustedEvidenceSpans(text);
    const kin = relatedTermInText(asked, text);
    const index = kin ? text.indexOf(kin) : -1;
    return kin && !directed.some(([s, e]) => s <= index && index < e) ? { quote: kin, kin: true } : null;
  };
  let kinOnly = true;
  for (const item of request.evidence) {
    if (isProject(item)) {
      const quotes = item.skills.filter(s => sameSkill(asked, s));
      if (quotes.length) kinOnly = false;
      for (const text of [item.description, item.contribution, item.results]) {
        const found = text ? inText(text) : null;
        if (found) {
          quotes.push(found.quote);
          kinOnly &&= found.kin;
        }
      }
      if (quotes.length) {
        for (const quote of unique(quotes)) related.push({ evidence_id: item.id, quote });
        caveats.push(PROJECT_MENTION);
      }
    } else if (isRole(item)) {
      // A title naming the technology shows it in use ("Oracle DBA"), and so does a description.
      const wanted = canonicalTerms(asked);
      const title = plainTitle(item.job_title) && [...quoteTerms(rolePart(item.job_title), rolePart(item.job_title))].some(t => wanted.has(t) && VOCABULARY.has(t)) ? item.job_title : null;
      const found = item.description ? inText(item.description) : null;
      const quote = title ?? found?.quote;
      if (quote) {
        related.push({ evidence_id: item.id, quote });
        projectOnly = false;
        kinOnly &&= !title && !!found?.kin;
      }
    }
  }
  if (related.length && kinOnly) caveats.push(RELATED_TECHNOLOGY);
  if (related.length) {
    return finding(requirement, "possible", "This requirement's terms appear in your roles or projects, but not as a listed skill.", {
      citations: related, caveats: [...caveats, ...notes], basis: projectOnly ? "project" : "described_in_work",
    });
  }
  // The profile says outright that it isn't there. Leaving something out never counts as saying this.
  const absent = statedAbsent(request, asked);
  if (absent) {
    return finding(requirement, "gap", "Your profile says you don't have this.", { citations: [absent], caveats: notes, basis: "stated_absent" });
  }
  return finding(requirement, "insufficient_information", "No listed skill, role, or project mentions this requirement's terms. Keyword rules cannot tell whether you have it under a different name.", { caveats: notes });
}

const CREDENTIAL_WORDS = new Set(`certification certifications certified certificate certificates cert certs license licenses
licensed licence licences card cards permit permits credential credentials current active valid valid required preferred must
hold holds holding have having a an in of and or with comptia isc2 pmi state any required`.split(/\s+/));
const credentialTerms = (text: string) => new Set([...canonicalTerms(text)].filter(t => !CREDENTIAL_WORDS.has(t)));
const HOLDS = /\b(hold|holds|held|holding|licensed|certified|passed|earned|obtained|maintain|maintains)\b/i;
/** Asks for a credential rather than a skill or a degree. */
export const asksForCredential = (text: string) =>
  !requiredDegreeRank(text) && (/\b(certification|certified|licensed|licence|permit|clearance)\b|(?<!\b(?:ssl|tls)\s)\bcertificate\b|(?<!\bsoftware\s)\blicense\b|(?<!\b(?:credit|debit|gift|graphics|video|sim|sd|network|sound)\s)\bcard\b/i.test(text) || [...canonicalTerms(text)].some(isCredentialName));

/** A credential is shown by a completed education entry or a skill listing naming it as held. Listing the
 * skill behind it, holding a related job, or a credential that's expired or pending never shows it. */
function assessCredential(request: MatchRequest, requirement: MatchRequirement): RawFinding {
  const structure = parseRequirement(requirement.text, new Set(), true);
  const head = structure.creditText || requirement.text;
  const wanted = credentialTerms(head);
  const names = (text: string) => {
    const have = credentialTerms(text);
    return wanted.size > 0 && [...wanted].every(t => have.has(t)) && !gradeDiffers(head, text) && ![...wanted].some(t => otherSense(head, t) !== otherSense(text, t));
  };
  const schools = request.evidence.filter(isEducation).filter(e => plainQualification(e.qualification) && names(e.qualification));
  const completed = schools.filter(e => educationStatus(e, request.as_of_month) === "completed");
  if (completed.length) {
    return finding(requirement, "supported", `You list ${completed[0].qualification} in your education.`, {
      citations: completed.map(e => ({ evidence_id: e.id, quote: e.qualification })), caveats: [CREDENTIAL_SELF_LISTED], basis: "education",
    });
  }
  if (schools.some(e => educationStatus(e, request.as_of_month) === "in_progress")) {
    const current = schools.find(e => educationStatus(e, request.as_of_month) === "in_progress")!;
    return finding(requirement, "possible", `You list ${current.qualification}, but it isn't finished yet.`, { citations: [{ evidence_id: current.id, quote: current.qualification }], caveats: [NOT_FINISHED], basis: "education" });
  }
  const skills = request.evidence.filter(isSkill).filter(s => plainCredentialName(s.name) && names(s.name));
  const marked = skills.filter(s => hasCredentialMarker(s.name));
  const citeSkills = (list: SkillEvidence[]) => list.map(s => ({ evidence_id: s.id, quote: s.name }));
  if (marked.length) {
    return finding(requirement, "supported", `You list ${marked[0].name}.`, { citations: citeSkills(marked), caveats: [CREDENTIAL_SELF_LISTED], basis: "listed_skill" });
  }
  // The credential's own name with nothing saying it's held ("CPA"), or a name it shares with its skill.
  const bare = skills.filter(s => [...credentialTerms(s.name)].some(isCredentialName));
  if (bare.length) {
    return finding(requirement, "possible", `You list ${bare[0].name}, but your profile doesn't say you hold this credential.`, { citations: citeSkills(bare), caveats: [CREDENTIAL_NOT_SHOWN], basis: "listed_skill" });
  }
  const result = assessSkills(request, requirement);
  // Everything else here rests on a skill or a job: that doesn't show a credential.
  if (result.verdict === "supported" || result.basis === "listed_skill" || result.basis === "alternate_name") {
    return finding(requirement, "insufficient_information", "Your profile doesn't list this credential. Listing the skill behind it doesn't show it.", { caveats: [CREDENTIAL_NOT_SHOWN] });
  }
  // A role or project only counts when it says the credential is held, in that sentence.
  const texts = request.evidence.flatMap(e => (isRole(e) ? [e.description] : isProject(e) ? [e.description, e.contribution, e.results] : []));
  const statesHeld = (quote: string) => texts.some(t => !!t && t.split(/(?<=[.!?;])\s+/).some(line => line.includes(quote) && HOLDS.test(line)));
  if (result.verdict === "possible" && result.citations.some(c => statesHeld(c.quote))) {
    return { ...result, caveats: unique([...result.caveats, CREDENTIAL_NOT_SHOWN]).slice(0, 5) };
  }
  return finding(requirement, "insufficient_information", "Your profile doesn't list this credential.", { caveats: unique([...result.caveats.filter(c => c !== RELATED_TECHNOLOGY), CREDENTIAL_NOT_SHOWN]).slice(0, 5) });
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
  } else if (current.category !== "Experience" && asksForCredential(current.text)) result = assessCredential(request, current);
  else if (current.category === "Experience") result = assessExperience(request, current);
  else if (current.category === "Education") result = assessEducation(request, current);
  else result = assessSkills(request, current);
  return notes.length ? { ...result, caveats: unique([...result.caveats, ...notes]).slice(0, 5) } : result;
}

function areaIsEmpty(request: MatchRequest, requirement: MatchRequirement): boolean {
  const employment = requirement.category === "Experience" && !skillLikeExperience(qualificationText(requirement.text));
  const kinds = employment ? ["experience"] : requirement.category === "Education" ? ["education"] : ["skill", "experience", "project"];
  return !request.evidence.some(e => kinds.includes(e.kind));
}

const isAnswer = (item: Evidence) => item.kind === "experience" && item.source === "clarification";

/** Rules every finding must obey, however it was produced: citations are verbatim, a positive verdict
 * has evidence, projects are never employment, and a stated duration is one code can verify. */
export function checkFinding(request: MatchRequest, requirement: MatchRequirement, f: RawFinding, evidence: Map<string, Evidence>): RawFinding {
  let verdict = f.verdict;
  let caveats = [...f.caveats];
  const found = f.citations.filter(c => quoteIsVerbatim(evidence.get(c.evidence_id)!, c.quote));
  if (found.length < f.citations.length) caveats.push(UNVERIFIED_EVIDENCE);
  // An answer's entry repeats its role's title: quote that title from the role itself when both are cited.
  const fromRole = new Set(found.filter(c => !isAnswer(evidence.get(c.evidence_id)!)).map(c => c.quote));
  const citations = found.filter(c => !isAnswer(evidence.get(c.evidence_id)!) || (evidence.get(c.evidence_id) as ExperienceEvidence).job_title !== c.quote || !fromRole.has(c.quote));
  if ((verdict === "supported" || verdict === "possible") && !citations.length) verdict = "insufficient_information";

  if (requirement.category === "Experience" && !skillLikeExperience(qualificationText(requirement.text))) {
    const cited = citations.map(c => evidence.get(c.evidence_id)!);
    if (cited.some(isProject)) caveats.push(PROJECT_NOT_EMPLOYMENT);
    if ((verdict === "supported" || verdict === "possible") && !cited.some(isRole)) {
      if (verdict === "supported") verdict = "possible";
      caveats.push(PROJECT_NOT_EMPLOYMENT);
    }
  }

  const months = requiredMonths(requirement.text);
  const allowed = new Set([
    ...statedYears(requirement.text),
    ...(months === null ? [] : [months / 12]),
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
    return (item.kind === "skill" && (plainSkillName(item.name) || plainCredentialName(item.name)) && c.quote === item.name)
      || (item.kind === "education" && plainQualification(item.qualification) && c.quote === item.qualification)
      || (item.kind === "experience" && (f.basis === "employment_dates" || f.basis === "role_description") && plainTitle(item.job_title) && c.quote === item.job_title)
      || (item.kind === "experience" && f.basis === "described_in_work" && !!item.description && quoteInTrustedText(item.description, c.quote, untrustedEvidenceSpans(item.description)));
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
