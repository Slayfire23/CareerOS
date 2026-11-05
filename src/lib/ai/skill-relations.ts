import table from "@/lib/ai/rules/data/skill_relations.json";
import terminology from "@/lib/ai/rules/data/terminology.json";
import { DEGREE_WORDS, RELEVANCE_STOPWORDS } from "@/lib/ai/evidence";
import { NEGATION, disguised, hasNegation, notAStatement, repeatsItself } from "@/lib/ai/rules/profile-fields";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

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
// The reviewed occupational names (docs/TERMINOLOGY_RESEARCH.md): exact phrases only. "same" means another
// name for it; "related" can only ever give Possible.
export const TERMINOLOGY_VERSION = terminology.version;
const TERMINOLOGY_TERMS = new Set<string>(terminology.groups.map(group => group.canonical));
export const isTerminologyTerm = (term: string) => TERMINOLOGY_TERMS.has(term);
for (const group of terminology.groups) {
  PHRASES.set(group.canonical, group.canonical);
  for (const name of group.same) PHRASES.set(name, group.canonical);
}
for (const group of terminology.groups) {
  if (!group.related.length) continue;
  for (const name of group.related) if (!PHRASES.has(name)) PHRASES.set(name, name.replaceAll(" ", ""));
  FAMILIES.push({ terms: new Set([group.canonical]), members: new Set(group.related.map(name => PHRASES.get(name)!)) });
}
const LONGEST = Math.max(...[...PHRASES.keys()].map(p => p.split(" ").length));
const DISTINCT = new Set(table.distinct.map(pair => [...pair].sort().join("\u0000")));
const DOTNET = /(?<![\p{L}\p{N}_.])\.net(?![\p{L}\p{N}_])/giu;
const AMBIGUOUS = new Set(table.ambiguous);
const TECH_CONTEXT = new Set(table.tech_context);
const EMPLOYMENT_WORDS = new Set(table.employment_words);
const WORK_VERBS = new Set<string>(table.work_verbs);
export const WORK_VERB_WORDS: ReadonlySet<string> = WORK_VERBS;
const CONSUMER_NOUNS = new Set<string>((table as unknown as { consumer_nouns: string[] }).consumer_nouns);
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
  if (disguised(name) || words(name).length > 6 || /[:;{}<>=≈≡→⇒]/.test(name.normalize("NFKC")) || saysAbsent(name) || repeatsItself(name) || hasDirectedText(name) || notAStatement(name)) return false;
  // "AWS Certified Developer" is a credential's name; a remark about one ("Terraform (certified)") isn't.
  if (/\bcertified\b/i.test(name) && (name.includes("(") || /\bcertified\s+by\b/i.test(name) || /\bcertified$/i.test(name.trim()))) return false;
  return !/\b(counts?|is|are|was|means?|equal|equals|same|equivalent|as|also|verified|approved|expert|aka|treated|deemed|qualifies)\b/i.test(name);
}

/** A skill name saying it's absent: "No Photoshop", "Photoshop: none", "Photoshop (never)". Hyphenated
 * and joined names like "No-code", "Non-destructive testing", and "NoSQL" are unaffected, and so is the
 * spaced spelling "No SQL". */
export function saysAbsent(name: string): boolean {
  return hasNegation(name) || (/(?:^|[\s(,/:-])(?:no|not|none|never|without|n\/a)(?=[\s),/]|$)/i.test(name) && !/^no\s+sql\b/i.test(name.trim()));
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

const WORD_SENSES = (table as unknown as { word_senses: Record<string, string[]> }).word_senses;
/** The text uses this word in another sense: "SWIFT payment messaging", "spark plugs", "access control". */
export function otherSense(text: string, term: string): boolean {
  const senses = WORD_SENSES[term];
  return !!senses && words(text).some(w => senses.includes(w));
}
export const hasOtherSenses = (term: string) => term in WORD_SENSES;

const CREDENTIAL_NAMES = new Set((table as unknown as { credentials: string[] }).credentials);
export const isCredentialName = (term: string) => CREDENTIAL_NAMES.has(term);

type FieldRoles = { same: string[]; related: string[]; not?: string[] };
const FIELD_ROLES = Object.entries((table as unknown as { field_roles: Record<string, FieldRoles> }).field_roles);
/** The reviewed job titles for the fields a requirement's clause names. */
export function rolesForField(clause: string): FieldRoles[] {
  return FIELD_ROLES.filter(([field]) => containsPhrase(clause, field)).map(([, roles]) => roles);
}

const KNOWN_TECHNOLOGIES = new Set<string>((table as unknown as { known_technologies: string[] }).known_technologies);
/** A technology with its own identity: only the reviewed table may connect it to something else. */
export const isKnownTechnology = (term: string) => KNOWN_TECHNOLOGIES.has(term) || VOCABULARY.has(term);
/** A related technology named in free text and described as used there ("GitLab CI" for Git). The
 * reviewed table decides what's related. */
export function relatedTermInText(requirementText: string, fieldText: string): string | null {
  const wanted = canonicalTerms(requirementText);
  if ([...wanted].some(t => otherSense(requirementText, t))) return null;
  const names: [string, string][] = [...PHRASES, ...[...VOCABULARY].map((v): [string, string] => [v, v])];
  for (const [phrase, canonical] of names) {
    if (phrase.length < 3 || GENERIC.has(phrase)) continue;
    if (![...wanted].some(a => a !== canonical && related(a, canonical))) continue;
    if (!KNOWN_TECHNOLOGIES.has(canonical) && !FAMILIES.some(f => f.members.has(canonical))) continue; // a technology, not a concept
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of fieldText.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_.-])${escaped}(?![\\p{L}\\p{N}_-])`, "giu"))) {
      if (quoteTerms(match[0], fieldText).size && describesUse(fieldText, match[0])) return match[0];
    }
  }
  return null;
}

export const isDistinctPair = (a: string, b: string) => DISTINCT.has([a, b].sort().join("\u0000"));

const DUMP_LABEL = /^\W*(?:(?:ats|seo|resume)\s+)?(?:key\s*words?|search\s+terms?|tags?|seo|ats)\s*[:\-\u2013\u2014]/iu;
const LIST_LABEL = /^\W*(?:skills?|tools?|technolog(?:y|ies)|tech(?:\s+stack)?|stack|software|platforms?|environment|competenc(?:y|ies)|core\s+competenc(?:y|ies)|(?:areas?\s+of\s+)?expertise|proficienc(?:y|ies)|languages?|systems?)(?:\s+used)?\s*[:\-\u2013\u2014]/iu;
const fragments = (sentence: string) => sentence.split(/\s*[,|/\u2022\u00B7]\s*|\s+-\s+/).map(f => words(f)).filter(f => f.length);

/** A sentence written for a keyword filter rather than a reader: a "Keywords:" label, the same words
 * over and over, or a list repeating the same first or last word. It's never evidence of anything. */
export function keywordDump(sentence: string): boolean {
  const text = sentence.normalize("NFKC");
  if (DUMP_LABEL.test(text) || repeatsItself(text)) return true;
  const parts = fragments(text);
  const most = (values: string[]) => Math.max(0, ...[...new Set(values)].map(v => values.filter(x => x === v).length));
  if (parts.length >= 3 && most(parts.map(p => p[0])) >= 3 && !parts.some(p => WORK_VERBS.has(p[0]))) return true;
  if (parts.length >= 4 && most(parts.map(p => p[p.length - 1])) >= 4) return true;
  // No punctuation at all, and one word three times with no verb: "Tableau admin Tableau support Tableau reports".
  const all = words(text).filter(w => !GENERIC.has(w));
  return parts.length === 1 && most(all) >= 3 && !words(text).some(w => WORK_VERBS.has(w));
}

/** A labelled or long list of names: it may say what was around, not that the person did the work. */
export function labelledList(sentence: string): boolean {
  const text = sentence.normalize("NFKC");
  if (LIST_LABEL.test(text)) return true;
  const parts = fragments(text);
  return parts.length >= 6 && !words(text).some(w => WORK_VERBS.has(w));
}

/** The whole sentence around a position in free text. */
export function sentenceAt(text: string, start: number, end: number): string {
  const from = text.slice(0, start).search(/[^.!?;\n]*$/);
  const stop = text.slice(end).search(/[.!?;\n]/);
  return text.slice(from, stop < 0 ? text.length : end + stop);
}

const SOMEONE_ELSE_SENTENCE = /\b(?:beside|alongside|next to|shadow\w*|observ\w*)\b|\b(?:team|teams|group|groups|colleagues?|coworkers?|co-workers?|staff|engineers?|vendors?|contractors?|consultants?|someone|department)\s+(?:that|who|which)\b/i;
/** A clause opening with someone else as its subject: "Our engineers wrote the SQL", "My brother runs". */
const OTHER_SUBJECT = /^\W*(?:our|my|the|his|her|their)\s+(?:\w+\s+)?(?:engineers?|developers?|technicians?|nurses?|doctors?|lawyers?|brother|sister|father|mother|son|daughter|wife|husband|spouse|uncle|aunt|cousin|friend|dad|mom|partner|neighbou?r|roommate)\b/i;
const THIRD_PARTY_SUBJECT = /^\W*(?:my|our|the|a|an)\s+(?:\w+\s+)?(?:colleagues?|managers?|boss|supervisors?|coworkers?|co-workers?|teammates?|bookkeepers?|accountants?|vendors?|contractors?|consultants?|leads?|teams?|department|staff|predecessors?|mentors?|clients?|customers?|firms?)\b/i;
const DONE_BY_OTHERS = /^(?:\S+\s+){0,3}?(?:was|were|is|are|got)\s+(?:\w+\s+)?\w+\s+by\b/i;
/** The sentence says someone else did it: "My colleague ran Xero", "Xero was run by the finance team". */
export function someoneElsesWork(sentence: string, after: string): boolean {
  return THIRD_PARTY_SUBJECT.test(sentence) || OTHER_SUBJECT.test(sentence) || DONE_BY_OTHERS.test(after.trim());
}

// A sentence opening on someone else is about them. Only a clause of the person's own, after it, counts:
// "Our order lookup was slow, so I added indexes". A clause of theirs at the end is cut off.
const OPENS_ON_SOMEONE = /^\W*(?:our|his|her|their|another|they|she|he|my\s+(?:\p{L}+\s+)?(?:lead|boss|manager|supervisor|coworker|co-worker|colleague|team|partner|assistant|associate))\b/iu;
const OPENS_ON_THE = /^\W*the\b/i;
const OWN_CLAUSE = /(?:[,:;]\s*|\b(?:and|so|then|but|while|when|where|before|after)\s+)(?=(?:i|we)(?:['’](?:ve|m|d))?\s)/iu;
const THEIR_CLAUSE = /(?:[,:]\s*|\b(?:and|but|so|then|while|because|after)\s+)(?=(?:they|she|he)\s+\p{L})/iu;
/** The part of a sentence about this person, or null when there's none. `strict` also treats an opening
 * "The ..." as someone else, for answers. Resume bullets often open that way about the work itself. */
export function ownSpan(sentence: string, strict = false): [number, number] | null {
  let start = 0;
  if (OPENS_ON_SOMEONE.test(sentence) || (strict && OPENS_ON_THE.test(sentence))) {
    const own = OWN_CLAUSE.exec(sentence);
    if (!own) return null;
    start = own.index + own[0].length;
  }
  const theirs = THEIR_CLAUSE.exec(sentence.slice(start));
  const end = theirs ? start + theirs.index : sentence.length;
  return end > start ? [start, end] : null;
}

/** Past forms that don't end in -ed, at the start of a line about the work. */
export const IRREGULAR_PAST = new Set("kept drove ran wrote built made led taught drew sold bought held sent set cut spent paid took gave found told did met read bent hung dug fit won rode swept laid put began shot stood understood".split(" "));
/** A person or department doing it, named first, with no "I" anywhere: "Marcy administers Salesforce",
 * "Accounting handles the books". A work line opening on its verb ("Prepared paychecks") isn't one.
 * `strict` is for answers. */
export function opensOnNamedOther(sentence: string, strict = false): boolean {
  if (/(?:^|[^\p{L}'’])(?:[Ii]|[Ww]e)(?:['’]\p{L}+)?\s/u.test(sentence)) return false;
  const match = sentence.match(/^\W*(\p{Lu}[\p{L}'’-]*)\s+(?:(?:at|in|from|of)\s+(?:\p{L}+\s+){1,3})?(\p{Ll}{2,}[^s\W]s)\b(\s+(?:the|all|those|these|that|them|it|our|my|every|any)\b)?/u);
  if (!match) return false;
  // Resume fragments read like this ("Internal services over gRPC"), so a profile needs the clearer form.
  if (!strict && !match[3]) return false;
  const head = match[1].toLowerCase();
  if (IRREGULAR_PAST.has(head) || WORK_VERBS.has(head) || /(?:ed|es)$/.test(head)) return false;
  return !/ing$/.test(head) || !!match[3];
}

/** Where a sentence says someone else did it, as offsets within the sentence. */
export function thirdPartyCue(sentence: string, after: string): [number, number] | null {
  const subject = sentence.match(THIRD_PARTY_SUBJECT) ?? sentence.match(OTHER_SUBJECT);
  if (subject) return [subject.index ?? 0, (subject.index ?? 0) + subject[0].length];
  const other = sentence.match(SOMEONE_ELSE_SENTENCE);
  if (other) return [other.index ?? 0, (other.index ?? 0) + other[0].length];
  return DONE_BY_OTHERS.test(after.trim()) ? [0, sentence.length] : null;
}

/** A word that's only part of how the requirement names one known thing, in plain lower case, with nothing
 * technical beside it: "brass rails" isn't Ruby on Rails, though "Rails" and "rails apps" may be. */
export function fragmentOfLongerName(asked: string, fieldText: string, quote: string): boolean {
  if (!/^\p{Ll}+$/u.test(quote)) return false;
  // A word that is the thing's own name ("forklift", "react") isn't a fragment of anything.
  const named = [...canonicalTerms(asked)].some(term => term !== quote && VOCABULARY.has(term) && surfaceForms(term).some(form => form.includes(" ") && words(form).includes(quote)));
  return named && !hasTechContext(fieldText, quote);
}

/** Generic words that still say what was done. "Grant writing" asks for writing: reading grant applications
 * isn't it, though the word "grant" is the only term left once generic words are removed. */
const ACTION_FORMS: Record<string, RegExp> = {
  writing: /\b(?:writ\w*|wrote|draft\w*|author\w*|compos\w*|prepar\w*)\b/i,
  analysis: /\b(?:analy\w*|assess\w*|model\w*|forecast\w*|evaluat\w*)\b/i,
  design: /\b(?:design\w*|draft\w*|model\w*|layout\w*|sketch\w*|architect\w*|wrote|writ\w*|develop\w*|creat\w*|built)\b/i,
  repair: /\b(?:repair\w*|fix\w*|rebuil\w*|overhaul\w*|replac\w*|restor\w*|troubleshoot\w*|troubleshot|servic\w*|mend\w*)\b/i,
  installation: /\b(?:install\w*|fit\w*|mount\w*|hung|hang\w*|set\s+up|lay\w*|laid|wir\w*)\b/i,
};
/** The action a requirement asks for isn't stated in this sentence. */
export function actionMissing(asked: string, sentence: string): boolean {
  return words(asked).some(w => ACTION_FORMS[w] !== undefined && !ACTION_FORMS[w].test(sentence));
}

/** "iOS owners" names people; "Tableau for 300 users" says who the work served, which is still the work. */
function namesConsumers(after: string[]): boolean {
  const stop = after.slice(0, 3).findIndex(t => t === "for" || t === "to");
  return after.slice(0, stop < 0 ? 3 : stop).some(t => CONSUMER_NOUNS.has(t));
}

/** Where a quote occurs in free text, by whole word: the offsets that a check can then judge one at a time. */
export function occurrences(fieldText: string, quote: string): number[] {
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...fieldText.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu"))].map(m => m.index);
}

/** The text describes a technology as used in work: a work verb shortly before it, or a technical noun
 * or another known technology beside it. "Built Kafka consumers" does; "Kubernetes expertise confirmed"
 * does not. A mention alone is not evidence. */
export function describesUse(fieldText: string, quote: string, at?: number): boolean {
  const terms = canonicalTerms(quote);
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of fieldText.matchAll(pattern)) {
    if (at !== undefined && match.index !== at) continue;
    // Only the same sentence counts: a verb in the last sentence says nothing about this one.
    const before = words(fieldText.slice(0, match.index).split(/[.!?;\n]\s/).pop() ?? "");
    const after = words(fieldText.slice(match.index + match[0].length).split(/[.!?;\n]\s/)[0]);
    const negative = new Set([...terms].flatMap(t => WORD_NEGATIVE[t] ?? []));
    if ([...before.slice(-4), ...after.slice(0, 4)].some(t => negative.has(t) && !FUNCTION_WORDS.has(t))) continue;
    const sentence = sentenceAt(fieldText, match.index, match.index + match[0].length);
    if (keywordDump(sentence) || someoneElsesWork(sentence, fieldText.slice(match.index + match[0].length).split(/[.!?;\n]\s/)[0])) continue;
    if (before.slice(-5).some(t => WORK_VERBS.has(t))) return true;
    // "Helped iOS and Android owners" names who was helped, not what was used.
    if (namesConsumers(after)) continue;
    if ([...before.slice(-3), ...after.slice(0, 3)].some(t => TECH_CONTEXT.has(t) || (VOCABULARY.has(t) && !terms.has(t)))) return true;
  }
  return directUse(fieldText, quote, false, at);
}

const WEAK_VERBS = new Set("read set sets filed handled handle balanced balance models designs codes scripts programs ships trains tests monitors".split(" "));
const STRONG_VERBS = new Set([...WORK_VERBS].filter(v => /(ed|ing|s)$|^(built|wrote|written|ran|rewrote|rewritten|rebuilt|troubleshot)$/.test(v) && !WEAK_VERBS.has(v)));
const NOT_WORK = new Set("about regarding discussed discussing attended attending learning studying watched watching interested heard talk talks webinar course class hobby curious considering".split(" "));
const WORK_OBJECTS = new Set("support administration resets reset troubleshooting deployment deployments migration migrations maintenance cluster clusters server servers pipeline pipelines consumer consumers module modules query queries service services api apis app apps application applications development script scripts dashboard dashboards configuration".split(" "));
const SOMEONE_ELSE = /\b(beside|alongside|near|next to|shadow\w*|observ\w*|assist\w* (?:the|a)|lunch)\b|\b(team|teams|group|groups|colleagues?|coworkers?|co-workers?|others?|people|staff|engineers?|vendors?|contractors?|consultants?|someone|department)\s+(that|who|which)\b|\b(they|he|she)\s+\w+$/;
const CARRIERS = new Set("service services api apis app apps application applications system systems pipeline pipelines tool tools".split(" "));

/** The text states this technology was used in the work itself, in that sentence: a strong work verb
 * shortly before it ("Rewrote the payments service in Go"), a work object right after it ("Windows
 * support"), or something carried over it ("Internal services over gRPC"). A mention, a course, or
 * what someone else does isn't use, and neither is a job title alone. */
export function directUse(fieldText: string, quote: string, sameOtherSense = false, at?: number): boolean {
  const terms = canonicalTerms(quote);
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of fieldText.matchAll(pattern)) {
    if (at !== undefined && match.index !== at) continue;
    const before = words(fieldText.slice(0, match.index).split(/[.!?;\n]\s/).pop() ?? "");
    const after = words(fieldText.slice(match.index + match[0].length).split(/[.!?;\n]\s/)[0]);
    const near = before.slice(-5);
    const negative = new Set(sameOtherSense ? [] : [...terms].flatMap(t => WORD_NEGATIVE[t] ?? []));
    if ([...before.slice(-4), ...after.slice(0, 4)].some(t => negative.has(t) && !FUNCTION_WORDS.has(t))) continue;
    if (near.some(t => NOT_WORK.has(t))) continue;
    // A list of names isn't a statement that the person did the work.
    const sentence = sentenceAt(fieldText, match.index, match.index + match[0].length);
    if (keywordDump(sentence) || labelledList(sentence)) continue;
    // Someone else's work: "Sat beside the team that ran Kubernetes".
    if (SOMEONE_ELSE.test(before.join(" ")) || someoneElsesWork(sentence, fieldText.slice(match.index + match[0].length).split(/[.!?;\n]\s/)[0])) continue;
    if (namesConsumers(after)) continue;
    if (near.some(t => STRONG_VERBS.has(t))) return true;
    if (after.slice(0, 2).some(t => WORK_OBJECTS.has(t))) return true;
    if (["over", "via", "using", "with", "on"].includes(before[before.length - 1]) && CARRIERS.has(before[before.length - 2])) return true;
  }
  return false;
}

type Activity = { asks: string[]; verbs: string[]; nouns: string[]; context: string[]; level: "supported" | "possible" };
const ACTIVITIES = (table as unknown as { activities: Activity[] }).activities;
/** Work a role describes as an activity: a reviewed verb shortly before a reviewed noun, in one sentence,
 * for a requirement that names that activity. Returns the words as written. */
export function activityEvidence(requirementText: string, fieldText: string, titleText = ""): { quote: string; level: Activity["level"] } | null {
  for (const activity of ACTIVITIES) {
    if (!activity.asks.some(phrase => containsPhrase(requirementText, phrase))) continue;
    const pattern = new RegExp(`(?<![\\p{L}])(?:${activity.verbs.join("|")})(?:\\s+[\\p{L}\\p{N}-]+){0,3}?\\s+(?:${activity.nouns.join("|")})(?![\\p{L}])`, "giu");
    for (const match of fieldText.matchAll(pattern)) {
      const sentenceStart = fieldText.slice(0, match.index).search(/[^.!?;\n]*$/);
      const rest = fieldText.slice(match.index);
      const sentence = fieldText.slice(sentenceStart, match.index + (rest.search(/[.!?;\n]/) < 0 ? rest.length : rest.search(/[.!?;\n]/)));
      if (activity.context.length && ![...words(sentence), ...words(titleText)].some(w => activity.context.includes(w))) continue;
      return { quote: match[0], level: activity.level };
    }
  }
  return null;
}

/** Parts of free text saying a technology wasn't used or isn't known: from the negation to the end of
 * that clause, so "Never used Terraform, but built Ansible playbooks" still counts for Ansible. */
export function negatedSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const match of text.matchAll(NEGATION)) {
    const rest = text.slice(match.index);
    if (/^not\s+(only|limited)\b/i.test(rest)) continue;
    // The negation reaches the end of the sentence unless a contrast introduces other work: in "never
    // used Terraform, but quote the word Terraform", the second mention is no evidence either.
    const sentence = rest.search(/[.!?;\n]/);
    let end = sentence < 0 ? rest.length : sentence;
    for (const contrast of rest.slice(0, end).matchAll(/\b(?:but|however|although|though|while)\b((?:\s+\p{L}+){0,3})/giu)) {
      if (words(contrast[1]).some(w => WORK_VERBS.has(w))) {
        end = contrast.index;
        break;
      }
    }
    // A comma followed by a work verb starts another clause ("Never used Docker, built Kafka consumers").
    for (const comma of rest.slice(0, end).matchAll(/,\s*(\p{L}+)/gu)) {
      if (WORK_VERBS.has(comma[1].toLowerCase())) {
        end = comma.index;
        break;
      }
    }
    spans.push([match.index, match.index + end]);
  }
  return spans;
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
const FIELD_SYNONYMS = Object.entries((table as unknown as { field_synonyms: Record<string, string[]> }).field_synonyms)
  .flatMap(([canonical, names]) => names.map(name => [name, canonical] as const))
  .sort((a, b) => b[0].length - a[0].length);
/** Other languages' and short names for a field: "Informatik" and "CSE" are computer science. */
export function normalizedField(text: string): string {
  let result = text;
  for (const [name, canonical] of FIELD_SYNONYMS) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), canonical);
  }
  return result;
}
export const degreeNames = (table as unknown as { degree_names: Record<string, number> }).degree_names;
const EQUIVALENT_WHEN_ASKED = new Set((table as unknown as { equivalent_when_asked: string[] }).equivalent_when_asked);
/** A foreign degree accepted because the requirement itself says "or equivalent". */
export const equivalentWhenAsked = (requirementText: string, qualification: string) =>
  /\bor\s+(an?\s+)?equivalent\b/i.test(requirementText) && words(qualification).some(w => EQUIVALENT_WHEN_ASKED.has(w));
export const comparableDegrees = (table as unknown as { comparable_degrees: Record<string, number> }).comparable_degrees;
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
  const have = new Set(words(normalizedField(fieldOfStudy)));
  return fieldAlternatives(normalizedField(requirementText)).some(wanted =>
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
