import table from "../../../ai-service/app/matching/skill_relations.json";
import { DEGREE_WORDS, RELEVANCE_STOPWORDS } from "@/lib/ai/evidence";

// Mirrors ai-service/app/matching/relations.py and requirement_text.py, so Next.js can re-check a
// hybrid result on its own. Instructions hidden in job or profile text: see untrusted-text.ts. Both read the same table (skill_relations.json), and both test suites
// check the shared examples in ai-service/tests/fixtures/relation_cases.json.

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
function hasTechContext(fieldText: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of fieldText.matchAll(pattern)) {
    const before = fieldText.slice(0, match.index);
    const after = fieldText.slice(match.index + match[0].length);
    if (before.endsWith("-") || /^-[a-z]/i.test(after)) continue;
    const window = [...words(before).slice(-3), ...words(after).slice(0, 3)];
    if (window.some(t => TECH_CONTEXT.has(t) || (VOCABULARY.has(t) && t !== word))) return true;
  }
  return false;
}

/** Terms in a quote. For free text, ambiguous words without technical context are dropped. */
export function quoteTerms(quote: string, fieldText?: string | null): Set<string> {
  const terms = canonicalTerms(quote);
  if (fieldText == null) return terms;
  return new Set([...terms].filter(t => !AMBIGUOUS.has(t) || hasTechContext(fieldText, t)));
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
