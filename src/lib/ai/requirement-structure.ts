import structure from "../../../ai-service/app/matching/requirement_structure.json";
import { canonicalTerms, GENERIC_TERMS, VOCABULARY } from "@/lib/ai/skill-relations";
import { directedSpans, evaluatorDirected, segments } from "@/lib/ai/untrusted-text";

// Mirrors ai-service/app/matching/requirement_structure.py: a structured reading of each requirement.
// Only what is requested (the head and its listed alternatives) can earn credit; later required
// clauses only add mandatory groups; optional, supplemental, and instruction-like text never count.
// A requirement containing instructions or evaluation language needs the person's confirmation
// before it is judged. Both read requirement_structure.json, and both test suites check
// ai-service/tests/fixtures/relation_cases.json.

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

export const evaluationLanguage = (text: string) => EVALUATION_LANGUAGE.some(p => p.test(text));

export function pieces(clause: string, listed: ReadonlySet<string> = new Set()): string[] {
  const hasOr = OR_MARKER.test(clause);
  const hasAnd = AND_MARKER.test(clause);
  const parts = hasOr && !hasAnd ? [clause] : hasOr ? clause.split(/\s+and\s+/i) : clause.split(AND_SPLIT);
  return parts
    .map(part => part.replace(/^[\s.;:]+|[\s.;:]+$/g, "").replace(/^(and|or)\s+/i, ""))
    .filter(part => part && namesAnItem(part, listed));
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
    if (!confirmed && (isRelationClaim(clause, listed) || evaluationLanguage(clause))) {
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

type Span = [number, number];

/** Parts of profile text that are never evidence: aimed at the evaluator, about the evaluation, or
 * about the person in the third person. */
export function untrustedEvidenceSpans(text: string): Span[] {
  const spans = new Map<string, Span>();
  for (const span of directedSpans(text)) spans.set(span.join(":"), span);
  for (const [s, e] of segments(text)) {
    const segment = text.slice(s, e);
    if (EVALUATION_REFERENCE.test(segment) || PROFILE_META.test(segment) || isRelationClaim(segment) || evaluationLanguage(segment)) {
      spans.set(`${s}:${e}`, [s, e]);
    }
  }
  return [...spans.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** For the job review, which doesn't know the profile: true whenever the analysis could flag this
 * requirement for any profile, so the person can always confirm what the analysis asks about. */
export const mayNeedConfirmation = (text: string) =>
  parseRequirement(text).needsReview || segments(text).some(([s, e]) => CLAIM.test(text.slice(s, e)));
