import table from "@/lib/ai/rules/data/skill_relations.json";
import { DEGREE_WORDS, RELEVANCE_STOPWORDS } from "@/lib/ai/evidence";
import { disguised } from "@/lib/ai/rules/profile-fields";

// How a quote relates to a requirement, decided by code from the reviewed table. Authoritative since
// Milestone 7; the frozen Python copy is only a test reference. Instructions hidden in job or profile
// text: see untrusted-text.ts.

export type Relation = "same" | "related";

export const GENERIC_TERMS = new Set<string>([...RELEVANCE_STOPWORDS, ...table.generic]);
const GENERIC = GENERIC_TERMS;
const PHRASES = new Map<string, string>();
for (const [canonical, variants] of Object.entries(table.aliases)) {
  PHRASES.set(canonical, canonical);
  for (const variant of variants) PHRASES.set(variant, canonical);
}
const FAMILIES = table.concepts.map(concept => {
  for (const term of concept.terms) if (term.includes(" ") && !PHRASES.has(term)) PHRASES.set(term, term.replaceAll(" ", ""));
  return {
    terms: new Set(concept.terms.map(t => PHRASES.get(t) ?? t.replaceAll(" ", ""))),
    members: new Set(concept.members.map(m => PHRASES.get(m) ?? m)),
  };
});
const LONGEST = Math.max(...[...PHRASES.keys()].map(p => p.split(" ").length));
const DISTINCT = new Set(table.distinct.map(pair => [...pair].sort().join("\u0000")));
const DOTNET = /(?<![\p{L}\p{N}_.])\.net(?![\p{L}\p{N}_])/giu;
const AMBIGUOUS = new Set(table.ambiguous);
const TECH_CONTEXT = new Set(table.tech_context);
const EMPLOYMENT_WORDS = new Set(table.employment_words);
const WORK_VERBS = new Set<string>(table.work_verbs);
/** Every technology and concept term the table knows, in canonical form. */
export const VOCABULARY = new Set<string>([...PHRASES.values(), ...FAMILIES.flatMap(f => [...f.terms, ...f.members])]);

export function words(text: string): string[] {
  const result: string[] = [];
  for (const raw of text.replace(DOTNET, " dotnet ").toLowerCase().match(/[\p{L}\p{N}_+#.']+/gu) ?? []) {
    let word = raw.replace(/^[.']+|[.']+$/g, "");
    if (word.endsWith("'s")) word = word.slice(0, -2);
    word = word.replaceAll(".", "");
    if (word) result.push(word);
  }
  return result;
}

export function canonicalTerms(text: string): Set<string> {
  const tokens = words(text);
  const terms = new Set<string>();
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let size = Math.min(LONGEST, tokens.length - i); size > 0; size--) {
      const phrase = tokens.slice(i, i + size).join(" ");
      const canonical = PHRASES.get(phrase);
      if (canonical !== undefined && (size > 1 || !GENERIC.has(phrase))) {
        terms.add(canonical);
        i += size;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const word = DEGREE_WORDS[tokens[i]] ?? tokens[i];
      if (!GENERIC.has(word)) terms.add(word);
      i += 1;
    }
  }
  return terms;
}

function related(a: string, b: string): boolean {
  if (DISTINCT.has([a, b].sort().join("\u0000"))) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // A shared stem counts only for a short ending or two known names (see relations.py).
  if (short.length >= 4 && long.startsWith(short) && (long.length - short.length <= 3 || (VOCABULARY.has(a) && VOCABULARY.has(b)))) return true;
  return FAMILIES.some(({ terms, members }) =>
    (terms.has(a) || members.has(a)) && (terms.has(b) || members.has(b)) && (members.has(a) || members.has(b)));
}

/** True when an ambiguous word sits within three words of a technical noun or another known
 * technology in its field, outside any hyphenated compound ("go-kart"). See relations.py. */
const WORD_CONTEXT = (table as { ambiguous_context?: Record<string, string[]> }).ambiguous_context ?? {};
const WORD_NEGATIVE = (table as { ambiguous_negative?: Record<string, string[]> }).ambiguous_negative ?? {};
/** Negative words that only count right after the word ("excel at"), never nearby ("reports in Excel"). */
const FUNCTION_WORDS = new Set(["at", "in", "to", "through", "beyond", "above"]);

function hasTechContext(fieldText: string, word: string): boolean {
  const context = new Set([...TECH_CONTEXT, ...(WORD_CONTEXT[word] ?? [])]);
  const negative = new Set(WORD_NEGATIVE[word] ?? []);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of fieldText.matchAll(pattern)) {
    const before = fieldText.slice(0, match.index);
    const after = fieldText.slice(match.index + match[0].length);
    if (before.endsWith("-") || /^-[a-z]/i.test(after)) continue;
    const window = [...words(before).slice(-3), ...words(after).slice(0, 3)];
    const following = words(after)[0];
    if ((following && negative.has(following)) || window.some(t => negative.has(t) && !FUNCTION_WORDS.has(t))) continue;
    if (window.some(t => context.has(t) || (VOCABULARY.has(t) && t !== word))) return true;
  }
  return false;
}

/** Terms in a quote. For free text, ambiguous words without technical context are dropped. */
export function quoteTerms(quote: string, fieldText?: string | null): Set<string> {
  const terms = canonicalTerms(quote);
  if (fieldText == null) return terms;
  // Only the word as written can be ambiguous: "Golang" is the language, "go" may not be.
  const written = new Set(words(quote));
  return new Set([...terms].filter(t => !AMBIGUOUS.has(t) || !written.has(t) || hasTechContext(fieldText, t)));
}

/** A skill name is a name: short, with no remark or sentence in it (relations.py). "Bash (also counts
 * as Terraform)" is a claim, so it never counts as a listed skill. */
export function plainSkillName(name: string): boolean {
  if (disguised(name) || words(name).length > 6 || /[:;{}<>=≈≡→⇒]/.test(name.normalize("NFKC"))) return false;
  return !/\b(counts?|is|are|was|means?|equal|equals|same|equivalent|as|also|verified|approved|certified|expert|aka|treated|deemed|qualifies)\b/i.test(name);
}

/** The word sits among words of its ordinary meaning: Java the island, a ball python, spring sales. */
export function ordinaryMeaning(fieldText: string, word: string): boolean {
  const negative = new Set(WORD_NEGATIVE[word] ?? []);
  if (!negative.size) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of fieldText.matchAll(pattern)) {
    const window = [...words(fieldText.slice(0, match.index)).slice(-3), ...words(fieldText.slice(match.index + match[0].length)).slice(0, 3)];
    if (window.some(t => negative.has(t) && !FUNCTION_WORDS.has(t))) return true;
  }
  return false;
}

const KNOWN_TECHNOLOGIES = new Set<string>((table as unknown as { known_technologies: string[] }).known_technologies);
/** A technology with its own identity: only the reviewed table may connect it to something else. */
export const isKnownTechnology = (term: string) => KNOWN_TECHNOLOGIES.has(term) || VOCABULARY.has(term);
export const isDistinctPair = (a: string, b: string) => DISTINCT.has([a, b].sort().join("\u0000"));

/** The text describes a technology as used in work: a work verb shortly before it, or a technical noun
 * or another known technology beside it. "Built Kafka consumers" does; "Kubernetes expertise confirmed"
 * does not. A mention alone is not evidence. */
export function describesUse(fieldText: string, quote: string): boolean {
  const terms = canonicalTerms(quote);
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of fieldText.matchAll(pattern)) {
    const before = words(fieldText.slice(0, match.index));
    const after = words(fieldText.slice(match.index + match[0].length));
    const negative = new Set([...terms].flatMap(t => WORD_NEGATIVE[t] ?? []));
    if ([...before.slice(-3), ...after.slice(0, 3)].some(t => negative.has(t) && !FUNCTION_WORDS.has(t))) continue;
    if (before.slice(-5).some(t => WORK_VERBS.has(t))) return true;
    if ([...before.slice(-3), ...after.slice(0, 3)].some(t => TECH_CONTEXT.has(t) || (VOCABULARY.has(t) && !terms.has(t)))) return true;
  }
  return false;
}

/** Every way the table writes a canonical term, longest first ("kubernetes", "k8s", "kube"). */
export function surfaceForms(term: string): string[] {
  const forms = new Set([term]);
  for (const [phrase, canonical] of PHRASES) if (canonical === term) forms.add(phrase);
  return [...forms].sort((a, b) => b.length - a.length);
}

const tokens = (text: string) => (text.toLowerCase().match(/[a-z0-9][a-z0-9+#&/.-]*/g) ?? []).map(t => t.replace(/[.\-/]+$/, "")).filter(Boolean);

/** Whole-token, case-insensitive: "C++" matches "C++"; "Java" does not match "JavaScript". */
export function containsPhrase(text: string, phrase: string): boolean {
  const needle = tokens(phrase);
  const haystack = tokens(text);
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  }
  return false;
}

// --- Degrees ----------------------------------------------------------------------------------------

export type DegreeInfo = { level: number; field: string; abbreviations?: string[] };
export const degreePhrases = (table as unknown as { degree_phrases: Record<string, DegreeInfo> }).degree_phrases;
export const degreeImplied = (table as unknown as { degree_implied: Record<string, DegreeInfo> }).degree_implied;
const FIELD_STOPWORDS = new Set<string>(table.degree_field_stopwords);
const FIELD_FAMILIES = Object.fromEntries(Object.entries(table.degree_field_families).map(([k, v]) => [k, new Set(v as string[])]));

function wordAlternatives(text: string): Set<string>[] {
  const alternatives: Set<string>[] = [];
  for (const part of text.split(/,|\bor\b|\/|;/i)) {
    const found = new Set(words(part).filter(w => !FIELD_STOPWORDS.has(w) && w.length > 1 && !/^\d+$/.test(w)));
    if (found.size) alternatives.push(found);
  }
  return alternatives;
}

const degreeNamePattern = (phrase: string) => new RegExp(`\\b${phrase.replaceAll(" ", "\\s+")}\\b`, "gi");

/** The text with full degree names removed: "Bachelor of Science in Statistics" -> "in Statistics". */
function withoutDegreeNames(text: string): string {
  let result = text;
  for (const phrase of Object.keys(degreePhrases)) result = result.replace(degreeNamePattern(phrase), " ");
  return result;
}

/** Fields of study a requirement names, as word sets. A degree name that stands alone keeps its words,
 * so "Bachelor of Science" still asks for science. */
function fieldAlternatives(text: string): Set<string>[] {
  const stripped = wordAlternatives(withoutDegreeNames(text));
  return stripped.length ? stripped : wordAlternatives(text);
}

export const asksForField = (requirementText: string) => fieldAlternatives(requirementText).length > 0;

/** The requirement is only a degree name, and the qualification is that degree written either way. */
export function namesSameDegree(requirementText: string, qualification: string): boolean {
  if (wordAlternatives(withoutDegreeNames(requirementText)).length) return false;
  const have = ` ${(qualification.toLowerCase().replaceAll(".", "").match(/[a-z]+/g) ?? []).join(" ")} `;
  for (const [phrase, info] of Object.entries(degreePhrases)) {
    if (!degreeNamePattern(phrase).test(requirementText)) continue;
    if ([phrase, ...(info.abbreviations ?? [])].some(name => have.includes(` ${name} `))) return true;
  }
  return false;
}

/** Every word of a field the requirement names appears in this field of study, or a reviewed family
 * covers it. Whole words only, never substrings. */
export function fieldMatches(requirementText: string, fieldOfStudy: string): boolean {
  const have = new Set(words(fieldOfStudy));
  return fieldAlternatives(requirementText).some(wanted =>
    [...wanted].every(w => have.has(w) || [...(FIELD_FAMILIES[w] ?? [])].some(f => have.has(f))));
}

export const technologyTerms = (text: string) => new Set([...canonicalTerms(text)].filter(t => VOCABULARY.has(t)));
export const namesEmployment = (text: string) => words(text).some(w => EMPLOYMENT_WORDS.has(w));

/** How a quote relates to a requirement. Pass the free-text field a quote came from, if any. */
export function relation(requirementText: string, quote: string, fieldText?: string | null): Relation | null {
  const wanted = canonicalTerms(requirementText);
  const found = quoteTerms(quote, fieldText);
  if ([...wanted].some(t => found.has(t))) return "same";
  for (const a of wanted) for (const b of found) if (related(a, b)) return "related";
  return null;
}

// --- Requirement wording (requirement_text.py) ---------------------------------------------------

const QUALIFICATION_WORDS = /(?<![\p{L}\p{N}_])(certif[\p{L}\p{N}_]*|licen[cs][\p{L}\p{N}_]*|clearance|degree|diploma|accredit[\p{L}\p{N}_]*|registered|chartered|bachelor[\p{L}\p{N}_]*|master'?s|masters|ph\.?\s?d|doctorate|mba|cpa|pmp|cissp|ccna|citizenship|authori[sz]ed to work)(?![\p{L}\p{N}_])/iu;
const REQUIRED_LEVELS: [number, RegExp][] = [
  [3, /(?<![\p{L}\p{N}_])(expert|advanced|in-depth|extensive|deep|senior|mastery)(?![\p{L}\p{N}_])/iu],
  [2, /(?<![\p{L}\p{N}_])(intermediate|working knowledge|solid|strong)(?![\p{L}\p{N}_])/iu],
];
export const PROFICIENCY_RANK: Record<string, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

export const hasQualificationWords = (text: string) => QUALIFICATION_WORDS.test(text);

/** The skill level a requirement asks for (3 advanced, 2 intermediate), or null. */
export function requiredSkillLevel(text: string): number | null {
  for (const [rank, pattern] of REQUIRED_LEVELS) if (pattern.test(text)) return rank;
  return null;
}
