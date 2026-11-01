import table from "../../../ai-service/app/matching/skill_relations.json";
import { DEGREE_WORDS, RELEVANCE_STOPWORDS } from "@/lib/ai/evidence";

// Mirrors ai-service/app/matching/relations.py and requirement_text.py, so Next.js can re-check a
// hybrid result on its own. Both read the same table (skill_relations.json), and both test suites
// check the shared examples in ai-service/tests/fixtures/relation_cases.json.

export type Relation = "same" | "related";

const GENERIC = new Set<string>([...RELEVANCE_STOPWORDS, ...table.generic]);
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
  if (short.length >= 4 && long.startsWith(short)) return true;
  return FAMILIES.some(({ terms, members }) =>
    (terms.has(a) || members.has(a)) && (terms.has(b) || members.has(b)) && (members.has(a) || members.has(b)));
}

/** How a quote relates to a requirement: the same thing, a related one, or neither. */
export function relation(requirementText: string, quote: string): Relation | null {
  const wanted = canonicalTerms(requirementText);
  const found = canonicalTerms(quote);
  if ([...wanted].some(t => found.has(t))) return "same";
  for (const a of wanted) for (const b of found) if (related(a, b)) return "related";
  return null;
}

// --- Requirement wording (requirement_text.py) ---------------------------------------------------

const QUALIFICATION_WORDS = /(?<![\p{L}\p{N}_])(certif[\p{L}\p{N}_]*|licen[cs][\p{L}\p{N}_]*|clearance|degree|diploma|accredit[\p{L}\p{N}_]*|registered|chartered|bachelor[\p{L}\p{N}_]*|master'?s|masters|ph\.?\s?d|doctorate|mba|cpa|pmp|cissp|ccna|citizenship|authori[sz]ed to work)(?![\p{L}\p{N}_])/iu;
const W = "[\\p{L}\\p{N}_]";
const INSTRUCTION_PATTERNS = [
  `(?<!${W})(ignore|disregard|forget)(?!${W})[^.]{0,40}(?<!${W})(instructions?|rules?|prompts?|previous|above|guidelines)(?!${W})`,
  `(?<!${W})(note|message|instructions?)\\s+(to|for)\\s+(the\\s+)?(ai|assistant|model|llm|grader|system|bot)(?!${W})`,
  `(^|[(\\[])\\s*(system|assistant|developer)\\s*:`,
  `(?<!${W})(mark|rate|label|treat|answer|respond|output|say)(?!${W})[^.]{0,60}(?<!${W})(supported|verdicts?)(?!${W})`,
  `["'\`](supported|insufficient_information)["'\`]`,
  `(?<!${W})(instrucci[oó]n(es)?|ignorar?|consigne|anweisung(en)?|instru[cç][aã]o)(?!${W})`,
];
const INSTRUCTIONS = new RegExp(INSTRUCTION_PATTERNS.map(p => `(?:${p})`).join("|"), "iu");
const REQUIRED_LEVELS: [number, RegExp][] = [
  [3, /(?<![\p{L}\p{N}_])(expert|advanced|in-depth|extensive|deep|senior|mastery)(?![\p{L}\p{N}_])/iu],
  [2, /(?<![\p{L}\p{N}_])(intermediate|working knowledge|solid|strong)(?![\p{L}\p{N}_])/iu],
];
export const PROFICIENCY_RANK: Record<string, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

export const hasQualificationWords = (text: string) => QUALIFICATION_WORDS.test(text);
export const looksLikeInstructions = (text: string) => INSTRUCTIONS.test(text);

/** The skill level a requirement asks for (3 advanced, 2 intermediate), or null. */
export function requiredSkillLevel(text: string): number | null {
  for (const [rank, pattern] of REQUIRED_LEVELS) if (pattern.test(text)) return rank;
  return null;
}
