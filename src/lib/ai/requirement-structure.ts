import structure from "../../../ai-service/app/matching/requirement_structure.json";
import { canonicalTerms, GENERIC_TERMS, VOCABULARY } from "@/lib/ai/skill-relations";
import { directedSpans, qualificationText, segments } from "@/lib/ai/untrusted-text";

// Mirrors ai-service/app/matching/requirement_structure.py: which parts of a requirement can earn
// credit, decided by structure. Only the head (the first clause naming a skill) and later clauses
// that state a need count; asides and claims ("X counts as Y") never do. Items joined by "and" are
// all mandatory. Both read requirement_structure.json, and both test suites check
// ai-service/tests/fixtures/relation_cases.json.

const NEED = new RegExp(structure.need_markers, "i");
const OPTIONAL = new RegExp(structure.optional_markers, "i");
const CLAIM = new RegExp(structure.relation_claim, "i");
const EVALUATION_REFERENCE = new RegExp(structure.evaluation_reference, "i");
const AND_SPLIT = new RegExp(structure.and_split, "i");
const OR_MARKER = new RegExp(structure.or_marker, "i");
const AND_MARKER = new RegExp(structure.and_marker, "i");
const ITEM_STOPWORDS = new Set<string>([...structure.item_stopwords, ...GENERIC_TERMS]);
const TOKEN = /[A-Za-z][A-Za-z0-9+#.-]*/g;

export function namesAnItem(text: string, listed: ReadonlySet<string> = new Set()): boolean {
  for (const term of canonicalTerms(text)) if (VOCABULARY.has(term) || listed.has(term)) return true;
  for (const token of text.match(TOKEN) ?? []) {
    const low = token.toLowerCase().replace(/^[.-]+|[.-]+$/g, "");
    if (!low || ITEM_STOPWORDS.has(low)) continue;
    if (/^[A-Z]/.test(token) || /[A-Z]/.test(token.slice(1)) || /[0-9+#]/.test(token)) return true;
  }
  return false;
}

export function isRelationClaim(text: string, listed: ReadonlySet<string> = new Set()): boolean {
  if (!CLAIM.test(text)) return false;
  const items = (text.match(TOKEN) ?? []).filter(t => namesAnItem(t, listed));
  return items.length >= 2 || EVALUATION_REFERENCE.test(text) || /full\s+(match|credit)/i.test(text);
}

export function pieces(clause: string, listed: ReadonlySet<string> = new Set()): string[] {
  const hasOr = OR_MARKER.test(clause);
  const hasAnd = AND_MARKER.test(clause);
  const parts = hasOr && !hasAnd ? [clause] : hasOr ? clause.split(/\s+and\s+/i) : clause.split(new RegExp(AND_SPLIT.source, "i"));
  return parts
    .map(part => part.replace(/^[\s.;:]+|[\s.;:]+$/g, "").replace(/^(and|or)\s+/i, ""))
    .filter(part => part && namesAnItem(part, listed));
}

export type Structure = { head: string; pieces: string[]; headPieces: string[]; matchable: string; ignored: boolean };

export function parseRequirement(text: string, listed: ReadonlySet<string> = new Set()): Structure {
  const clean = qualificationText(text);
  let ignored = clean !== text;
  let head = "";
  let headPieces: string[] = [];
  const extra: string[] = [];
  const extraClauses: string[] = [];
  const plain: string[] = [];
  for (const [start, end] of segments(clean)) {
    const clause = clean.slice(start, end).trim();
    if ("([{".includes(clause[0] ?? "x")) continue;
    if (isRelationClaim(clause, listed)) {
      ignored = true;
      continue;
    }
    plain.push(clause);
    const found = pieces(clause, listed);
    if (!head) {
      if (found.length) [head, headPieces] = [clause, found];
      continue;
    }
    if (OPTIONAL.test(clause)) continue;
    if (found.length && NEED.test(clause)) {
      extra.push(...found);
      extraClauses.push(clause);
    }
  }
  if (!head) return { head: "", pieces: [], headPieces: [], matchable: plain.join(" "), ignored };
  return { head, pieces: [...headPieces, ...extra], headPieces, matchable: [head, ...extraClauses].join(" "), ignored };
}

export function listedTerms(skillNames: string[]): Set<string> {
  const terms = new Set<string>();
  for (const name of skillNames) for (const term of canonicalTerms(name)) terms.add(term);
  return terms;
}

type Span = [number, number];

/** Parts of profile text that are never evidence: aimed at the evaluator, or about the evaluation. */
export function untrustedEvidenceSpans(text: string): Span[] {
  const spans = new Map<string, Span>();
  for (const span of directedSpans(text)) spans.set(span.join(":"), span);
  for (const [s, e] of segments(text)) {
    const segment = text.slice(s, e);
    if (EVALUATION_REFERENCE.test(segment) || isRelationClaim(segment)) spans.set(`${s}:${e}`, [s, e]);
  }
  return [...spans.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
