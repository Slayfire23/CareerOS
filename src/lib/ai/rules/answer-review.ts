import { answerLanguage } from "@/lib/ai/answer-language";
import type { MatchRequest, MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { answerStatements, othersText, type Statement } from "@/lib/ai/evidence-boundary";
import type { RuleBasis } from "@/lib/ai/match-validation";
import { requiredMonths, unquantifiedTime } from "@/lib/ai/match-validation";
import { parseRequirement } from "@/lib/ai/requirement-structure";
import equivalences from "@/lib/ai/rules/data/answer_equivalences.json";
import type { RawFinding } from "@/lib/ai/rules/engine";
import { actionMissing, canonicalTerms, containsPhrase, fragmentOfLongerName, GENERIC_TERMS, hasQualificationWords, isKnownTechnology, ordinaryMeaning, otherSense, relation, requiredSkillLevel, withoutPaperworkUses, words } from "@/lib/ai/skill-relations";
import { qualificationText } from "@/lib/ai/untrusted-text";

// Reads a person's answer to a question about one requirement. It only ever adds to what the rules found,
// and only for an answer that's still active. No model takes part. Everything here is self-reported.
// Every answer is read again on every analysis, through the shared boundary.

export type LinkedAnswer =
  | { action: "confirm"; questionKey: string; evidenceId: string; detail: string }
  | { action: "deny"; questionKey: string };

export const EQUIVALENCES_VERSION = equivalences.version;
const FILLER = new Set(words("experience experienced knowledge proficiency proficient familiarity required preferred ability strong solid good excellent work working with in of and or the a an for to on at must have"));

type Group = { canonical: string; asks: string[]; descriptions: string[]; related: string[]; source: string; verbs: string[]; objects: string[]; status: string };
const GROUPS: Group[] = equivalences.groups.map(g => ({ canonical: g.canonical, asks: g.asks, descriptions: g.descriptions, related: g.related, source: `equivalence:${g.canonical}`, verbs: g.verbs, objects: g.objects, status: g.status }));

/** Only the owner's sign-off lets a table entry grant Supported, or treat two names as one question. */
export const OWNER_APPROVED = "owner_approved";
const askedBy = (asked: string, group: Group) => group.asks.some(name => containsPhrase(asked, name));
/** Groups approved by the owner whose name is what's asked. Whole phrases only. */
export const groupsFor = (asked: string) => GROUPS.filter(g => g.status === OWNER_APPROVED && askedBy(asked, g));
export const specificTerms = (text: string) => [...canonicalTerms(text)].filter(t => !FILLER.has(t) && !GENERIC_TERMS.has(t));

/** A credential or license has to be named, with who issued it. A sentence can't show one. */
const NAMES_A_CREDENTIAL = /\b(?:certif\w*|licen[cs]\w*|permit|clearance|credential|registered|chartered|board[-\s]certified|cert)\b/i;
export const needsCredentialEntry = (text: string) => NAMES_A_CREDENTIAL.test(withoutPaperworkUses(text)) || hasQualificationWords(text);
/** Time comes only from role titles and dates. */
export const asksForTime = (text: string) => requiredMonths(text) !== null || unquantifiedTime(text);

/** A light stem, so "charted" meets "charting" and "repaired" meets "repair". English only. */
const stem = (word: string) => word.replace(/(ing|ings|ed|es|s)$/, "").replace(/e$/, "").replace(/(.)\1$/, "$1");

export type AnswerReading = { verdict: Verdict; quote: string | null; reason: string; sourceId: string | null };
/** `assumeApproved`: evaluation and tests only, to measure what the owner's sign-off would change. Nothing in production sets it. */
export type ReadOptions = { assumeApproved?: boolean };

/** A listed verb shortly before a listed object, in the one sentence: "I drain and refill the oil". */
function verbBeforeObject(sentence: string, group: Group): boolean {
  if (!group.verbs.length || !group.objects.length) return false;
  const tokens = words(sentence);
  return tokens.some((token, i) => group.verbs.includes(token) && group.objects.some(object => {
    const parts = words(object);
    for (let at = i + 1; at <= Math.min(i + 7, tokens.length - parts.length); at++) if (parts.every((part, j) => tokens[at + j] === part)) return true;
    return false;
  }));
}

const hasPhrase = (sentence: string, phrase: string) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(sentence);
};

const statesDoing = (s: Statement) => s.subject === "self" && !s.exposureOnly;
const ASKS_TO_OVERSEE = /\b(?:schedul\w+|oversee\w*|oversight|supervis\w+|manag\w+|lead\w*|direct\w*|coordinat\w+|hir\w+|recruit\w*|delegat\w+|approv\w+|vendor|contractor|procure\w*)\b/i;
const ASKS_FOR_PRACTICE = /\b(?:experience|experienced|proficien\w*|professional|hands[-\s]on|expert\w*|advanced|senior|production|years?|months?|fluent|mastery)\b/i;
const ASKS_TO_ASSIST = /\b(?:assist\w*|support\w*|help\w*)\b/i;
/** Asking a provider counts only where the work asked for is that: coordinating, vendors, service requests. */
const ASKS_TO_REQUEST = /\b(?:coordinat\w+|vendors?|contractors?|suppliers?|service\s+requests?|work\s+orders?|tickets?|procure\w*|purchas\w+|dispatch\w*|schedul\w+|liaison|liais\w+|facilit(?:y|ies)\s+management|outsourc\w+|escalat\w+)\b/i;
const ASKS_TO_OBSERVE = /\b(?:observ\w+|shadow\w*)\b/i;
/** Overseeing or helping counts only where that's what's asked. Otherwise someone else did the work. */
/** A sentence with no one in it that's about a thing or someone else: "Snow removal at our complexes is a contract with a
 * plow company", "Outside counsel writes the first drafts". Who did it isn't said, so it's a question to ask, not a lead.
 * A line that opens on what was done ("Temper chocolate for bonbons weekly") or names a tool is still the person's. */
const aboutSomethingElse = (s: Statement) => {
  if (s.subject !== "unclear") return false;
  if (/\b(?:is|are|was|were)\s+(?:on\s+me|mine|me|my\b)/i.test(s.text)) return false;
  return /^\W*(?:[\p{L}\p{N}'’,$.-]+\s+){1,7}?(?:is|are|was|were|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)\b/iu.test(s.text) || (/^\W*(?:[\p{L}'’-]+\s+){1,2}?\p{Ll}{2,}[^su\W]s\s+(?:the|a|an|our|my|all|every|any|it|them)\b/u.test(s.text) && !/^\W*\p{L}+(?:ed|ing)\b/iu.test(s.text));
};
const ownedFor = (piece: string, s: Statement) => s.ownership === "performed" || (s.ownership === "oversaw" && ASKS_TO_OVERSEE.test(piece)) || (s.ownership === "requested" && ASKS_TO_REQUEST.test(piece)) || (s.ownership === "assisted" && ASKS_TO_ASSIST.test(piece)) || (s.ownership === "observed" && ASKS_TO_OBSERVE.test(piece));

function readPiece(piece: string, allStatements: Statement[], options: ReadOptions): { level: 2 | 1 | 0; quote: string | null; sourceId: string | null } {
  // When helping is what's asked, saying you helped is saying you did it.
  const statements = allStatements.filter(s => !aboutSomethingElse(s) && ownedFor(piece, s)).map(s => (s.ownership === "assisted" ? { ...s, act: "concrete" as const } : s));
  const groups = GROUPS.filter(g => askedBy(piece, g));
  let lead: string | null = null;
  for (const s of statements) {
    if (s.act === "says_little") continue;
    for (const group of groups) {
      if (!group.descriptions.some(d => hasPhrase(s.readable, d)) && !verbBeforeObject(s.readable, group)) continue;
      // Until the owner has reviewed it, a table entry can only say this looks related.
      if ((group.status === OWNER_APPROVED || options.assumeApproved) && statesDoing(s)) return { level: 2, quote: s.text, sourceId: group.source };
      lead ??= s.text;
    }
  }
  const wanted = specificTerms(piece);
  for (const s of statements) {
    if (!wanted.length || s.act === "says_little") continue;
    // Only what the person's own clause says: "people who never touched payroll" says nothing about payroll.
    const have = new Set([...canonicalTerms(s.readable)].flatMap(t => [t, stem(t)]));
    const found = wanted.filter(t => have.has(t) || have.has(stem(t)));
    // A word that's only part of a longer name, in plain lower case: "steel rails" isn't Ruby on Rails.
    const fragment = (s.readable.match(/\p{L}+/gu) ?? []).some(w => wanted.some(t => canonicalTerms(w).has(t)) && fragmentOfLongerName(piece, s.readable, w));
    if (fragment || found.some(t => otherSense(piece, t) !== otherSense(s.readable, t) || ordinaryMeaning(s.readable, t))) continue;
    if (found.length === wanted.length && !actionMissing(piece, s.readable) && statesDoing(s)) return { level: 2, quote: s.text, sourceId: null };
    // "Worked with vendors" isn't a lead on negotiating vendor contracts, though "worked with Kafka" names the thing.
    if (found.length && (s.act === "concrete" || found.length === wanted.length)) lead ??= s.text;
  }
  if (lead) return { level: 1, quote: lead, sourceId: null };
  for (const s of statements) {
    if (s.act === "says_little") continue;
    if (groups.some(g => g.related.some(r => hasPhrase(s.text, r)))) return { level: 1, quote: s.text, sourceId: null };
    // Same-family tools are different things: that's not a lead, and the rules decide it elsewhere.
    if ([...canonicalTerms(s.text)].some(t => isKnownTechnology(t) && !wanted.includes(t) && relation(piece, t) === "related")) return { level: 0, quote: null, sourceId: null };
  }
  return { level: 0, quote: null, sourceId: null };
}

/** What an answer shows about this requirement, by itself. Hard limits: credentials and time are out of its
 * reach, and "supported" needs the requirement's own terms, or a description of that exact work the owner
 * has approved. Anything not plainly English stays where it was. */
export function readAnswer(requirement: MatchRequirement, detail: string, options: ReadOptions = {}): AnswerReading {
  const text = qualificationText(requirement.text).trim();
  const nothing = (reason: string): AnswerReading => ({ verdict: "insufficient_information", quote: null, reason, sourceId: null });
  if (!text) return nothing("not_assessable");
  if (needsCredentialEntry(text)) return nothing("credential_needs_an_entry");
  if (answerLanguage(detail) !== "en") return nothing("language_not_evaluated");
  const statements = answerStatements(detail);
  if (!statements.length) return nothing("no_own_statement");
  // Limited familiarity can be a lead on a skill or tool, never on experience, proficiency, a level, or time.
  if (statements.every(s => s.brief) && (requirement.category === "Experience" || ASKS_FOR_PRACTICE.test(text))) return nothing("brief_exposure_only");
  const structure = parseRequirement(text, new Set(), true);
  const pieces = structure.pieces.length ? structure.pieces : [structure.creditText || text];
  const readings = pieces.map(p => readPiece(p, statements, options));
  const quote = readings.find(r => r.quote)?.quote ?? null;
  if (!quote) return nothing("no_relationship");
  // Someone else does part of what's asked, by the answer's own account: the person's part is Possible at most.
  const others = new Set([...canonicalTerms(othersText(detail))].flatMap(t => [t, stem(t)]));
  const shared = specificTerms(text).some(t => others.has(t) || others.has(stem(t)));
  const all = readings.every(r => r.level === 2) && !shared;
  // An answer can't add time to a job, or show a level the person hasn't rated.
  const capped = asksForTime(text) || requiredSkillLevel(text) !== null || /\bas\s+(?:a|an|the)\b/i.test(text);
  if (all && !capped) return { verdict: "supported", quote, reason: "stated_work", sourceId: readings[0].sourceId };
  return { verdict: "possible", quote, reason: all ? "limit_on_what_an_answer_shows" : "part_of_what_is_asked", sourceId: null };
}

/** "I have seven years" when the listed roles cover less: they may have earlier work that isn't listed. That's
 * Possible, never more, and the person is asked to add the roles so the dates can show it. Only the dates can
 * make it Supported. */
function claimsMoreTime(requirement: MatchRequirement, answer: Extract<LinkedAnswer, { action: "confirm" }>, f: RawFinding): RawFinding {
  const needed = requiredMonths(qualificationText(requirement.text));
  if (needed === null || answerLanguage(answer.detail) !== "en") return f;
  const claim = answerStatements(answer.detail).find(s => !s.brief && (requiredMonths(s.text) ?? 0) >= needed);
  if (!claim) return f;
  return {
    ...f,
    verdict: "possible",
    explanation: "You said you have this much time, but your listed roles cover less. If earlier roles are missing, add them in Experience so the dates can show it.",
    citations: [{ evidence_id: answer.evidenceId, quote: claim.text.slice(0, 300) }],
    caveats: [],
    basis: "candidate_answer" as RuleBasis,
    rules_only_verdict: f.verdict,
  };
}

const EXPLAIN: Record<string, string> = {
  stated_work: "Your answer describes doing this work.",
  limit_on_what_an_answer_shows: "Your answer describes this work, but an answer alone can't show the amount of time or level asked for.",
  part_of_what_is_asked: "Your answer describes related work, or part of what this asks for.",
};

/** Applies active answers to the rules' findings. Only moves Not enough information or Possible, so the rules'
 * own Supported and Not supported always stand. The rules-only verdict is kept beside it. */
export function applyAnswers(request: MatchRequest, findings: RawFinding[], answers: LinkedAnswer[], keyFor: (r: MatchRequirement) => string, options: ReadOptions = {}): RawFinding[] {
  if (!answers.length) return findings;
  const byKey = new Map(answers.map(a => [a.questionKey, a]));
  return findings.map(f => {
    if (f.verdict === "supported" || f.review) return f;
    const requirement = request.requirements.find(r => r.index === f.requirement_index)!;
    const answer = byKey.get(keyFor(requirement));
    if (!answer) return f;
    if (f.verdict === "gap") return f.basis === "employment_dates" && answer.action === "confirm" ? claimsMoreTime(requirement, answer, f) : f;
    if (answer.action === "deny") {
      return { ...f, verdict: "gap", explanation: "You said you don't have this. You can correct or revoke that answer.", citations: [], caveats: [], basis: "candidate_denied" as RuleBasis, rules_only_verdict: f.verdict };
    }
    const reading = readAnswer(requirement, answer.detail, options);
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
