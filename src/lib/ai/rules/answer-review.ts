import type { MatchRequest, MatchRequirement, Verdict } from "@/lib/ai/evidence";
import type { RuleBasis } from "@/lib/ai/match-validation";
import { requiredMonths, unquantifiedTime } from "@/lib/ai/match-validation";
import { foreignDirected, foreignNegation, otherPersonInAnyLanguage } from "@/lib/ai/claims/language";
import { answerUntrustedSpans, parseRequirement } from "@/lib/ai/requirement-structure";
import equivalences from "@/lib/ai/rules/data/answer_equivalences.json";
import curated from "@/lib/ai/rules/data/terminology_v2.json";
import type { RawFinding } from "@/lib/ai/rules/engine";
import { hasNegation, notAStatement } from "@/lib/ai/rules/profile-fields";
import { actionMissing, canonicalTerms, containsPhrase, fragmentOfLongerName, GENERIC_TERMS, hasQualificationWords, isKnownTechnology, keywordDump, labelledList, ordinaryMeaning, otherSense, relation, requiredSkillLevel, someoneElsesWork, words } from "@/lib/ai/skill-relations";
import { qualificationText } from "@/lib/ai/untrusted-text";

// Reads a person's answer to a question about one requirement. It only ever adds to what the rules found,
// and only for an answer that's still active. No model takes part: what's the same comes from the reviewed
// tables, and everything else stays as it was. All of it is self-reported.

export type LinkedAnswer =
  | { action: "confirm"; questionKey: string; evidenceId: string; detail: string }
  | { action: "deny"; questionKey: string };

export const EQUIVALENCES_VERSION = equivalences.version;
const FILLER = new Set(words("experience experienced knowledge proficiency proficient familiarity required preferred ability strong solid good excellent work working with in of and or the a an for to on at must have"));

type Group = { canonical: string; asks: string[]; descriptions: string[]; related: string[]; source: string; verbs?: string[]; objects?: string[] };
const GROUPS: Group[] = [
  ...equivalences.groups.map(g => ({ canonical: g.canonical, asks: g.asks, descriptions: g.descriptions, related: g.related, source: `equivalence:${g.canonical}`, verbs: g.verbs, objects: g.objects })),
  ...curated.groups.map(g => ({ canonical: g.canonical, asks: g.asks, descriptions: g.same, related: g.related, source: `curated:${g.canonical}` })),
];

/** The reviewed group whose name is what's asked, if any. Whole phrases only. */
export const groupsFor = (asked: string) => GROUPS.filter(g => g.asks.some(name => containsPhrase(asked, name)));
export const specificTerms = (text: string) => [...canonicalTerms(text)].filter(t => !FILLER.has(t) && !GENERIC_TERMS.has(t));

/** A credential or license has to be named, with who issued it. A sentence can't show one. */
const NAMES_A_CREDENTIAL = /\b(?:certif\w*|licen[cs]\w*|permit|clearance|credential|registered|chartered|board[-\s]certified|cert)\b/i;
export const needsCredentialEntry = (text: string) => NAMES_A_CREDENTIAL.test(text) || hasQualificationWords(text);
/** Time comes only from role titles and dates. */
export const asksForTime = (text: string) => requiredMonths(text) !== null || unquantifiedTime(text);

/** A light stem, so "charted" meets "charting" and "repaired" meets "repair". English only. */
const stem = (word: string) => word.replace(/(ing|ings|ed|es|s)$/, "").replace(/e$/, "").replace(/(.)\1$/, "$1");

export type AnswerReading = { verdict: Verdict; quote: string | null; reason: string; sourceId: string | null };

// A sentence that opens on someone else ("Our associate does all the research") is about them. Only what
// follows a clause of the person's own counts: "Our order lookup was slow, so I added indexes".
const OPENS_ON_SOMEONE_ELSE = /^\W*(?:our|the|his|her|their|another|my\s+(?:\p{L}+\s+)?(?:lead|boss|manager|supervisor|coworker|co-worker|colleague|team|partner|assistant|associate))\b/iu;
const OWN_CLAUSE = /(?:[,:]\s*|\b(?:and|so|then|but|while|when|where|before|after)\s+)(?=(?:i|we)(?:['’](?:ve|m|d))?\s)/iu;

/** Sentences that are plainly this person's own statement of having done something. */
function ownStatements(detail: string): { text: string; start: number }[] {
  const barred = answerUntrustedSpans(detail);
  const out: { text: string; start: number }[] = [];
  for (const match of detail.matchAll(/[^.!?;\n]+/g)) {
    let text = match[0].trim();
    let start = match.index + match[0].indexOf(text);
    if (OPENS_ON_SOMEONE_ELSE.test(text)) {
      const own = OWN_CLAUSE.exec(text);
      if (!own) continue;
      start += own.index + own[0].length;
      text = text.slice(own.index + own[0].length);
    }
    const end = start + text.length;
    if (text.length < 3 || barred.some(([s, e]) => s < end && start < e)) continue;
    if (hasNegation(text) || foreignNegation(text) || foreignDirected(text) || notAStatement(text) || keywordDump(text) || labelledList(text)) continue;
    if (someoneElsesWork(text, "") || otherPersonInAnyLanguage(text)) continue;
    out.push({ text, start });
  }
  return out;
}

/** A reviewed verb shortly before a reviewed object, in the one sentence: "I drain and refill the oil". */
function verbBeforeObject(sentence: string, group: Group): boolean {
  if (!group.verbs?.length || !group.objects?.length) return false;
  const tokens = words(sentence);
  return tokens.some((token, i) => group.verbs!.includes(token) && group.objects!.some(object => {
    const parts = object.split(" ");
    for (let at = i + 1; at <= Math.min(i + 7, tokens.length - parts.length); at++) if (parts.every((part, j) => tokens[at + j] === part)) return true;
    return false;
  }));
}

const hasPhrase = (sentence: string, phrase: string) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(sentence);
};

function readPiece(piece: string, statements: { text: string }[]): { level: 2 | 1 | 0; quote: string | null; sourceId: string | null } {
  const groups = groupsFor(piece);
  for (const { text } of statements) {
    for (const group of groups) {
      if (group.descriptions.some(d => hasPhrase(text, d)) || verbBeforeObject(text, group)) return { level: 2, quote: text, sourceId: group.source };
    }
  }
  const wanted = specificTerms(piece);
  let partial: string | null = null;
  for (const { text } of statements) {
    if (!wanted.length) break;
    const have = new Set([...canonicalTerms(text)].flatMap(t => [t, stem(t)]));
    const found = wanted.filter(t => have.has(t) || have.has(stem(t)));
    // A word that's only part of a longer name, in plain lower case: "steel rails" isn't Ruby on Rails.
    const fragment = (text.match(/\p{L}+/gu) ?? []).some(w => wanted.some(t => canonicalTerms(w).has(t)) && fragmentOfLongerName(piece, text, w));
    const clash = fragment || found.some(t => otherSense(piece, t) !== otherSense(text, t) || ordinaryMeaning(text, t));
    if (clash) continue;
    if (found.length === wanted.length && !actionMissing(piece, text)) return { level: 2, quote: text, sourceId: null };
    if (found.length) partial ??= text;
  }
  for (const { text } of statements) {
    if (groups.some(g => g.related.some(r => hasPhrase(text, r)))) return { level: 1, quote: text, sourceId: null };
    // Same-family tools are different things: that's not a lead, and the rules decide it elsewhere.
    if ([...canonicalTerms(text)].some(t => isKnownTechnology(t) && !wanted.includes(t) && relation(piece, t) === "related")) return { level: 0, quote: null, sourceId: null };
  }
  return partial ? { level: 1, quote: partial, sourceId: null } : { level: 0, quote: null, sourceId: null };
}

/** What an answer shows about this requirement, by itself. Hard limits: credentials and time are out of its
 * reach, and "supported" needs the requirement's own terms or a reviewed description of that exact work. */
export function readAnswer(requirement: MatchRequirement, detail: string): AnswerReading {
  const text = qualificationText(requirement.text).trim();
  const nothing = (reason: string): AnswerReading => ({ verdict: "insufficient_information", quote: null, reason, sourceId: null });
  if (!text) return nothing("not_assessable");
  if (needsCredentialEntry(text)) return nothing("credential_needs_an_entry");
  const statements = ownStatements(detail);
  if (!statements.length) return nothing("no_own_statement");
  const structure = parseRequirement(text, new Set(), true);
  const pieces = structure.pieces.length ? structure.pieces : [structure.creditText || text];
  const readings = pieces.map(p => readPiece(p, statements));
  const quote = readings.find(r => r.quote)?.quote ?? null;
  if (!quote) return nothing("no_relationship");
  const all = readings.every(r => r.level === 2);
  // An answer can't add time to a job, or show a level the person hasn't rated.
  const capped = asksForTime(text) || requiredSkillLevel(text) !== null || /\bas\s+(?:a|an|the)\b/i.test(text);
  if (all && !capped) return { verdict: "supported", quote, reason: "stated_work", sourceId: readings[0].sourceId };
  return { verdict: "possible", quote, reason: all ? "limit_on_what_an_answer_shows" : "part_of_what_is_asked", sourceId: null };
}

const EXPLAIN: Record<string, string> = {
  stated_work: "Your answer describes doing this work.",
  limit_on_what_an_answer_shows: "Your answer describes this work, but an answer alone can't show the amount of time or level asked for.",
  part_of_what_is_asked: "Your answer describes related work, or part of what this asks for.",
};

/** Applies active answers to the rules' findings. Only moves Not enough information or Possible, so the rules'
 * own Supported and Not supported always stand. The rules-only verdict is kept beside it. */
export function applyAnswers(request: MatchRequest, findings: RawFinding[], answers: LinkedAnswer[], keyFor: (r: MatchRequirement) => string): RawFinding[] {
  if (!answers.length) return findings;
  const byKey = new Map(answers.map(a => [a.questionKey, a]));
  return findings.map(f => {
    if (f.verdict === "supported" || f.verdict === "gap" || f.review) return f;
    const requirement = request.requirements.find(r => r.index === f.requirement_index)!;
    const answer = byKey.get(keyFor(requirement));
    if (!answer) return f;
    if (answer.action === "deny") {
      return { ...f, verdict: "gap", explanation: "You said you don't have this. You can correct or revoke that answer.", citations: [], caveats: [], basis: "candidate_denied" as RuleBasis, rules_only_verdict: f.verdict };
    }
    const reading = readAnswer(requirement, answer.detail);
    const better = reading.verdict === "supported" || (reading.verdict === "possible" && f.verdict === "insufficient_information");
    if (!better || !reading.quote) return f;
    return {
      ...f,
      verdict: reading.verdict,
      explanation: EXPLAIN[reading.reason] ?? f.explanation,
      citations: [{ evidence_id: answer.evidenceId, quote: reading.quote.slice(0, 300) }],
      caveats: [],
      basis: "candidate_answer" as RuleBasis,
      rules_only_verdict: f.verdict,
    };
  });
}
