import structure from "@/lib/ai/rules/data/requirement_structure.json";
import { canonicalTerms, GENERIC_TERMS, VOCABULARY, HANDED_OFF, keywordDump, negatedSpans, opensOnNamedOther, ownSpan } from "@/lib/ai/skill-relations";
import { directedSpans, evaluatorDirected, segments } from "@/lib/ai/untrusted-text";
import { notAStatement, statesNotDoing, templateText } from "@/lib/ai/rules/profile-fields";

// A structured reading of each requirement. Authoritative since Milestone 7; the frozen Python copy
// is only a test reference. Only what is requested (the head and its listed alternatives) can earn credit; later required
// clauses only add mandatory groups; optional, supplemental, and instruction-like text never count.
// A requirement containing instructions or evaluation language needs the person's confirmation
// before it is judged.

const re = (pattern: string) => new RegExp(pattern, "i");
const NEED = re(structure.need_markers);
const OPTIONAL = re(structure.optional_markers);
const CLAIM = re(structure.relation_claim);
const EVALUATION_REFERENCE = re(structure.evaluation_reference);
const PROFILE_META = re(structure.profile_meta);
const LIST_LEAD = re(structure.list_lead);
const AND_SPLIT = re(structure.and_split);
const OR_MARKER = re(structure.or_marker);
const AND_MARKER = re(structure.and_marker);
const EVALUATION_LANGUAGE = structure.evaluation_language.map(re);
const EVALUATION_EXEMPT = new RegExp(structure.evaluation_exempt, "gi");
const PROFILE_LABEL = re(structure.profile_label);
const UNVERIFIABLE_FIELD = re(structure.unverifiable_field);
const PROFILE_CLAIM = re(structure.profile_claim);
const AS = /\bas\b/gi;
const NOT_A_CLAIM_AS = /\b(such|as\s+well)\s+as\b|\bas\s+(a|an|the|well|part|needed|required|of)\b/gi;
const ITEM_STOPWORDS = new Set<string>([...structure.item_stopwords, ...GENERIC_TERMS]);
const TOKEN = /[A-Za-z][A-Za-z0-9+#.-]*/g;
const tokens = (text: string) => text.match(TOKEN) ?? [];

export function namesAnItem(text: string, listed: ReadonlySet<string> = new Set()): boolean {
  for (const term of canonicalTerms(text)) if (VOCABULARY.has(term) || listed.has(term)) return true;
  for (const token of tokens(text)) {
    const low = token.toLowerCase().replace(/^[.-]+|[.-]+$/g, "");
    if (!low || ITEM_STOPWORDS.has(low)) continue;
    if (/^[A-Z]/.test(token) || /[A-Z]/.test(token.slice(1)) || /[0-9+#]/.test(token)) return true;
  }
  return false;
}

export function isRelationClaim(text: string, listed: ReadonlySet<string> = new Set()): boolean {
  if (!CLAIM.test(text)) return false;
  const items = tokens(text).filter(t => namesAnItem(t, listed));
  return items.length >= 2 || EVALUATION_REFERENCE.test(text) || /full\s+(match|credit)/i.test(text);
}

const withoutExempt = (text: string) => text.replace(EVALUATION_EXEMPT, " ");
export const evaluationLanguage = (text: string) => EVALUATION_LANGUAGE.some(p => p.test(withoutExempt(text)));

/** A clause relating two named items with "as": "Java experience will be scored as Kotlin experience". */
export function itemAsItem(text: string, listed: ReadonlySet<string> = new Set()): boolean {
  const cleaned = text.replace(NOT_A_CLAIM_AS, " ");
  for (const match of cleaned.matchAll(AS)) {
    if (namesAnItem(cleaned.slice(0, match.index), listed) && namesAnItem(cleaned.slice(match.index + match[0].length), listed)) return true;
  }
  return false;
}

export function pieces(clause: string, listed: ReadonlySet<string> = new Set()): string[] {
  const hasOr = OR_MARKER.test(clause);
  const hasAnd = AND_MARKER.test(clause);
  const parts = hasOr && !hasAnd ? [clause] : hasOr ? clause.split(/\s+and\s+/i) : clause.split(AND_SPLIT);
  const found = parts
    .map(part => part.replace(/^[\s.;:]+|[\s.;:]+$/g, "").replace(/^(and|or)\s+/i, ""))
    .filter(part => part && namesAnItem(part, listed));
  // "Python required, Go preferred": a preferred part of a list is never mandatory.
  const required = found.filter(part => !OPTIONAL.test(part));
  return required.length ? required : found;
}

/** An aside that only lists items: "(Terraform)", "(e.g. SQS)", "(Kafka or Kinesis)". */
export function itemList(aside: string, listed: ReadonlySet<string> = new Set()): boolean {
  const inner = aside.replace(LIST_LEAD, "").trim().replace(/[)\]]+$/, "").replace(/^[\s.]+|[\s.]+$/g, "");
  const parts = inner.split(/,|\bor\b|\band\b|\//i).map(x => x.trim()).filter(Boolean);
  return parts.length > 0 && parts.every(x => tokens(x).length <= 3 && tokens(x).every(t => namesAnItem(t, listed)));
}

export type Structure = {
  head: string;
  pieces: string[];
  headPieces: string[];
  creditText: string;
  optional: string[];
  supplemental: string[];
  instructions: string[];
  needsReview: boolean;
  reviewReasons: string[];
};

export function parseRequirement(text: string, listed: ReadonlySet<string> = new Set(), confirmed = false): Structure {
  let head = "";
  let headPieces: string[] = [];
  const extra: string[] = [];
  const optional: string[] = [];
  const supplemental: string[] = [];
  const instructions: string[] = [];
  const plain: string[] = [];
  const reasons: string[] = [];
  for (const [start, end] of segments(text)) {
    const clause = text.slice(start, end).trim();
    if (evaluatorDirected(clause)) {
      instructions.push(clause);
      reasons.push("instructions");
      continue;
    }
    // Once confirmed, the wording is judged as written; text addressed to an AI stays excluded.
    if (!confirmed && (isRelationClaim(withoutExempt(clause), listed) || evaluationLanguage(clause) || itemAsItem(clause, listed))) {
      instructions.push(clause);
      reasons.push("evaluation_language");
      continue;
    }
    if ("([{".includes(clause[0] ?? "x")) {
      if (head && itemList(clause, listed)) {
        headPieces[headPieces.length - 1] = `${headPieces[headPieces.length - 1]} ${clause}`;
        head = `${head} ${clause}`;
      } else supplemental.push(clause);
      continue;
    }
    plain.push(clause);
    const found = pieces(clause, listed);
    if (!head) {
      if (found.length) [head, headPieces] = [clause, found];
      else supplemental.push(clause);
      continue;
    }
    if (OPTIONAL.test(clause)) optional.push(clause);
    else if (found.length && NEED.test(clause)) extra.push(...found);
    else supplemental.push(clause);
  }
  return {
    head,
    pieces: [...headPieces, ...extra],
    headPieces,
    creditText: head || plain.join(" "),
    optional,
    supplemental,
    instructions,
    needsReview: reasons.length > 0 && !confirmed,
    reviewReasons: [...new Set(reasons)],
  };
}

export function listedTerms(skillNames: string[]): Set<string> {
  const terms = new Set<string>();
  for (const name of skillNames) for (const term of canonicalTerms(name)) terms.add(term);
  return terms;
}

/** "Degree in a related field": a field is required, but code can't tell which ones count. */
export const unverifiableField = (text: string) => UNVERIFIABLE_FIELD.test(text);

type Span = [number, number];

/** Parts of profile text that are never evidence: aimed at the evaluator, about the evaluation, or
 * about the person in the third person. */
export function untrustedEvidenceSpans(text: string): Span[] {
  const spans = new Map<string, Span>();
  for (const span of directedSpans(text)) spans.set(span.join(":"), span);
  for (const [s, e] of segments(text)) {
    const segment = text.slice(s, e);
    if (EVALUATION_REFERENCE.test(segment) || PROFILE_META.test(segment) || PROFILE_LABEL.test(segment) || PROFILE_CLAIM.test(segment) || isRelationClaim(segment) || evaluationLanguage(segment)) {
      spans.set(`${s}:${e}`, [s, e]);
    }
  }
  for (const span of negatedSpans(text)) spans.set(span.join(":"), span);
  // A sentence written for a keyword filter: nothing in it is a statement about the work.
  for (const match of text.matchAll(/[^.!?;\n]+[.!?;\n]?/g)) {
    if (keywordDump(match[0])) spans.set(`${match.index}:${match.index + match[0].length}`, [match.index, match.index + match[0].length]);
  }
  // A hypothetical, a template, or an order about what to report, including one taken back in an aside.
  // The same sentence three times over is written for a filter, not a reader.
  // A template is no one's experience, so a field holding one can't count at all, even beside its own
  // plausible sentences. Quoted words are someone else's unless they're a short name.
  if (templateText(text)) spans.set(`0:${text.length}`, [0, text.length]);
  for (const match of text.matchAll(/["“”«»]([^"“”«»]{20,})["“”«»]|(?<![\p{L}\p{N}])'([^']{20,})'(?![\p{L}\p{N}])/gu)) {
    spans.set(`${match.index}:${match.index + match[0].length}`, [match.index, match.index + match[0].length]);
  }
  const sentences = [...text.matchAll(/[^.!?\n]+[.!?\n]?/g)];
  const said = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();
  const times = new Map<string, number>();
  for (const match of sentences) times.set(said(match[0]), (times.get(said(match[0])) ?? 0) + 1);
  for (const match of sentences) {
    if (notAStatement(match[0]) || (times.get(said(match[0])) ?? 0) >= 3 || opensOnNamedOther(match[0].trim()) || HANDED_OFF.test(match[0])) spans.set(`${match.index}:${match.index + match[0].length}`, [match.index, match.index + match[0].length]);
    // Someone else's part of a sentence is theirs, even with the person's own part after it.
    const own = ownSpan(match[0].trim());
    const offset = match[0].length - match[0].trimStart().length;
    if (!own) spans.set(`${match.index}:${match.index + match[0].length}`, [match.index, match.index + match[0].length]);
    else if (own[0] > 0) spans.set(`${match.index}:${match.index + offset + own[0]}`, [match.index, match.index + offset + own[0]]);
  }
  return [...spans.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** The same, for a person's answer to a question. Naming "every assessment" or "the application" isn't a
 * remark about being judged when someone is describing their work, so a bare reference doesn't count here. */
/** Why part of an answer can't be read: aimed at the evaluator, a remark about judging or a claim about the profile,
 * a negative about the person, a list or a fragment, a template, or someone else's quoted words. */
export type UntrustedKind = "directed" | "remark" | "negated" | "not_done" | "list" | "template" | "quoted";
/** "Keep the count for each picker" is a tally, not a claim that something counts for something. */
const NOUN_COUNT = /\b(?:the|a|an|each|every|daily|weekly|nightly|head|inventory|cycle|bin|pallet|my|our|their)\s+counts?\s+(?:for|of|on|toward)\b/gi;
/** rules-v21: "the individual 1040s", "the user accounts", "the employee handbook" use the word as an adjective, not to
 * talk about a candidate ("the individual has…", "the candidate meets…"). Only that adjective use is set aside. */
const META_AS_ADJECTIVE = /\b(?:this|the)\s+(?:individual|employee|user|person)\s+(?!(?:is|was|were|has|had|have|does|did|can|could|will|would|should|must|meets?|met|shows?|showed|demonstrates?|demonstrated|possess(?:es)?|possessed|appears?|seems?|needs?|lacks?|qualif(?:y|ies)|['’]s)\b)(?=[\p{L}\p{N}])/giu;

export function answerUntrustedParts(text: string, v21 = false): { span: Span; kind: UntrustedKind }[] {
  const parts: { span: Span; kind: UntrustedKind }[] = [];
  for (const span of directedSpans(text)) parts.push({ span, kind: "directed" });
  for (const [s, e] of segments(text)) {
    const segment = text.slice(s, e);
    if (PROFILE_META.test(v21 ? segment.replace(META_AS_ADJECTIVE, " ") : segment) || PROFILE_LABEL.test(segment) || PROFILE_CLAIM.test(segment.replace(NOUN_COUNT, " ")) || isRelationClaim(segment) || evaluationLanguage(segment.replace(/\binstead\s+of\s+\p{L}+ing\b/giu, " "))) parts.push({ span: [s, e], kind: "remark" });
  }
  // A negative about someone else ("clients who never paid") doesn't bar the person's own work beside it.
  const sentences = [...text.matchAll(/[^.!?;\n]+/g)];
  for (const span of negatedSpans(text)) {
    const sentence = sentences.find(m => m.index <= span[0] && span[0] < m.index + m[0].length);
    if (!sentence || statesNotDoing(sentence[0])) parts.push({ span, kind: "negated" });
  }
  for (const match of text.matchAll(/[^.!?;\n]+[.!?;\n]?/g)) {
    // "I rebuilt the course, new labs, new assessments" lists what the person did. A dump has no one doing anything.
    const someoneDoes = /(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s+\p{L}{3,}/iu.test(match[0]) && match[0].split(/\s+/).length >= 12;
    if (keywordDump(match[0]) && !someoneDoes) parts.push({ span: [match.index, match.index + match[0].length], kind: "list" });
    else if (notAStatement(match[0])) parts.push({ span: [match.index, match.index + match[0].length], kind: "not_done" });
  }
  if (templateText(text)) parts.push({ span: [0, text.length], kind: "template" });
  // Quoted words are someone else's, as they are in a profile.
  for (const match of text.matchAll(/["“”«»]([^"“”«»]{20,})["“”«»]|(?<![\p{L}\p{N}])'([^']{20,})'(?![\p{L}\p{N}])/gu)) {
    parts.push({ span: [match.index, match.index + match[0].length], kind: "quoted" });
  }
  return parts;
}
export function answerUntrustedSpans(text: string, v21 = false): Span[] {
  const spans = new Map<string, Span>();
  for (const { span } of answerUntrustedParts(text, v21)) spans.set(span.join(":"), span);
  return [...spans.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** For the job review, which doesn't know the profile: true whenever the analysis could flag this
 * requirement for any profile, so the person can always confirm what the analysis asks about. */
export const mayNeedConfirmation = (text: string) =>
  parseRequirement(text).needsReview || segments(text).some(([s, e]) => CLAIM.test(text.slice(s, e)));

// --- Structured ownership (Phase 5.3 Stage 2). Read only by structured-answer.ts and the owner-review report; matching and
// the review queue don't use these yet. ---

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, eighteen: 18, "twenty-four": 24 };
const COUNT = "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty-four)";
const RECENCY_WINDOW = new RegExp(`\\b(?:within|in|during|over|from)\\s+the\\s+(?:last|past|previous|most\\s+recent)\\s+${COUNT}\\s+(years?|months?)\\b`, "i");
const RECENCY_ONE = /\b(?:within|in|during|over)\s+the\s+(?:last|past|previous)\s+(year|twelve\s+months|month)\b/i;
const RECENT_WORK = /\brecent(?:ly)?\s+(?:\w+\s+){0,3}?(?:experience|work(?:ed|ing)?|hands[- ]on|practice|performed|employment)\b|\b(?:experience|work)\s+(?:must\s+be|should\s+be|that\s+is|is)\s+recent\b/i;
const CURRENT_WORK = /\bcurrent(?:ly)?\s+(?:working|performing|doing|employed|practicing|using|hands[- ]on|experience)\b|\bin\s+a\s+current\s+role\b/i;

/** Whether a requirement explicitly asks for recent or current experience (D2), and its window in months when stated.
 * Only explicit wording counts; an unclear requirement is treated as not asking. "Recent graduates" isn't recent work. */
export type RecencyRequirement = { asks: boolean; windowMonths: number | null; current: boolean; phrase: string | null };
export function explicitRecency(text: string): RecencyRequirement {
  const window = text.match(RECENCY_WINDOW);
  if (window) {
    const n = /^\d+$/.test(window[1]) ? Number(window[1]) : NUMBER_WORDS[window[1].toLowerCase()];
    return { asks: true, windowMonths: /^month/i.test(window[2]) ? n : n * 12, current: false, phrase: window[0] };
  }
  const one = text.match(RECENCY_ONE);
  if (one) return { asks: true, windowMonths: /^month/i.test(one[1]) ? 1 : 12, current: false, phrase: one[0] };
  const current = text.match(CURRENT_WORK);
  if (current) return { asks: true, windowMonths: 0, current: true, phrase: current[0] };
  const recent = text.match(RECENT_WORK);
  if (recent) return { asks: true, windowMonths: null, current: false, phrase: recent[0] };
  return { asks: false, windowMonths: null, current: false, phrase: null };
}

/** A proposed split of a requirement into necessary parts (O3). Proposals only: nothing uses a split until the owner
 * approves it. `single` and `item_list` propose no new split (item lists are already read piece by piece). */
export type CompoundKind = "single" | "alternatives" | "item_list" | "task_compound" | "ambiguous";
export type CompoundProposal = { requirement: string; core: string; kind: CompoundKind; parts: string[]; pattern: string | null; reason: string };

const LEAD_IN = /^(?:(?:at\s+least|minimum(?:\s+of)?|over)\s+)?(?:\d+\s*\+?|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:years?|yrs?|months?)\s+(?:of\s+)?|^(?:(?:demonstrated|proven|hands[- ]on|strong|solid|working|prior|previous|recent|professional|practical|direct|extensive|some)\s+)*(?:experience|proficiency|knowledge|familiarity|background|skills?|expertise)\s+(?:in|with|of|using|performing|doing|on)\s+|^(?:hands[- ]on\s+)?experience\s+(?=\w+ing\b)|^(?:must\s+be\s+)?(?:able|ability)\s+to\s+|^(?:responsible\s+for|responsibilities\s+include|duties\s+include)\s+/i;
const COORDINATION = /\s*,\s*(?:and\s+|&\s+)?|\s+(?:and|&|as\s+well\s+as)\s+/i;
const ACTION = /(?:ing|tion|sion|ment|ance|ence|ysis)$/i;
const MODIFIER = /(?:al|ic|ive|ous|ful|ble|en|ary|ish|less)$/i;
const isAction = (w: string) => w.length > 4 && ACTION.test(w);
const isModifier = (w: string) => w.length > 3 && MODIFIER.test(w) && !isAction(w);
const words = (s: string) => s.split(/\s+/).filter(Boolean);
// A named item is a whole reviewed term or a listed skill ("Python", "SQL"), not a phrase that merely contains one.
const namedItem = (part: string, listed: ReadonlySet<string>) => words(part).length <= 3 && !words(part).some(isAction) && (VOCABULARY.has(part.toLowerCase()) || listed.has(part.toLowerCase()));

/** The requirement's own task phrase: the head clause without lead-ins ("3+ years of", "Experience with", "Ability to"). */
export function requirementCore(text: string, listed: ReadonlySet<string> = new Set()): string {
  const head = parseRequirement(text, listed).head || text;
  // Examples after "including" or "such as" illustrate one task; they aren't separate requirements.
  let core = head.replace(/\s*[([{].*$/, "").replace(/\s*,?\s*\b(?:including|such\s+as|e\.g\.|for\s+example)\b.*$/i, "").replace(/[.;:]+$/, "").trim();
  for (let i = 0; i < 4; i++) {
    const next = core.replace(LEAD_IN, "").trim();
    if (next === core) break;
    core = next;
  }
  return core;
}

export function proposeCompoundSplit(text: string, listed: ReadonlySet<string> = new Set()): CompoundProposal {
  const core = requirementCore(text, listed);
  const make = (kind: CompoundKind, parts: string[], pattern: string | null, reason: string): CompoundProposal => ({ requirement: text, core, kind, parts, pattern, reason });
  const hasAnd = /\s(?:and|&|as\s+well\s+as)\s|,/i.test(core);
  const hasOr = /\bor\b|\band\/or\b/i.test(core);
  if (!hasAnd) return make(hasOr ? "alternatives" : "single", [], null, hasOr ? "any one alternative is enough" : "one task");
  if (hasOr) return make("ambiguous", [], null, "mixes 'and' with 'or'");
  if (VOCABULARY.has(core.toLowerCase())) return make("single", [], null, "a reviewed single term");
  const parts = core.split(COORDINATION).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return make("single", [], null, "one task");
  const [l0, r0] = [words(parts[0]), words(parts[parts.length - 1])];
  if (parts.length === 2 && ((l0.length >= 2 && r0.length === 1 && isModifier(r0[0])) || (r0.length >= 2 && isModifier(l0[l0.length - 1]) && isModifier(r0[0]))))
    return make("single", [], null, "coordinated modifiers of one thing");
  if (parts.every(p => namedItem(p, listed))) return make("item_list", [], null, "a list of named items, already read piece by piece");
  if (parts.length > 3) return make("ambiguous", parts, null, "more than three parts");
  if (parts.some(p => /\b\d+\s*\+?\s*(?:years?|yrs?|months?)\b|\b(?:certifi\w*|licen[cs]\w*|degree|diploma|bachelor\w*)\b/i.test(p)))
    return make("ambiguous", parts, null, "mixes a credential or a length of time with other parts");
  const [L, R] = [words(parts[0]), words(parts[parts.length - 1])];

  if (parts.length === 2) {
    // "Conduit bending and installation": the second action shares the first one's object.
    if (L.length >= 2 && R.length === 1) {
      if (isAction(L[L.length - 1]) && isAction(R[0])) return make("task_compound", [parts[0], [...L.slice(0, -1), R[0]].join(" ")], "shared_object_before", "two actions on one object");
      // Only when neither side could be a task ("removal and replacement" could be two).
      if (!isAction(R[0]) && !isAction(L[L.length - 1]) && (isModifier(R[0]) || isModifier(L[L.length - 1]))) return make("single", [], null, "coordinated modifiers of one thing");
      return make("ambiguous", parts, null, "unclear whether the second word is a separate task");
    }
    // "Installing and maintaining HVAC systems": two actions sharing the object after them.
    if (L.length === 1 && R.length >= 2) {
      if (isModifier(L[0]) && isModifier(R[0])) return make("single", [], null, "coordinated modifiers of one thing");
      if (isAction(L[0]) && isAction(R[0])) return make("task_compound", [[L[0], ...R.slice(1)].join(" "), parts[1]], "shared_object_after", "two actions on one object");
      // "Pruning and tree felling": a task word, then a task phrase with its own object. Keep both as written.
      if (isAction(L[0]) && !isAction(R[0]) && R.some(isAction)) return make("task_compound", parts, "full_phrases", "a task and a separate task phrase");
      return make("ambiguous", [[L[0], ...R.slice(1)].join(" "), parts[1]], "shared_object_after", "the first word may or may not be a separate task");
    }
    if (L.length === 1 && R.length === 1) {
      if (isAction(L[0]) || isAction(R[0])) return make("ambiguous", parts, null, "two words that may name one area of work or two tasks");
      return make("single", [], null, "a two-word pairing naming one thing");
    }
    // "Patient scheduling and insurance verification": two full task phrases.
    if (L.some(isAction) && R.some(isAction)) return make("task_compound", parts, "full_phrases", "two task phrases");
    return make("ambiguous", parts, "full_phrases", "two phrases, not both clearly tasks");
  }

  // Three parts. "Plan, prepare and serve meals": single actions sharing the last part's object.
  const singles = parts.slice(0, -1).every(p => words(p).length === 1);
  if (singles && R.length >= 2) {
    const shared = R.slice(1).join(" ");
    const expanded = [...parts.slice(0, -1).map(p => `${p} ${shared}`), parts[parts.length - 1]];
    if (parts.slice(0, -1).some(p => isModifier(p)) || isModifier(R[0])) return make("single", [], null, "coordinated modifiers of one thing");
    return make([...parts.slice(0, -1), R[0]].every(isAction) ? "task_compound" : "ambiguous", expanded, "shared_object_after", "three actions on one object");
  }
  if (parts.every(p => words(p).some(isAction))) return make("task_compound", parts, "full_phrases", "three task phrases");
  return make("ambiguous", parts, null, "three parts, not all clearly tasks");
}
