import { answerLanguage } from "@/lib/ai/answer-language";
import { splitBySubject } from "@/lib/ai/clauses";
import type { MatchRequest, MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { answerStatements, checksOthersWork, DEFAULT_TEXT_RULES, othersParts, othersText, PAPERWORK_ASKED, type Statement, type TextRules } from "@/lib/ai/evidence-boundary";
import type { RuleBasis } from "@/lib/ai/match-validation";
import { requiredMonths, unquantifiedTime } from "@/lib/ai/match-validation";
import { parseRequirement } from "@/lib/ai/requirement-structure";
import { ownNegative } from "@/lib/ai/rules/profile-fields";
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
// A group the owner rejected is read by nothing, not even as a lead.
const GROUPS: Group[] = equivalences.groups.filter(g => g.status !== "owner_rejected").map(g => ({ canonical: g.canonical, asks: g.asks, descriptions: g.descriptions, related: g.related, source: `equivalence:${g.canonical}`, verbs: g.verbs, objects: g.objects, status: g.status }));

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
/** `textRules`: which text rules read the answer. Matching uses the default (rules-v21); "v20" and "v19" are for comparisons only. */
export type ReadOptions = { assumeApproved?: boolean; textRules?: TextRules };

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
/** Teaching others counts as the work only where teaching or training others is what's asked (rules-v20, O1). */
const ASKS_TO_TRAIN = /\b(?:teach\w*|instruct\w*|mentor\w*|coach\w*|onboard\w*|train\w*\s+(?:new\s+|other\s+|junior\s+)?(?:staff|employees|hires|workers|others|team\s+members|technicians|apprentices|students|users))\b/i;
export const ownedFor = (piece: string, s: Statement) => s.ownership === "performed" || (s.ownership === "taught" && ASKS_TO_TRAIN.test(piece)) || (s.ownership === "oversaw" && ASKS_TO_OVERSEE.test(piece)) || (s.ownership === "requested" && ASKS_TO_REQUEST.test(piece)) || (s.ownership === "assisted" && ASKS_TO_ASSIST.test(piece)) || (s.ownership === "observed" && ASKS_TO_OBSERVE.test(piece));

// rules-v21 (F5, owner R2): hiring, verifying and approving are work the person can do themselves. Overseeing counts as the
// work only where oversight itself is asked; for hiring, recruiting, verifying or approving, only the person's own direct
// act counts. Recommending, sitting in, forwarding, submitting or routing for approval never does.
const OVERSIGHT_ASKED = /\b(?:schedul\w+|oversee\w*|oversight|supervis\w+|manag\w+|lead\w*|direct\w*|coordinat\w+|delegat\w+|vendor|contractor|procure\w*)\b/i;
const ACT_ASKED = { hire: /\bhir(?:e|es|ed|ing)\b/i, recruit: /\brecruit\w*/i, approve: /\bapprov\w*/i, verify: /\bverif\w*/i };
// The act's subject is the person: the words between "I" and the act never cross into someone else's relative clause
// ("I oversee the AP clerks who verify and approve invoices").
const OWN_ACT = {
  recruit: /\bI\s+(?:(?!(?:who|that|which|whom)\b)[\p{L}'’-]+\s+){0,3}?(?:recruit|recruited|source|sourced|screen|screened)\b/iu,
  hire: /\bI\s+(?:(?!(?:who|that|which|whom)\b)[\p{L}'’-]+\s+){0,3}?(?:hire|hired|make\s+(?:the\s+)?(?:final\s+)?(?:hiring|offer|selection)\s+decisions?|extend(?:ed)?\s+(?:the\s+)?(?:job\s+)?offers?|decide\s+who\s+(?:we\s+|to\s+)?hire|choose\s+who\s+(?:we\s+|to\s+)?hire|select\s+(?:the\s+)?(?:candidates?|hires?))\b/iu,
  approve: /\bI\s+(?:(?!(?:who|that|which|whom)\b)[\p{L}'’-]+\s+){0,8}?(?:approve|approved|sign(?:ed)?\s+off\s+on)\b[^.;]{0,30}\b(?:invoices?|bills?|payments?|them|it|expenses?)\b/iu,
  verify: /\bI\s+(?:(?!(?:who|that|which|whom)\b)[\p{L}'’-]+\s+){0,3}?(?:verif(?:y|ied)|check|checked|match|matched|audit|audited)\b[^.;]{0,25}\b(?:invoices?|bills?)\b/iu,
};
// What undoes each act, for that act only: recommending candidates isn't hiring, but it doesn't cancel the person's own
// screening (owner decision, failure 4: recruiting is judged on its own); sending invoices for approval isn't approving.
const WATCHING = String.raw`sit\s+in|sat\s+in|observ\w+`;
const NOT_OWN_ACT: Record<keyof typeof OWN_ACT, RegExp> = {
  recruit: new RegExp(String.raw`\b(?:${WATCHING})\b`, "i"),
  hire: new RegExp(String.raw`\b(?:recommend\w*|${WATCHING}|forward\w*)\b`, "i"),
  approve: new RegExp(String.raw`\b(?:${WATCHING}|forward\w*|submit\w*\s+(?:\S+\s+){0,3}?for\s+approval|rout\w+\s+(?:\S+\s+){0,3}?(?:for|to)\s+approval|ask\w*\s+(?:\S+\s+){0,3}?to\s+approve|request\w*\s+approval|get\s+(?:\S+\s+){0,3}?approved)\b`, "i"),
  verify: new RegExp(String.raw`\b(?:${WATCHING}|forward\w*)\b`, "i"),
};
/** rules-v21 (F6): by the answer's own account, someone else does the WHOLE of this requirement: other people's clauses
 * (never the person's own retracted words, never a thing being something: "our plant is SQF") cover every one of its own
 * terms, or hand it off outright ("our pharmacists do that", "the mechanics do the work"). Covering part of it ("Kevin
 * designs the API contracts" for "Design and develop RESTful APIs") leaves room for the person's distinct work. Used only
 * to hold checkbox credit back, never to give it. */
export function othersDoWholeRequirement(requirementText: string, detail: string): boolean {
  const acts = othersParts(detail, true, false, true).filter(p => !/^\W*(?:[\p{L}'’-]+\s+){0,4}?(?:is|are|was|were|has|have|had)\b/iu.test(p));
  const said = acts.join(" ");
  if (!said.trim()) return false;
  const wanted = specificTerms(qualificationText(requirementText));
  const have = new Set([...canonicalTerms(said)].flatMap(t => [t, stem(t)]));
  const whole = wanted.length > 0 && wanted.every(t => have.has(t) || have.has(stem(t)));
  const handedOff = /\b(?:does|do|did|handles?|handled|takes?\s+care\s+of|took\s+care\s+of)\s+(?:that|those|it|this|them|all\s+of\s+(?:that|it|them)|(?:all\s+)?the\s+(?:actual\s+|real\s+)?work)\b/i.test(said);
  return whole || handedOff;
}

/** rules-v21 (F6, D1): the person's own words deny doing the requirement's work: a sentence of theirs ("I", "we", or
 * opening on the denial: "Never dealt with a union contract") that is negative and names every specific term asked. */
export function deniesRequirement(requirementText: string, detail: string): boolean {
  const asked = qualificationText(requirementText);
  // The leading action word needn't be repeated: "Never dealt with a union contract" denies "Negotiating union contracts".
  const action = /^\W*(\p{L}+ing)\b/iu.exec(asked)?.[1].toLowerCase();
  const all = specificTerms(asked);
  const wanted = action && all.length > 1 ? all.filter(t => stem(t) !== stem(action) && t !== action) : all;
  if (!wanted.length) return false;
  return (detail.match(/(?:[^.!?;\n]|\.(?=\d))+/g) ?? []).some(s => {
    if (!ownNegative(s)) return false;
    if (!/(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s/iu.test(s) && !/^\W*(?:never|not|no|haven['’]t|hasn['’]t|didn['’]t|have\s+not|did\s+not)\b/i.test(s)) return false;
    const have = new Set([...canonicalTerms(s)].flatMap(t => [t, stem(t)]));
    return wanted.every(t => have.has(t) || have.has(stem(t)));
  });
}

/** rules-v21: the person's own direct hiring, approving or verifying act, where the piece asks for that act. */
export function ownDirectAct(piece: string, text: string): boolean {
  return (Object.keys(ACT_ASKED) as (keyof typeof ACT_ASKED)[]).some(k => ACT_ASKED[k].test(piece) && OWN_ACT[k].test(text) && !NOT_OWN_ACT[k].test(text));
}
/** rules-v21 ownership for a piece: as `ownedFor`, but overseeing counts only where oversight is asked, or as the
 * person's own direct act where hiring, approving or verifying is asked (F5, R2). */
export const ownedForV21 = (piece: string, s: Statement) =>
  s.ownership === "performed" ? true
  : s.ownership === "oversaw" ? OVERSIGHT_ASKED.test(piece) || ownDirectAct(piece, s.text)
  : ownedFor(piece, s);

function readPiece(piece: string, allStatements: Statement[], options: ReadOptions): { level: 2 | 1 | 0; quote: string | null; sourceId: string | null } {
  // When helping is what's asked, saying you helped is saying you did it.
  // rules-v20: teaching others to do the work, where that isn't what's asked, can be a lead and never more (O1).
  const leadOnly = (s: Statement) => s.ownership === "taught" && !ASKS_TO_TRAIN.test(piece);
  // rules-v20: paperwork for another party is the work itself where that paperwork is what's asked ("Filing customs entries").
  const owned = (options.textRules ?? DEFAULT_TEXT_RULES) === "v21" ? ownedForV21 : ownedFor;
  const statements = allStatements.filter(s => s.subject !== "team" && !aboutSomethingElse(s) && (owned(piece, s) || s.ownership === "taught" || (s.paperwork === true && PAPERWORK_ASKED.test(piece)))).map(s => (s.ownership === "assisted" ? { ...s, act: "concrete" as const } : s));
  const groups = GROUPS.filter(g => askedBy(piece, g));
  let lead: string | null = null;
  for (const s of statements) {
    if (s.act === "says_little") continue;
    for (const group of groups) {
      if (!group.descriptions.some(d => hasPhrase(s.readable, d)) && !verbBeforeObject(s.readable, group)) continue;
      // Until the owner has reviewed it, a table entry can only say this looks related.
      if ((group.status === OWNER_APPROVED || options.assumeApproved) && statesDoing(s) && !leadOnly(s)) return { level: 2, quote: s.text, sourceId: group.source };
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
    if (found.length === wanted.length && !actionMissing(piece, s.readable) && statesDoing(s) && !leadOnly(s)) return { level: 2, quote: s.text, sourceId: null };
    // "Worked with vendors" isn't a lead on negotiating vendor contracts, though "worked with Kafka" names the thing.
    if (found.length && (s.act === "concrete" || found.length === wanted.length)) lead ??= s.text;
    // "When our point-of-sale terminals freeze, I'm the one who troubleshoots them": the thing is named in the "when"
    // part and the person's clause points back to it. A lead, never more.
    if (!found.length && s.act === "concrete" && /\b(?:them|it|those|these)\b/i.test(s.readable)) {
      const context = new Set([...canonicalTerms(s.text)].flatMap(t => [t, stem(t)]));
      if (wanted.some(t => context.has(t) || context.has(stem(t))) && wanted.some(t => have.has(t) || have.has(stem(t)) || words(s.readable).some(w => stem(w) === stem(t)))) lead ??= s.text;
    }
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
  // Someone else does part of what's asked, by the answer's own account: the person's part is Possible at most, and
  // checking that work ("My cooks prepare them. I spot-check the trays") is overseeing it, not doing it.
  const othersSaid = (options.textRules ?? DEFAULT_TEXT_RULES) === "v21" ? othersParts(detail, false, true, true).join(" ") : othersText(detail);
  const others = new Set([...canonicalTerms(othersSaid)].flatMap(t => [t, stem(t)]));
  const shared = specificTerms(text).some(t => others.has(t) || others.has(stem(t)));
  const statements = answerStatements(detail, options.textRules).map(s => (shared && s.ownership === "performed" && checksOthersWork(s.text) ? { ...s, ownership: "oversaw" as const } : s));
  if (!statements.length) return nothing("no_own_statement");
  // Limited familiarity can be a lead on a skill or tool, never on experience, proficiency, a level, or time.
  if (statements.every(s => s.brief) && (requirement.category === "Experience" || ASKS_FOR_PRACTICE.test(text))) return nothing("brief_exposure_only");
  const structure = parseRequirement(text, new Set(), true);
  const pieces = structure.pieces.length ? structure.pieces : [structure.creditText || text];
  const readings = pieces.map(p => readPiece(p, statements, options));
  const quote = readings.find(r => r.quote)?.quote ?? null;
  if (!quote) return nothing("no_relationship");
  const all = readings.every(r => r.level === 2) && !shared;
  // An answer can't add time to a job, or show a level the person hasn't rated.
  const capped = asksForTime(text) || requiredSkillLevel(text) !== null || /\bas\s+(?:a|an|the)\b/i.test(text);
  if (all && !capped) return { verdict: "supported", quote, reason: "stated_work", sourceId: readings[0].sourceId };
  return { verdict: "possible", quote, reason: all ? "limit_on_what_an_answer_shows" : "part_of_what_is_asked", sourceId: null };
}

/** "I have seven years" when the listed roles cover less: they may have earlier work that isn't listed. That's
 * Possible, never more, and the person is asked to add the roles so the dates can show it. Only the dates can
 * make it Supported. */
function claimsMoreTime(requirement: MatchRequirement, answer: Extract<LinkedAnswer, { action: "confirm" }>, f: RawFinding, options: ReadOptions): RawFinding {
  const needed = requiredMonths(qualificationText(requirement.text));
  if (needed === null || answerLanguage(answer.detail) !== "en") return f;
  const claim = answerStatements(answer.detail, options.textRules).find(s => !s.brief && (requiredMonths(s.text) ?? 0) >= needed);
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

/** Credit that rests on a job title: its dates, the title itself, or citations that only quote job titles. */
function restsOnTitle(request: MatchRequest, f: RawFinding): boolean {
  if (f.basis === "employment_dates" || f.basis === "role_description") return true;
  return f.citations.length > 0 && f.citations.every(c => {
    const item = request.evidence.find(e => e.id === c.evidence_id);
    return item?.kind === "experience" && c.quote === item.job_title;
  });
}
const MIXED_WITH_TITLE = "Your answer says someone else does part of this work, so your title counts toward Possible at most.";
const TITLE_CONTRADICTED = "Your job title suggested this, but your answer says someone else does this work, so the title alone isn't counted. If you do it yourself too, say what you did.";
/** Phase 5.3: a confirmed answer that gives the asked work to someone else takes away credit that rested only on a job title,
 * to Not enough information, never lower. Supervising alone doesn't: the person may do the work too. What the rules said
 * before is kept beside it, and the citation is the answer's own words. A later reply can still show the person did it. */
function titleContradicted(request: MatchRequest, requirement: MatchRequirement, answer: Extract<LinkedAnswer, { action: "confirm" }>, f: RawFinding, options: ReadOptions): RawFinding | null {
  if ((f.verdict !== "supported" && f.verdict !== "possible") || !restsOnTitle(request, f) || answerLanguage(answer.detail) !== "en") return null;
  const text = qualificationText(requirement.text);
  const wanted = specificTerms(text);
  const touches = (part: string) => {
    const have = new Set([...canonicalTerms(part)].flatMap(t => [t, stem(t)]));
    return wanted.some(t => have.has(t) || have.has(stem(t)));
  };
  const theirs = othersParts(answer.detail, true, true, (options.textRules ?? DEFAULT_TEXT_RULES) === "v21").find(touches);
  if (!theirs || readAnswer(requirement, answer.detail, options).verdict !== "insufficient_information") return null;
  // "I do the individual 1040s and my manager takes the partnership returns": the work is split in one sentence, so the
  // person does part of it. That's mixed ownership: Possible at most, not taken away.
  const sentence = (answer.detail.match(/(?:[^.!?;\n]|\.(?=\d))+/g) ?? []).find(x => x.includes(theirs.trim()));
  if (sentence && splitBySubject(sentence).some(c => c.subject === "self")) {
    return f.verdict === "supported" ? { ...f, verdict: "possible", caveats: [MIXED_WITH_TITLE, ...f.caveats].slice(0, 5) } : null;
  }
  return { ...f, verdict: "insufficient_information", explanation: TITLE_CONTRADICTED, citations: [{ evidence_id: answer.evidenceId, quote: theirs.trim().slice(0, 300) }], caveats: [TITLE_CONTRADICTED], basis: "candidate_answer" as RuleBasis, rules_only_verdict: f.verdict };
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
    if (f.review) return f;
    const requirement = request.requirements.find(r => r.index === f.requirement_index)!;
    const answer = byKey.get(keyFor(requirement));
    if (!answer) return f;
    if (answer.action === "confirm") {
      const lowered = titleContradicted(request, requirement, answer, f, options);
      if (lowered) return lowered;
    }
    if (f.verdict === "supported") return f;
    if (f.verdict === "gap") return f.basis === "employment_dates" && answer.action === "confirm" ? claimsMoreTime(requirement, answer, f, options) : f;
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
