import patterns from "@/lib/ai/rules/data/untrusted_text.json";

// Job and profile text is untrusted data: segments directed at an AI or reviewer never take part in
// matching. Authoritative since Milestone 7; the frozen Python copy is only a test reference.

const ENCLOSED = new RegExp(patterns.enclosed, "g");
const BOUNDARY = new RegExp(patterns.boundary, "g");
const DIRECTED = patterns.evaluator_directed.map(p => new RegExp(p, "i"));

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
