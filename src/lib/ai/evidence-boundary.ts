import { answerLanguage } from "@/lib/ai/answer-language";
import type { Evidence } from "@/lib/ai/evidence";
import { answerUntrustedSpans, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import { hasNegation, notAStatement } from "@/lib/ai/rules/profile-fields";
import { IRREGULAR_PAST, keywordDump, labelledList, opensOnNamedOther, ownSpan, someoneElsesWork, WORK_VERB_WORDS } from "@/lib/ai/skill-relations";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

// The one place text is cleared before it can count. Resume and profile text goes through the checks that
// apply to it; an answer goes through those and more, because it's written in reply to a question and could
// otherwise be shaped to fit one. An answer is never ordinary role text: the engine doesn't read it, no AI
// provider receives it, and it's read again from scratch on every analysis, so what was saved earlier gets
// no standing from having been saved.

export type TextOrigin = "profile" | "answer";

/** Spans of text that can never be evidence. */
export const untrustedSpans = (text: string, origin: TextOrigin) => (origin === "answer" ? answerUntrustedSpans(text) : untrustedEvidenceSpans(text));

/** An answer's entry. It keeps its role's title and dates only so a citation can point at it. */
export const isAnswerEvidence = (item: Evidence) => item.kind === "experience" && item.source === "clarification";
/** What the rules engine may read. Answers reach a verdict only through the answer reader. */
export const evidenceForRules = (evidence: Evidence[]) => evidence.filter(item => !isAnswerEvidence(item));
/** What any AI provider may receive: no answers, and no field that says where something came from. */
export const evidenceForAi = (evidence: Evidence[]): Evidence[] => evidenceForRules(evidence).map(item => {
  if (!("source" in item)) return item;
  const { source: _source, ...rest } = item;
  return rest as Evidence;
});

/** Could, would, or might, which says nothing about what was done. */
const HYPOTHETICAL = /\b(?:i\s+(?:could|would|can|might|may|should)|i['’]d|we\s+(?:could|would|can|might)|if\s+(?:needed|required|asked|necessary|given|i\b|we\b)|would\s+be\s+(?:able|happy|glad)|(?:be\s+)?able\s+to|capable\s+of|willing\s+to|happy\s+to|ready\s+to|confident\s+(?:i|that)|sure\s+i|pick\s+(?:it|that|this)\s+up|learn\s+(?:it|that|this)|(?:plan|planning|going|hoping|hope|want|wanting|intend|intending|expect|expecting)\s+to|in\s+the\s+future|some\s*day|one\s+day|next\s+(?:year|month|quarter)|soon)\b/i;
/** Plain English negatives anywhere in a sentence. Stricter than the profile check, on purpose. */
const NEGATIVE = /\b(?:no|not|never|none|without|nothing|cannot|neither|nor)\b|n['’]t\b/i;
/** Seeing or trying something is related to doing it, at most. */
const EXPOSURE = /\b(?:trial(?:l)?ed|piloted|tested\s+out|demoed|evaluated|looked\s+(?:at|into)|considered|explored|read\s+about|heard\s+about|learned\s+about|watched|observed|shadowed|attended|sat\s+in|exposed\s+to|familiar\s+with|helped\s+with|assisted\s+with)\b/i;
/** Someone else's work, in the passive: "handled by our billing office", "is outsourced". */
const DONE_ELSEWHERE = /\b(?:\w+ed|done|run|kept|sent)\s+by\s+(?:our|the|my|their|a|an|another|someone|other)\b|\b(?:outsourced|sent\s+out|contracted\s+out|farmed\s+out|taken\s+care\s+of)\b/i;

const OWN_CLAUSE_AFTER = /(?:[,:;]\s*|\b(?:and|so|then|but|while|when|where|before|after)\s+)(?=(?:i|we)(?:['’](?:ve|m|d))?\s)/iu;
const FIRST_PERSON = /(?:^|[^\p{L}'’])(i|we)(?:['’](ve|m|d|ll))?\s+(.+)$/iu;
const AUXILIARY = new Set("have has had am is are was were be been being also always usually often regularly routinely personally just then still currently mostly mainly primarily now daily weekly really actually definitely".split(" "));
const BE = new Set("am is are was were be been being".split(" "));
/** Verbs and words that say someone's near a thing, not what they did with it. */
const SAYS_LITTLE = new Set(`know knew understand understood like love enjoy want wish hope think believe feel seem seems look looked looking try tried care deal dealt help helped helps
assist assisted support supported around get got go went see saw seen hear heard done familiar experienced good great strong real a an the my our some lots lot plenty many
involved exposure touch touched years year months experience knowledge`.split(/\s+/));
const WORKED = new Set(["worked", "work", "works", "working"]);
const OWNS_IT = /\b(?:responsible\s+for|in\s+charge\s+of)\b/i;

export type Statement = {
  text: string;
  start: number;
  /** "self": I, or a sentence that opens on what was done. "team": we. "unclear": neither. */
  subject: "self" | "team" | "unclear";
  /** What it says about the doing. "worked" only counts beside the thing's own name. */
  act: "concrete" | "worked" | "says_little";
  /** Trying or watching, which is never the same as doing. */
  exposureOnly: boolean;
};

function readAct(sentence: string): { subject: Statement["subject"]; act: Statement["act"] } {
  const first = sentence.match(FIRST_PERSON);
  const tokens = (first ? first[3] : sentence).toLowerCase().match(/\p{L}+/gu) ?? [];
  if (!first) {
    const head = tokens[0] ?? "";
    if (WORKED.has(head)) return { subject: "self", act: "worked" };
    if (SAYS_LITTLE.has(head)) return { subject: "self", act: "says_little" };
    if (WORK_VERB_WORDS.has(head) || IRREGULAR_PAST.has(head) || /(?:ed|ing)$/.test(head)) return { subject: "self", act: "concrete" };
    // "Excel is a real strength" describes the thing, not any work on it.
    if (tokens.slice(1, 5).some(t => BE.has(t))) return { subject: "unclear", act: "says_little" };
    return { subject: "unclear", act: "concrete" };
  }
  const subject = first[1].toLowerCase() === "i" ? "self" : "team";
  if (OWNS_IT.test(first[3])) return { subject, act: "concrete" };
  let be = first[2]?.toLowerCase() === "m";
  let at = 0;
  while (at < tokens.length && AUXILIARY.has(tokens[at])) {
    if (BE.has(tokens[at])) be = true;
    at++;
  }
  // "I do payroll" is a claim about the work. "I do know payroll" isn't.
  const verb = tokens[at] ?? "";
  if (["do", "does", "did"].includes(verb)) return { subject, act: SAYS_LITTLE.has(tokens[at + 1] ?? "") && !["the", "a", "an", "our", "my", "all"].includes(tokens[at + 1] ?? "") ? "says_little" : "concrete" };
  if (WORKED.has(verb)) return { subject, act: "worked" };
  if (SAYS_LITTLE.has(verb) || !verb) return { subject, act: "says_little" };
  if (be && !/(?:ing|ed)$/.test(verb)) return { subject, act: "says_little" };
  return { subject, act: "concrete" };
}

/** Sentences of an answer that are plainly this person's own statement of having done something. Nothing
 * comes back unless the whole answer is plainly English: other answers stay unresolved. */
export function answerStatements(detail: string): Statement[] {
  // An answer with an instruction in it gets no credit at all, however good the rest looks.
  if (answerLanguage(detail) !== "en" || hasDirectedText(detail)) return [];
  const barred = untrustedSpans(detail, "answer");
  const out: Statement[] = [];
  for (const match of detail.matchAll(/[^.!?;\n]+/g)) {
    const whole = match[0].trim();
    const wholeStart = match.index + match[0].indexOf(whole);
    if (DONE_ELSEWHERE.test(whole) || opensOnNamedOther(whole, true)) continue;
    const span = ownSpan(whole, true);
    if (!span) continue;
    // "Patching is so critical and I keep a close eye on it": the part that names the thing isn't the part
    // saying what was done. Only the clause with the person in it counts.
    const describing = /^\W*(?:[\p{L}'’-]+\s+){1,4}(?:is|are|was|were)\b/iu.test(whole.slice(span[0])) ? OWN_CLAUSE_AFTER.exec(whole.slice(span[0])) : null;
    if (describing) span[0] += describing.index + describing[0].length;
    const text = whole.slice(span[0], span[1]).trim();
    const start = wholeStart + whole.indexOf(text, span[0]);
    const end = start + text.length;
    if (text.length < 3 || barred.some(([s, e]) => s < end && start < e)) continue;
    if (NEGATIVE.test(whole) || hasNegation(whole) || HYPOTHETICAL.test(whole) || notAStatement(whole) || keywordDump(text) || labelledList(text)) continue;
    if (someoneElsesWork(text, text)) continue;
    out.push({ text, start, ...readAct(text), exposureOnly: EXPOSURE.test(whole) });
  }
  return out;
}
