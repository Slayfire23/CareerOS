import patterns from "@/lib/ai/rules/data/untrusted_text.json";

// Job and profile text is untrusted data: segments directed at an AI or reviewer never take part in
// matching. Authoritative since Milestone 7; the frozen Python copy is only a test reference.

const ENCLOSED = new RegExp(patterns.enclosed, "g");
const BOUNDARY = new RegExp(patterns.boundary, "g");
// Added in rules-v14, here and not in the shared file, which the frozen Python copy is compared against.
const MORE_DIRECTED = [
  /^\W*[[(<{]?\s*(?:admin|administrator|system|root|sudo|debug|developer|supervisor)(?:\s+\w+)?\s*[\]):>}]/i, // [admin override], system:
  /\byou\s+are\s+now\b/i,
  /\b(?:status|verdict|confidence|score|result|decision|outcome|qualified|approved|met)\s*[=:]\s*["']?(?:met|true|yes|1(?:\.0)?|pass(?:ed)?|supported|approved|qualified|100)\b/i,
  /\b(?:end|skip|stop|finish)\s+(?:the\s+|this\s+)?(?:interview|review|evaluation|screening|questions?|questioning)\b/i,
  /\b(?:bypass|override|admin|debug|developer)\s+mode\b/i,
  /\bpretend\s+(?:that\s+|you\b|to\s+be\b)/i,
  /\bas\s+(?:the|an?)\s+(?:ai|assistant|reviewer|model|screener)\b(?!\s+(?:to|for|manager|coach))/i,
  /\b(?:please|kindly)\s+(?:approve|accept|pass|qualify|credit|mark|count|confirm)\b/i,
  /\bapprove\s+(?:this|my|me)\b|\bapprove\s+the\s+(?:candidate|answer|application|applicant|requirement|claim|profile|response|match|person)\b/i,
  /\b(?:reviewer|recruiter|hiring|screener|screening|grader|evaluator)\s+(?:note|override|message|instructions?)\b/i,
  /\baccept\s+(?:this|my|the)\s+(?:answer|response|candidate|application|applicant|claim)\b/i,
  /\b(?:do\s+not|don['’]t)\s+(?:ask|flag|escalate|question)\b/i,
  /\b(?:candidate|applicant|answer|requirement|person)\b[^.]{0,40}\b(?:cleared|approved|vetted|verified|satisfied)\b/i,
  /\b(?:no|without)\s+(?:further|additional|more)\s+(?:review|questions?|checks?|verification)\b/i,
  /\bclose\s+(?:this|the)\s+review\b/i,
  /\bto\s+whoever\s+(?:reads|is\s+reading|reviews)\b/i,
  /<<[^>]*>>/,
];
const DIRECTED = [...patterns.evaluator_directed.map(p => new RegExp(p, "i")), ...MORE_DIRECTED];

type Span = [number, number];

export function segments(text: string): Span[] {
  const spans: Span[] = [];
  const split = (start: number, end: number) => {
    let cursor = start;
    for (const match of text.slice(start, end).matchAll(BOUNDARY)) {
      spans.push([cursor, start + match.index]);
      cursor = start + match.index + match[0].length;
    }
    spans.push([cursor, end]);
  };
  let cursor = 0;
  for (const match of text.matchAll(ENCLOSED)) {
    split(cursor, match.index);
    spans.push([match.index, match.index + match[0].length]);
    cursor = match.index + match[0].length;
  }
  split(cursor, text.length);
  return spans.filter(([s, e]) => text.slice(s, e).trim());
}

export const evaluatorDirected = (segment: string) => DIRECTED.some(p => p.test(segment.trim()));
export const directedSpans = (text: string) => segments(text).filter(([s, e]) => evaluatorDirected(text.slice(s, e)));
export const hasDirectedText = (text: string) => directedSpans(text).length > 0;

/** The text without evaluator-directed segments; unchanged when there are none. */
export function qualificationText(text: string): string {
  if (!hasDirectedText(text)) return text;
  return segments(text)
    .filter(([s, e]) => !evaluatorDirected(text.slice(s, e)))
    .map(([s, e]) => text.slice(s, e).trim())
    .filter(Boolean)
    .join(" ");
}

/** True if some occurrence of the quote lies outside every evaluator-directed segment (or the given spans). */
export function quoteInTrustedText(text: string, quote: string, spans?: Span[]): boolean {
  const directed = spans ?? directedSpans(text);
  for (let start = text.indexOf(quote); start >= 0; start = text.indexOf(quote, start + 1)) {
    const end = start + quote.length;
    if (!directed.some(([s, e]) => s < end && start < e)) return true;
  }
  return false;
}
