import { IRREGULAR_PAST, WORK_VERB_WORDS } from "@/lib/ai/skill-relations";

// Where a sentence moves from one person to another. "I plan the small-group activities myself, the lead teacher
// plans the whole-class lessons" is two clauses with two subjects, and only the first is the person's own. This
// reads the shape of the sentence, a boundary, then a subject, then a verb, instead of listing what the other
// person might do. English only, like everything that reads answers.

/** Words that join clauses. A boundary is punctuation, one of these, or both. */
const BOUNDARY = /(?:[,;:–—]\s*(?:(?:and|but|while|whereas|so|then|though|although)\s+)?|\s+(?:and|but|while|whereas|though|although)\s+)/giu;
const DETERMINER = new Set("the a an our my their his her its this that these those another each every some one two three any all".split(" "));
const PRONOUN = new Set("he she they someone somebody everyone everybody nobody others".split(" "));
/** Never part of a subject's name, so a subject stops before them. */
const NOT_A_NOUN = new Set("and or but to of for with in on at by from as if when then so i we you it is are was were be been am do does did has have had can could will would should may might must not no never".split(" "));
/** Finite verbs that don't look like verbs from their ending alone. */
const FINITE = new Set("is are was were has have had does do did can could will would should may might must gets got takes took makes made keeps kept goes went comes came runs ran sees saw says said gives gave puts set sets handles".split(" "));

/** A word that can be a finite verb after a subject: "plans", "changed", "did", or a work verb after a plural subject. */
function finiteVerb(word: string, pluralSubject: boolean): boolean {
  const w = word.toLowerCase();
  if (FINITE.has(w) || IRREGULAR_PAST.has(w)) return true;
  if (/^\p{Ll}{3,}(?:ed)$/u.test(w)) return true;
  if (/^\p{Ll}{2,}[^su\W]s$/u.test(w) || /^\p{Ll}{2,}(?:es)$/u.test(w)) return !pluralSubject;
  return pluralSubject && WORK_VERB_WORDS.has(w);
}

export type ClauseSubject = "self" | "team" | "other";

/** The subject at the start of `text`, if a subject and its verb start there. */
export function subjectAt(text: string, atSentenceStart = false): ClauseSubject | null {
  const tokens = text.match(/[\p{L}'’-]+|[^\s\p{L}]/gu) ?? [];
  const first = (tokens[0] ?? "").toLowerCase();
  if (/^i(?:['’](?:ve|m|d|ll))?$/.test(first)) return "self";
  if (/^we(?:['’](?:ve|re|d|ll))?$/.test(first)) return "team";
  const next = tokens[1] ?? "";
  if (PRONOUN.has(first)) return (/^\p{L}/u.test(next) && !NOT_A_NOUN.has(next.toLowerCase())) || FINITE.has(next.toLowerCase()) ? "other" : null;
  // A name: "Marta does the stitching". Up to two capitalized words, then a verb. Not at the start of a sentence,
  // where a capital is just the first word ("Plasma cut plate every day", "Wrote Terraform modules"), and not a verb.
  if (/^\p{Lu}\p{Ll}+$/u.test(tokens[0] ?? "") && !DETERMINER.has(first)) {
    if (atSentenceStart || IRREGULAR_PAST.has(first) || WORK_VERB_WORDS.has(first) || /(?:ed|ing)$/.test(first)) return null;
    let at = 1;
    if (/^\p{Lu}\p{Ll}+$/u.test(tokens[at] ?? "")) at++;
    return finiteVerb(tokens[at] ?? "", false) && /^\p{L}/u.test(tokens[at + 1] ?? "") ? "other" : null;
  }
  // "the lead teacher plans", "our network engineer actually changes", "the techs handle".
  if (!DETERMINER.has(first)) return null;
  for (let length = 1; length <= 4; length++) {
    const noun = tokens.slice(1, 1 + length);
    if (noun.length < length || noun.some(w => !/^[\p{L}'’-]+$/u.test(w) || NOT_A_NOUN.has(w.toLowerCase()) || DETERMINER.has(w.toLowerCase()))) return null;
    let at = 1 + length;
    if (/^(?:actually|really|usually|always|also|just|then|now|still|mostly)$/i.test(tokens[at] ?? "")) at++;
    const head = noun[noun.length - 1].toLowerCase();
    const plural = /[^s]s$/.test(head) || /(?:people|staff|crew|team|men|women|folks)$/.test(head);
    // A verb with something after it: "plans the lessons", not a list item like "the lesson plans, and".
    if (/^(?:is|are|was|were)$/i.test(tokens[at] ?? "") && /^(?:mine|ours|my|our)$/i.test(tokens[at + 1] ?? "")) return null;
    if (finiteVerb(tokens[at] ?? "", plural) && /^\p{L}/u.test(tokens[at + 1] ?? "") && !NOT_A_NOUN.has((tokens[at + 1] ?? "").toLowerCase())) return "other";
  }
  return null;
}

export type Clause = { text: string; start: number; subject: ClauseSubject | null };

/** Words for people and organisations who do work: "the sonographer", "our consultant", "the plow company". */
const PERSON = /(?:^|\s)(?:he|she|they|someone|somebody|everyone|others|\p{Lu}\p{Ll}+|[\p{L}-]*(?:er|ers|or|ors|ist|ists|ian|ians|ant|ants|ent|ents|ee|ees)|guy|guys|man|men|woman|women|person|people|staff|crew|crews|team|teams|tech|techs|nurse|nurses|doctor|doctors|chef|chefs|boss|lead|partner|partners|vendor|vendors|company|firm|agency|contractor|contractors|coworker|coworkers|colleague|colleagues|husband|wife|son|daughter|dad|mom|brother|sister)\b/u;
/** Verbs for something happening, not someone doing the work: "a customer came in", "they called". */
const HAPPENED = /^\W*(?:\S+\s+){0,4}?(?:came|comes|went|goes|called|calls|asked|asks|wanted|wants|needed|needs|said|says|told|tells|showed|shows|walked|walks|stopped|stops|left|leaves|arrived|arrives|happened|happens|liked|likes|loved|loves|hated|hates)\b/iu;

/** Someone else, a person or a firm, doing something in the same sentence as the person's own clause: "he did the
 * ratings, I took the photos". A whole sentence about someone else's part isn't this. */
export function handsPartToSomeoneElse(sentence: string): boolean {
  const clauses = splitBySubject(sentence);
  if (!clauses.some(c => c.subject === "self" || c.subject === "team")) return false;
  return clauses.some(c => {
    if (c.subject !== "other") return false;
    const head = c.text.trim().split(/\s+/).slice(0, 5).join(" ");
    return PERSON.test(head) && !HAPPENED.test(c.text);
  });
}

/** A sentence cut where another subject takes over, and again where the person comes back: "I do the bookkeeping,
 * my partner does payroll, and I file the taxes" is three clauses. Clauses of the same subject stay together, so
 * nothing about a sentence of the person's own changes. */
export function splitBySubject(sentence: string): Clause[] {
  const cuts: { at: number; subject: ClauseSubject }[] = [];
  let current: ClauseSubject | null = subjectAt(sentence.replace(/^\W+/, ""), true);
  for (const boundary of sentence.matchAll(BOUNDARY)) {
    const at = boundary.index + boundary[0].length;
    const subject = subjectAt(sentence.slice(at));
    if (!subject) continue;
    // Only a change of hands is a cut: to someone else, or back to the person after someone else.
    if (subject === "other" ? current !== "other" : current === "other") {
      cuts.push({ at: boundary.index, subject });
      current = subject;
    }
  }
  const out: Clause[] = [];
  let from = 0;
  let subject = subjectAt(sentence.replace(/^\W+/, ""), true);
  for (const cut of cuts) {
    out.push({ text: sentence.slice(from, cut.at), start: from, subject });
    const body = sentence.slice(cut.at).match(BOUNDARY_AT_START);
    from = cut.at + (body ? body[0].length : 0);
    subject = cut.subject;
  }
  out.push({ text: sentence.slice(from), start: from, subject });
  return out.filter(c => c.text.trim());
}
const BOUNDARY_AT_START = new RegExp(`^${BOUNDARY.source}`, "iu");
