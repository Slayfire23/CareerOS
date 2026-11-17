import { answerLanguage } from "@/lib/ai/answer-language";
import { isPersonClause, splitBySubject } from "@/lib/ai/clauses";
import type { Evidence } from "@/lib/ai/evidence";
import { answerUntrustedSpans, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import { notAStatement, ownClauses, ownNegative } from "@/lib/ai/rules/profile-fields";
import { HANDED_OFF, IRREGULAR_PAST, keywordDump, labelledList, opensOnNamedOther, ownSpan, someoneElsesWork, VOCABULARY, WORK_VERB_WORDS } from "@/lib/ai/skill-relations";
import { hasDirectedText } from "@/lib/ai/untrusted-text";
import { localTestReader } from "@/lib/ai/test-reader";
import { withdrawnClaims } from "@/lib/ai/withdrawals";

// The one place text is cleared before it can count. Resume and profile text goes through the checks that
// apply to it; an answer goes through those and more, because it's written in reply to a question and could
// otherwise be shaped to fit one. An answer is never ordinary role text: the engine doesn't read it, no AI
// provider receives it (local shadow testing has its own route, and decides nothing), and it's read again from scratch on every analysis, so what was saved earlier gets
// no standing from having been saved.

export type TextOrigin = "profile" | "answer";

/** Spans of text that can never be evidence. */
export const untrustedSpans = (text: string, origin: TextOrigin, v21 = false) => (origin === "answer" ? answerUntrustedSpans(text, v21) : untrustedEvidenceSpans(text));

/** An answer's entry. It keeps its role's title and dates only so a citation can point at it. */
export const isAnswerEvidence = (item: Evidence) => item.kind === "experience" && item.source === "clarification";
/** What the rules engine may read. Answers reach a verdict only through the answer reader. */
export const evidenceForRules = (evidence: Evidence[]) => evidence.filter(item => !isAnswerEvidence(item));
/** What any AI provider may receive: no answers, and no field that says where something came from. */
export const evidenceForAi = (evidence: Evidence[]): Evidence[] => evidenceForRules(evidence)
  .map(item => ("source" in item ? (Object.fromEntries(Object.entries(item).filter(([key]) => key !== "source")) as Evidence) : item));

/** Could, would, or might, which says nothing about what was done. */
const HYPOTHETICAL = /\b(?:i\s+(?:could|would|can|might|may|should)|i['’]d|we\s+(?:could|would|can|might)|if\s+(?:needed|required|asked|necessary|given|i\b|we\b)|would\s+be\s+(?:able|happy|glad)|(?:be\s+)?able\s+to|capable\s+of|willing\s+to|happy\s+to|ready\s+to|confident\s+(?:i|that)|sure\s+i|pick\s+(?:it|that|this)\s+up|learn\s+(?:it|that|this)|(?:plan|planning|going|hoping|hope|want|wanting|intend|intending|expect|expecting)\s+to|in\s+the\s+future|some\s*day|one\s+day|next\s+(?:year|month|quarter)|soon)\b/i;
/** Plainly a brief try, however it's described: a weekend, a sample, a trial, a look around, then gone. */
const BRIEF_TRY = /\b(?:one|last)\s+weekend\b|\bover\s+a\s+weekend\b(?!\s+\p{L})|\b(?:one|a\s+single)\s+(?:afternoon|evening|morning|night)\b|\bfor\s+(?:about\s+|only\s+|just\s+)?(?:a\s+couple\s+of|a\s+few|two|three)\s+(?:days|afternoons|evenings|weekends|shifts)\b|\bwasn['’]t\s+for\s+me\b|\bfor\s+(?:a|one)\s+(?:day|week|weekend|afternoon|evening)\b|\b(?:ran|tried|used|did|opened|tested|built)\s+(?:it|that|one)\s+(?:just\s+|only\s+)?(?:once|twice)\b|\b(?:just|only)\s+(?:once|twice)\b|\b(?:sample|demo|toy|practice)\s+(?:project|app|file|workbook|account|site)\b|\b(?:followed|watched|worked\s+through|did)\s+(?:a|an|the|some|one|two)?\s*(?:[\p{L}-]+\s+){0,3}?tutorials?\b|\bhello\s+world\b|\btook\s+(?:a|an|one|that)\s+(?:[\p{L}-]+\s+){0,3}?(?:class|course|workshop|webinar|seminar|bootcamp|training)\b|\b(?:weekend|evening|night|community|intro(?:ductory)?|online|one-day|half-day)\s+(?:class|course|workshop|bootcamp)\b|\bone\s+(?:session|class|workshop|lesson|demo)\b|\bthat\s+one\s+(?:session|class|time|workshop|course|lesson)\b|\blunch[\s-]+and[\s-]+learn\b|\b(?:vendor\s+)?demo\s+(?:day|session)\b|\bvendor\s+demo\b|\b(?:a|one)\s+(?:one|half|single)[\s-]day\s+(?:class|course|workshop|session|training)\b|\bfollowed\s+(?:the|their|his|her)\s+[\p{L}'’-]+\s+steps\b|\bfree\s+trial\b|\b(?:opened|started|signed\s+up\s+for|downloaded|installed|spun\s+up)\s+(?:a|an|the)\s+(?:[\p{L}-]+\s+){0,3}?trial\b|\bclicked\s+around\b|\bplayed\s+(?:around|with)\b|\bmessed\s+(?:around|with)\b|\bpoked\s+around\b|\bdabbled\b|\btinkered\b|\bmoved\s+on\b/iu;
const CORRECTION_MARKER = /(?:^|[.!?;,]\s*)(?:well|actually|i\s+mean|to\s+be\s+honest|honestly|in\s+reality|truthfully|ok(?:ay)?|correction|sorry)\b[,:]?\s*([^.!?;\n]*)/giu;
/** What makes the words after a marker a correction: they shrink the claim, deny it, or give it to someone else. */
const SHRINKS = /\b(?:only|just|mostly|merely|barely|hardly|not|never|no|none|kind\s+of|sort\s+of|stood|watched|wave[sd]?|near)\b|n['’]t\b/i;
const SOMEONE_ELSE_DOES = /^(?:(?:the|a|an|our|my|their|his|her)\s+[\p{L}-]+(?:\s+[\p{L}-]+)?|\p{Lu}\p{Ll}+|they|he|she|someone|volunteers|others)\s+[\p{Ll}]+|,\s*(?:the|our|a|an|my|their)\s+[\p{L}-]+\s+\p{Ll}+s\b/u;
/** What follows a marker takes back what came before: it shrinks or denies it, gives it to someone else, or turns the
 * person's part into asking, overseeing, helping, or watching. "Actually, I also train new hires on it" adds to it. */
const contradicts = (rest: string) => SHRINKS.test(rest) || SOMEONE_ELSE_DOES.test(rest) || HANDED_OFF.test(rest) || splitBySubject(rest).some(c => c.subject === "other") || ["requested", "oversaw", "assisted", "observed"].includes(involvement(rest));
/** The claim just before a position: the rest of the sentence before it, or the sentence before when it starts one. */
function claimBefore(detail: string, at: number): [number, number] | null {
  const before = detail.slice(0, at);
  const inSentence = before.search(/[^.!?;\n]*$/);
  if (before.slice(inSentence).trim()) return [inSentence, at];
  const prior = before.slice(0, inSentence).replace(/[.!?;\s]+$/, "");
  if (!prior.trim()) return null;
  return [prior.search(/[^.!?;\n]*$/), prior.length];
}
// rules-v21 (DD3, F3): "Mostly …" and "In practice …" open a correction too, and "the mechanics do the work" hands the work off.
// "Mostly", "Really" and "In practice" open a correction only at the start of a sentence: ", mostly heat maps" is a list.
const CORRECTION_MARKER_V21 = /(?:(?:^|[.!?;,]\s*)(?:well|actually|i\s+mean|to\s+be\s+honest|honestly|in\s+reality|truthfully|ok(?:ay)?|correction|sorry)|(?:^|[.!?]\s+)(?:mostly|really|in\s+practice))\b[,:]?\s*([^.!?;\n]*)/giu;
const HANDS_THIS_OFF_V21 = /(?:^|[^\p{L}])(?!(?:i|we)\s)([\p{L}'’-]+)\s+(?:(?:in\s+back|out\s+back|upstairs|downstairs|themselves)\s+)?(?:handles?|handled|does|do|did|takes?\s+care\s+of|took\s+care\s+of|runs?|ran|owns?|covers?|covered)\s+(?:that|those|it|this|them|all\s+of\s+(?:that|it|them)|(?:all\s+)?the\s+(?:actual\s+|real\s+|heavy\s+)?work|all\s+of\s+the\s+work)\b|\bunder\s+contract\b|\b(?:that|this|it|those)(?:['’]s|\s+is|\s+are)\s+(?:all\s+)?(?:handled|done|covered|outsourced|contracted)\b/iu;
/** Verbs that only say "deals with it", so a hand-off with them covers whatever the person just claimed. */
const GENERIC_ACT = /^(?:do|handle|take|cover|own|manage|run|work|deal)$/;

/** The parts of an answer it takes back. "Yes, I teach it. Well, volunteers teach it" takes back the first sentence and
 * nothing else; the correcting words are read like any others. A marker means nothing by itself.
 * `v21` (DD3): more correction openers; a hand-off of a *different* act ("I plan the campaigns; our agency runs them")
 * keeps the person's own claim; and in a sentence where the person also speaks, only the other person's clause goes. */
export function retractions(detail: string, v21 = false): [number, number][] {
  const out: [number, number][] = [];
  for (const match of detail.matchAll(v21 ? CORRECTION_MARKER_V21 : CORRECTION_MARKER)) {
    const markerAt = match.index + match[0].search(/\p{L}/u);
    if (!detail.slice(0, markerAt).trim() || !contradicts(match[1].trim())) continue;
    const claim = claimBefore(detail, markerAt);
    if (claim) out.push(claim);
  }
  for (const sentence of detail.matchAll(/(?:[^.!?;\n]|\.(?=\d))+/g)) {
    const hand = (v21 ? HANDS_THIS_OFF_V21 : HANDS_THIS_OFF).exec(sentence[0]);
    if (!hand || NOT_A_DOER.has((hand[1] ?? "").toLowerCase())) continue;
    const others = v21 ? splitBySubject(sentence[0]) : [];
    if (v21 && others.some(c => c.subject === "self")) {
      // "I write them up and the mechanics do the work, I only fix flats": the person's own clauses stay readable.
      for (const c of others) if (c.subject === "other") out.push([sentence.index + c.start, sentence.index + c.start + c.text.length]);
    } else out.push([sentence.index, sentence.index + sentence[0].length]);
    // "The month-end close, our accountant does that part" is about its own topic. "Finance handles that" is about
    // what the person just said, so that goes too.
    const topic = sentence[0].slice(0, hand.index).match(/\p{L}{3,}/gu) ?? [];
    if (topic.filter(w => !/^(?:the|and|but|though|really|honestly|actually|well|that|this|all|our|their)$/i.test(w)).length < 2) {
      const claim = claimBefore(detail, sentence.index + sentence[0].search(/\S|$/));
      if (!claim) continue;
      if (v21) {
        // A specific hand-off verb ("runs them") over a different, specific act of the person's ("I plan the campaigns")
        // is a division of the work, not a take-back. A generic one ("handles that", "does the work") takes it back.
        const handVerb = verbBase((hand[0].match(/\b(handles?|handled|does|do|did|takes?|took|runs?|ran|owns?|covers?|covered)\b/i)?.[1] ?? "").toLowerCase());
        const mine = verbAndObject(detail.slice(claim[0], claim[1]))?.verb ?? "";
        if (!GENERIC_ACT.test(handVerb) || handVerb === "run") {
          if (mine && !GENERIC_ACT.test(mine) && mine !== handVerb) continue;
        }
      }
      out.push(claim);
    }
  }
  return out;
}
/** What an answer says someone else did, or takes back: other people's clauses and retracted claims, one part each. Never
 * the person's own work, and only ever used to hold credit back. `peopleOnly` leaves out a thing's part. */
/** `v22` (rules-v22, F0, opt-in): a clause that sends or puts the person to do something ("My boss sends me out to install
 * …") is the person's own work, so it is never someone else's here. */
export function othersParts(detail: string, peopleOnly = false, withRetractions = true, v21 = false, v22 = false): string[] {
  const parts: string[] = withRetractions ? retractions(detail, v21).map(([s, e]) => detail.slice(s, e)) : [];
  for (const sentence of detail.match(/(?:[^.!?;\n]|\.(?=\d))+/g) ?? []) {
    for (const clause of splitBySubject(sentence)) if (clause.subject === "other" && (!peopleOnly || isPersonClause(clause.text)) && !(v22 && directedAtPerson(clause.text))) parts.push(clause.text);
    // A whole sentence about someone else, with no "I" or "we" in it. One where the person speaks gives only the other clause.
    if (!/(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s/iu.test(sentence) && (opensOnNamedOther(sentence.trim(), true) || someoneElsesWork(sentence.trim(), sentence.trim())) && !(v22 && splitBySubject(sentence).some(c => directedAtPerson(c.text)))) parts.push(sentence);
  }
  return parts;
}
export const othersText = (detail: string) => othersParts(detail).join(" ");
/** Whether an answer takes anything back. */
export const correctsItself = (detail: string) => retractions(detail).length > 0;
/** The asked work given to someone else, by pronoun or contract: "Finance handles that", "It's all under contract". */
const HANDS_THIS_OFF = /(?:^|[^\p{L}])(?!(?:i|we)\s)([\p{L}'’-]+)\s+(?:handles?|handled|does|do|did|takes?\s+care\s+of|took\s+care\s+of|runs?|ran|owns?|covers?|covered)\s+(?:that|those|it|this|them|all\s+of\s+(?:that|it|them))\b|\bunder\s+contract\b|\b(?:that|this|it|those)(?:['’]s|\s+is|\s+are)\s+(?:all\s+)?(?:handled|done|covered|outsourced|contracted)\b/iu;
const NOT_A_DOER = new Set("i we and then also or but to so just usually always often still myself ourselves me us you can will would should could must also really personally".split(" "));
/** "Tell them what I can do" isn't a hypothetical. */
const WHAT_I_CAN = /\b(?:what|whatever|all|everything|anything|how\s+much)\s+i\s+can\s+\p{L}+/giu;
/** "I'm the one who troubleshoots them": the "who" is the person, so the clause is theirs. */
const THE_ONE_WHO = /\b(?:i['’]m|i\s+am|i\s+was)\s+the\s+one\s+(?:who|that)\s+/i;
/** A small amount of real work: "done some tack welds", "a few times", "maybe a dozen times". Possible at most. */
const LIMITED = /\b(?:done|did)\s+(?:some|a\s+few|a\s+little|a\s+couple)\b|\b(?:a\s+few|a\s+couple\s+of|maybe\s+a\s+dozen|only\s+a\s+few|a\s+handful\s+of)\s+times\b|\bmaybe\s+a\s+dozen\b/i;
/** Trying something is related to doing it, at most. */
const EXPOSURE = /\b(?:trial(?:l)?ed|piloted|tested\s+out|demoed|evaluated|looked\s+(?:at|into)|considered|explored|exposed\s+to|familiar\s+with|helped\s+with|assisted\s+with)\b/i;
/** Being in the room isn't doing it, and starting and stopping isn't either. */
const NOT_DOING = /\b(?:attended|read\s+about|heard\s+about|learned\s+about|watched|observed|shadowed|sat\s+in|had\s+a\s+go|gave\s+it\s+a\s+(?:go|try|shot)|got\s+part\s*way|partway\s+through|handed\s+it\s+off|outside\s+my\s+scope)\b/i;
/** Someone else's work, in the passive: "handled by our billing office", "is outsourced". */
const SOMEONE_ELSE_MIDWAY = /\bthe\s+[\p{L}-]+\s+(?:does|do|handles?|runs?|owns?|manages?)\b/iu;
const DONE_ELSEWHERE = /\b(?:\w+ed|done|run|kept|sent|set\s+up)\s+by\b|(?<!\b(?:i|we|i\s+\w+|we\s+\w+)\s)\bgo(?:es)?\s+(?:through|to)\s+(?:\p{Lu}|our|the|their|another)|\b(?:bring\s+in|brought\s+in|hire|hired|pay|paid|use|used|outsource\s+to|contract\s+with)\s+(?:an?\s+)?(?:outside\s+|external\s+|third[-\s]party\s+)?(?:firm|agency|vendor|contractor|consultant|company)\b|\b(?:outsourced|sent\s+out|contracted\s+out|farmed\s+out|taken\s+care\s+of)\b/iu;

/** What can come before "I" and only set the scene: "Each morning I...", "When reports slow down I...". */
const FRAMING = /^\W*(?:over|through|throughout|across|under|per|around|near|about|when|whenever|before|after|once|if|as|at|in|on|for|during|since|until|while|each|every|most|all|with|by|from|to|last|this|on|weekly|daily|monthly|then|also|yes|sure|so|because)\b/i;
const SUBJECT_AT = /(?:^|[^\p{L}'’])(?:i|we)(?:['’](?:ve|m|d|ll))?\s/iu;
const FIRST_PERSON = /(?:^|[^\p{L}'’])(i|we)(?:['’](ve|m|d|ll))?\s+(.+)$/iu;
const AUXILIARY = new Set("have has had am is are was were be been being also always usually often regularly routinely personally just then still currently mostly mainly primarily now daily weekly really actually definitely".split(" "));
const BE = new Set("am is are was were be been being".split(" "));
/** Verbs and words that say someone's near a thing, not what they did with it. */
const SAYS_LITTLE = new Set(`yes yeah yep sure definitely absolutely plenty had has have know knew understand understood like love enjoy want wish hope think believe feel seem seems look looked looking try tried care deal dealt help helped helps
assist assisted support supported around get got go went see saw seen hear heard done familiar experienced good great strong real a an the my our some lots lot plenty many
involved exposure touch touched years year months experience knowledge`.split(/\s+/));
const WORKED = new Set(["worked", "work", "works", "working"]);
const OWNS_IT = /\b(?:responsible\s+for|in\s+charge\s+of)\b/i;

/** Arranging for it to be done, or overseeing it. That's work, but not the work itself, unless that's what's asked. */
const OVERSAW = /\b(?:arranged\s+(?:for\s+)?(?:a|an|the)?\s*(?:[\p{L}-]+\s+){0,2}?(?:visit|visits|service|contractor|vendor|company|firm|technician|exterminator|crew|inspection)|schedul(?:e|es|ed|ing)\s+(?:the\s+|our\s+|all\s+)?(?:[\p{L}-]+\s+)?(?:crews?|drivers?|staff|workers|technicians|combines|trucks|contractors?|vendors?|teams?|operators?|installers?|cleaners)|run\s+(?:two|three|four|five|six|several|\d+)\s+(?:crews|teams|shifts)|oversaw|oversee|oversees|overseeing|supervised|supervise|supervises|supervising|signed\s+off|approved|approve|approves|delegated|delegate|delegates|hired|hire|hires|contracted|subcontracted|outsourced|brought\s+in|called\s+in|farmed\s+out|assigned|assign|assigns|tasked|directed|direct|directs|managed\s+(?:the\s+|our\s+|a\s+)?(?:[\p{L}-]+\s+)?(?:team|teams|crew|crews|people|staff|vendors?|contractors?|consultants?)|coordinated\s+(?:the\s+|our\s+|with\s+(?:the\s+|our\s+)?)?(?:[\p{L}-]+\s+)?(?:contractors?|vendors?|crews?|teams?|consultants?)|(?:had|got|have|get)\s+(?:[\p{L}-]+\s+){1,4}?(?:to\s+)?(?:do|did|handle|handled|run|ran|fix|fixed|install|installed|build|built|write|wrote|file|filed|take\s+care)|(?:paid|pay|asked|ask|told|tell)\s+(?:[\p{L}-]+\s+){1,4}?to\s+\p{L}+)\b/iu;
/** Helping someone who does it, or handing things over. */
const ASSISTED = /\b(?:helped|help|helps|helping|assisted|assist|assists|assisting|supported|support|supports|supporting|handed|hand|hands|passed|pass\s+(?:him|her|them|the)|fetched|fetch|held\s+the|hold\s+the|gave\s+(?:him|her|them)\s+(?:the|my|our|a|an)\s+(?:[\p{L}-]+\s+)?(?:logins?|access|keys?|files?|specs?|tools?|passwords?|credentials?|paperwork|list|numbers?|data)|set\s+(?:him|her|them)\s+up|prepped\s+for|tagged\s+along|stocked|sweep|swept)\b/iu;
/** Who did what the sentence describes. */
/** What the person's part in it was. Only "performed" is doing the work; the rest count where that's what's asked. */
/** "taught" is produced only by rules-v20: teaching others to do the work, which isn't doing it (O1). */
export type Ownership = "performed" | "oversaw" | "requested" | "assisted" | "observed" | "taught";

/** Which text rules read an answer. "v20" (Phase 5.3 Stage 3) adds the clause rules below; it was the matching default
 * from 2026-11-11. "v21" (Phase 5.3 Stage B, R3 F1–F9, DD3 and P1) includes every v20 rule; the owner adopted it as the
 * matching default on 2026-11-13 (Stage C). "v20" and "v19" stay selectable so evaluations and tests can compare. */
/** "v21a" (opt-in, post-Stage G Gate A): rules-v21 plus one rule, explicit withdrawals (`@/lib/ai/withdrawals`). Selectable
 * only; the default stays "v21". */
export type TextRules = "v19" | "v20" | "v21" | "v21a" | "v22";
/** The matching default. A local browser-test server may opt into v21a (`localTestReader`: refused on Vercel and unless
 * the database is local); everywhere else it is "v21". */
export const DEFAULT_TEXT_RULES: TextRules = localTestReader() ?? "v21";
/** rules-v22 (Phase 5.3 Stage F0, OPT-IN): rules-v21 plus one rule, "directed at the person". Every v21 rule applies to v22. */
export const isV21Family = (rules: TextRules | undefined) => rules === "v21" || rules === "v21a" || rules === "v22";

// rules-v22 (F0): "My boss sends me out to install water heaters", "My supervisor has me fix leaks". The grammatical subject
// is someone else, but the act after "to" (or after "has me") is the person's own. Deliberately narrow: only send, dispatch,
// assign, schedule and put (+ me + to + an act), and have/had + me + an act. Never tell, ask, let or make (in opened data
// those are templates, injections, refusals and requests), never a negation, modal, intention or condition on the
// directing verb, never "me and others", and never "to" + a place, event or thing ("to a class", "sends me what…").
const DIRECTING_PREFIX = String.raw`^\W*([^,;:]{1,60}?)\s+(?:usually\s+|often\s+|always\s+|also\s+|then\s+|normally\s+|sometimes\s+|mostly\s+)?`;
const DIRECTED_TO = new RegExp(String.raw`${DIRECTING_PREFIX}(?:sends?|sent|dispatch(?:es|ed)?|assigns?|assigned|schedules?|scheduled|puts?)\s+me\s+(?:out\s+)?to\s+(?!(?:a|an|the|my|our|their|his|her|its|this|that|these|those|each|every|all|some|any|work|class|classes|training|school|course|courses|meeting|meetings|seminar|seminars|conference|conferences|site|sites|job|jobs|office|shop|store|branch)\b)(\p{L}[^,;:]*)$`, "iu");
const HAS_ME = new RegExp(String.raw`${DIRECTING_PREFIX}(?:has|had|have)\s+me\s+(?!(?:a|an|the|to|in|on|at|for|with|as|over|down|up|out|off|by|been|be|covered|beat|here|there|now)\b)(\p{L}[^,;:]*)$`, "iu");
const NOT_DIRECTED = /\b(?:never|not|no|nobody|n['’]t|won['’]t|would|could|should|might|may|will|wants?\s+to|wanted\s+to|going\s+to|plans?\s+to|planning\s+to|hopes?\s+to|if|unless|when|whenever|once|i|we|me)\b|n['’]t\b/iu;
/** The act the person was sent or put to do, verbatim, and where it starts in the clause; null for anything else. */
export function directedAtPerson(clause: string): { act: string; index: number } | null {
  for (const pattern of [DIRECTED_TO, HAS_ME]) {
    const m = pattern.exec(clause);
    if (!m) continue;
    if (NOT_DIRECTED.test(m[1])) return null;
    const act = m[2].replace(/\s+$/, "");
    return act ? { act, index: clause.length - m[2].length } : null;
  }
  return null;
}

// rules-v20, by sentence structure (no lists of ambiguous words):
// Teaching or training others to do it: "I teach new hires how to operate a forklift". Not the person's own execution.
const TEACH_VERB = /^(?:teach|teaches|taught|teaching|train|trains|trained|training|show|shows|showed|showing|instruct|instructs|instructed|instructing|coach|coaches|coached|coaching|mentor|mentors|mentored|mentoring)$/;
// Learning, intending, wishing or planning to do it: work not done. Same treatment as today's hypotheticals.
const INTENT = /\b(?:learning\s+(?:how\s+)?to|learn\s+(?:how\s+)?to|need\s+to\s+learn|have\s+to\s+learn|hate\s+to|studying\s+(?:to|for)|training\s+to\s+(?:become|be)\b|would\s+like\s+to|wish\s+(?:i|to)|aspir\w*\s+to|i['’]ll\s+\p{L}+|i\s+will\s+\p{L}+|once\s+i\s+(?:finish|start|get|complete|pass)|when\s+i\s+(?:finish|start|get|complete|pass)\s+my)\b/iu;
// Personal, not occupational, context: "for my own guitar practice", "on my own vegetable garden", "for my family vacation".
// "My own" counts only as a beneficiary or place ("for/on/with my own …"): "write my own quizzes" is the person doing it.
// "My own" has to head a noun phrase. The idiom "on my own" (by myself) is followed by a function word, an adverb, a number
// or nothing ("on my own every shift", "on my own with 12 people", "on my own."), and "with my own hands" or "on my own
// initiative" says the person did it: none of those is personal context.
const PERSONAL = /\b(?:for|on|with|at|in)\s+my\s+own\s+(?!practice\b)(?!(?:every|each|all|most|many|several|some|any|no|a|an|the|this|that|these|those|and|or|but|nor|so|yet|as|because|since|while|when|whenever|until|after|before|during|for|from|in|into|on|onto|at|to|by|with|without|through|throughout|under|over|across|around|about|per|like|than|then|now|today|again|too|also|there|here|once|twice|mostly|initiative|authority|accord|hands|two|entirely|completely|independently|alone|usually|regularly|daily|weekly|monthly|nightly|largely)\b)(?!(?:[\p{L}-]+\s+){0,2}(?:business|company|shop|clients?|customers?|crews?|teams?|firm|caseload|accounts?|route|store|restaurant|patients?|students?|classroom|salon|clinic|office|farm)\b)\p{L}+|\b(?:for|on|in)\s+(?:my|our)\s+(?:family|kids|wedding|vacation|honeymoon|road\s+trip|garage\s+sale|hobby|house|home|apartment|record\s+collection|personal\s+use|own\s+use)\b|\bas\s+a\s+hobby\b|\bfor\s+fun\b|\bfor\s+myself\b|\bin\s+my\s+spare\s+time\b|\bpersonal\s+project\b|\bas\s+a\s+patient\b/iu;
// What the person's clause names as someone else's purpose, or someone else's finished work, isn't the person's act:
// "the books people use to read blueprints", "the hangers used to hang ductwork", "the contracts the attorneys drafted".
const PURPOSE_OF_OTHERS = /,?\s*\b(?:that|which)?\s*(?:people|others|customers|clients|users|staff|workers|technicians|students|employees|someone|they|crews?|teams?)\s+(?:use|used|uses|need|needs)\s+to\s+[^,.;]*/giu;
const USED_FOR = /(?<!\b(?:i|we)\s)(?<!\b(?:i|we)\s\p{L}+\s)\b(?:used|needed|meant|designed)\s+(?:to|for)\s+[^,.;]*/giu;
const FOR_OTHERS_TO = /\b(?:for|so\s+(?:that\s+)?)\s*(?:people|others|customers|clients|users|staff|workers|technicians|students|employees|them|crews?)\s+(?:to|can|could)\s+[^,.;]*/giu;
// Other people as the doers of a past act: an agent noun ("attorneys", "pickers", "analysts") or a group ("the sales team").
const AGENTS = "(?:[\\p{L}-]+(?:ers|ors|ists|ants|ians|eys)|teams?|crews?|staff|department|office|doctors?|nurses?|managers?|clients?|customers?|patients?|students?|parents|vendors?|contractors?|people|attorneys?|associates|reps|techs|analysts|clerks)";
const PAST_ACT = "(?:\\p{L}+ed|wrote|made|drew|built|kept|held|did|gave|sent|ran|took|brought|bought|sold|chose|set|cut|put|left)";
// "Got her signers added", "had the vendors paid": after a causative verb the person is the one who brought it about, so
// the agent that follows isn't someone else who finished the work.
const CAUSATIVE = "(?:got|get|gets|getting|gotten|had|have|has|having|make|makes|made|making|let|lets|letting)";
const OTHERS_FINISHED = new RegExp(`(?<=\\p{L}{3})(?<!\\b${CAUSATIVE})\\s+(?:that\\s+|which\\s+)?(?:the|our|my|their|his|her)\\s+(?:[\\p{L}-]+\\s+)?${AGENTS}\\s+${PAST_ACT}\\b[^,.;]*`, "giu");
// Paperwork for others (O2): collecting, sending, filing or printing something for or to another party.
const PAPERWORK_VERB = /^(?:collect|collects|collected|collecting|send|sends|sent|sending|forward|forwards|forwarded|submit|submits|submitted|deliver|delivers|delivered|file|files|filed|filing|print|prints|printed|printing|copy|copies|copied|scan|scans|scanned|distribute|distributes|distributed|mail|mails|mailed|fax|faxes|faxed|upload|uploads|uploaded)$/;
// The other party has to follow the paperwork verb closely: "send them to the payroll company", "filed the lesson plans for
// the teachers". A party named later in the sentence belongs to some other act.
const FOR_ANOTHER_PARTY = new RegExp(`^\\p{L}+(?:\\s+[\\p{L}'’-]+){0,6}?\\s+(?:for|to)\\s+(?:the|our|my|their|his|her|each|a|an)\\s+(?:[\\p{L}-]+\\s+)?(?:${AGENTS}|company|firm|office|agency|pharmacy|bank|department)\\b`, "iu");
/** Where filing, submitting or sending is itself the work asked for, doing it for someone is doing the work. */
export const PAPERWORK_ASKED = /\b(?:fil(?:e|es|ed|ing)|submit\w*|print\w*|mail\w*|scan\w*|send\w*|deliver\w*|distribut\w*|collect\w*|upload\w*|fax\w*|cop(?:y|ies|ying))\b/i;
// Paying documents isn't hiring a firm: "paid vendor invoices" is accounts payable work (a B1 recognition gap).
const PAYS_DOCUMENTS = /\b(paid|pay|pays|paying|processed|process|processes|processing)\s+(?:vendor|supplier|contractor)\s+(?=(?:invoices?|bills?|statements?|payments?)\b)/giu;
// "Passed medications" is administering them on a nursing unit, not handing something over (a B2 recognition gap).
const PASSED_MEDS = /\bpass(?:ed|es|ing)?\s+(?:meds|medications?|medicines?)\b/i;

/** rules-v20: the text speaks of learning, intending or planning to do it, not of having done it. */
export const statesIntent = (text: string) => INTENT.test(text) || HYPOTHETICAL.test(text);

/** rules-v20: paperwork done for another party, read from the person's main verb onward. */
function paperworkForOthers(clause: string): boolean {
  const verb = headVerb(clause)?.verb ?? "";
  if (!PAPERWORK_VERB.test(verb)) return false;
  const at = clause.toLowerCase().search(new RegExp(`\\b${verb}\\b`));
  return at >= 0 && FOR_ANOTHER_PARTY.test(clause.slice(at));
}

/** rules-v20: the clause with others' purposes and finished work taken out, so only the person's own act is read. */
const withoutOthersWork = (readable: string) => readable.replace(PURPOSE_OF_OTHERS, " ").replace(FOR_OTHERS_TO, " ").replace(USED_FOR, " ").replace(OTHERS_FINISHED, " ").replace(/\s{2,}/g, " ").trim();

// rules-v21 (F2): someone else's present-tense work inside the person's clause, with no "that": "the spec Kevin designs",
// "the campaigns the agency plans", "systems another crew installed", "the forecasts my analysts prepare".
const AGENT_ONE = "(?:[\\p{L}-]+(?:er|or|ist|ant|ian)|team|crew|staff|department|office|agency|firm|company|vendor|contractor|manager|owner|doctor|nurse|tech|analyst|clerk|attorney|accountant|controller|lead)";
const AGENT_MANY = `(?:${AGENTS}|agencies|firms|companies)`;
const DETERMINER = "(?:the|our|my|their|his|her|another|a|an)";
// Only right after a noun phrase the person acts on ("the spec Kevin designs", "camera systems another crew installed"),
// never right after the person's own verb ("pay our vendor invoices", "write our foundation grant proposals").
const AFTER_NOUN_PHRASE = String.raw`(?<=(?:\b(?:the|a|an|our|my|their|these|those|this|that|his|her)\s+(?:[\p{L}-]+\s+){0,3}?[\p{L}-]{3,}|\b\p{L}{3,}s))`;
const OTHERS_DOING = new RegExp(
  `${AFTER_NOUN_PHRASE}(?<!\\b${CAUSATIVE})\\s+(?:that\\s+|which\\s+)?${DETERMINER}\\s+(?:[\\p{L}-]+\\s+)?(?:${AGENT_ONE}\\s+\\p{Ll}{2,}(?:s|es)|${AGENT_MANY}\\s+(?!(?:and|or|for|to|in|on|at|of|with|from|by|the|a|an|who|that|myself|ourselves|himself|herself|themselves|itself|yourself|personally|directly|every|each|daily|weekly|monthly|yearly|too|also|here|there|now|today|first|last)\\b)\\p{Ll}{3,}|(?:${AGENT_ONE}|${AGENT_MANY})\\s+${PAST_ACT})\\b[^,.;]*`,
  "gu",
);
// A first name doing it: "the spec Kevin designs". Never a known technology or product ("Excel models", "Salesforce reports"),
// never a word right after a determiner or count ("our Haas lathes", "a dozen Java services": a brand before a plural noun),
// and only when what follows reads as a verb's object or the clause ends ("Kevin designs the API", "the spec Kevin wrote").
const NAME_DOING = new RegExp(
  String.raw`${AFTER_NOUN_PHRASE}\s+(?:that\s+)?(?<!\p{Lu}[\p{L}-]*\s+)(?<!\b(?:the|a|an|our|my|their|these|those|this|his|her|its|dozen|several|few|many|some|all|both|two|three|four|five|six|ten)\s+)(\p{Lu}\p{Ll}+)\s+\p{Ll}{2,}(?:s|es|ed)\b(?=\s*(?:[,.;]|$)|\s+(?:the|a|an|our|my|his|her|their|its|it|them|this|these|those|each|every|all|\d))[^,.;]*`,
  "gu",
);
const withoutNamedOthersWork = (text: string) => text.replace(NAME_DOING, (m, name: string) => (VOCABULARY.has(name.toLowerCase()) || /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|english|spanish)$/i.test(name) ? m : " "));
// rules-v21 (F2): "send plumbers out to install", "ask the techs to restock": the people sent do the work after "to".
const SEND_TO = /\b(?:send|sends|sent|ask|asks|asked|tell|tells|told|get|gets|got|have|has|had)\s+(?:[\p{L}-]+\s+){1,3}?(?:out\s+)?to\s+(?!(?:the|a|an|our|my|their|his|her|each|every|all|\d)\b)\p{L}+[^,.;]*/giu;
/** rules-v21: the readable clause, with others' present-tense work and sent work taken out, and the person's own objects
 * and indirect questions kept (F9). */
const withoutOthersWorkV21 = (readable: string) => withoutNamedOthersWork(withoutOthersWork(readable).replace(OTHERS_DOING, " ").replace(SEND_TO, " ")).replace(/\s{2,}/g, " ").trim();

// rules-v21 (F7): supervising the people who do it, or reviewing what they prepare in the present tense, is overseeing.
const SUPERVISES_WHO = /^\W*(?:(?:well|so|mostly|now)\W+)?(?:i\s+)?(?:[\p{L}'’]+\s+)?(?:manage|manages|managed|supervise|supervises|supervised|coach|coaches|coached|oversee|oversees|oversaw|lead|leads|led|direct|directs|directed|run|runs|ran|train|trains|trained)\s+(?:the|our|my|a|an|two|three|four|five|\d+)?\s*(?:[\p{L}-]+\s+){0,3}?(?:who|that)\s+\p{Ll}+/iu;
// F7 applies only to real review verbs, and only to what comes after the person's verb ("I walk through the spill kit"
// and "my students get goggles, I …" aren't reviewing others' work).
const REVIEWS = /^(?:review|reviews|reviewed|check|checks|checked|spot-check|spot-checks|spot-checked|audit|audits|audited|inspect|inspects|inspected|verify|verifies|verified|approve|approves|approved|proofread|proofreads|edit|edits|edited)$/;
const afterHeadVerb = (clause: string) => {
  const verb = headVerb(clause)?.verb;
  if (!verb) return "";
  const at = clause.toLowerCase().search(new RegExp(`\\b${verb}\\b`));
  return at < 0 ? "" : clause.slice(at);
};
// rules-v21 (F8): being assigned to a station, line or route says where the person works, not that they assign others.
const ASSIGNED_TO = /\b(i['’]m|i\s+am|i\s+was|i['’]ve\s+been|i\s+have\s+been|i\s+got|i\s+get|i\s+usually\s+get)\s+assigned\s+to\b/giu;
// rules-v21 (F4): the person narrows their own claim: "I only measure the residential rooms", "I just count".
const NARROWS = /\b(?:i\s+(?:only|just)\b|not\s+all\s+of\s+(?:them|it)\b|except\b)/i;

/** rules-v20: the person teaches or trains someone else to do it ("I train new hires to read blueprints"). Training
 * themselves ("I trained to be a welder", "I trained as an electrician") is learning, read by the intent rule instead. */
export function teachesOthers(text: string): boolean {
  const head = headVerb(text);
  if (!head || !TEACH_VERB.test(head.verb)) return false;
  const { after } = head;
  if (/^(?:to|as|for|on|in|at|with|under)$/.test(after[0] ?? "")) return false;
  const to = after.indexOf("to");
  return to > 0 && to <= 6;
}

export type Statement = {
  text: string;
  start: number;
  /** "self": I, or a sentence that opens on what was done. "team": we. "unclear": neither. */
  subject: "self" | "team" | "unclear";
  /** What it says about the doing. "worked" only counts beside the thing's own name. */
  act: "concrete" | "worked" | "says_little";
  /** Trying or watching, which is never the same as doing. */
  exposureOnly: boolean;
  /** The text without what it says about others. Read this, and quote `text`. */
  readable: string;
  /** Part of an answer about a class, demo, tutorial, or trial: limited familiarity at most. */
  brief?: boolean;
  ownership: Ownership;
  /** rules-v20: paperwork done for another party (O2). It still counts where that paperwork is what's asked. */
  paperwork?: boolean;
  /** rules-v21 (F4): the person narrowed their own claim after a correction. Genuine within its scope: Possible at most. */
  narrowed?: boolean;
  /** rules-v21: `readable` with the person's own act's end condition kept ("call those customers until they pay"), only
   * where one was set aside. What follows "until" is the other people's act, never the person's work: no verdict reads
   * this. It is for a recognition layer that matches an approved phrase naming that condition. */
  bounded?: string;
};

/** Where a word sits as a verb: after the person, a helper word, a joiner, or a comma. "I help the PTs" is helping;
 * "the help desk" and "new hire training" aren't. */
const VERB_POSITION = /(?:^|[,;:]|\b(?:i|we|and|or|then|also|to|just|usually|always|often|sometimes|personally|mostly|mainly|really|actually|even|i['’](?:ve|d|m)|have|has|had|been|will|would|can|could)\s*)\s*$/i;
const atVerbPosition = (pattern: RegExp, text: string) => {
  for (const m of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) if (VERB_POSITION.test(text.slice(0, m.index))) return true;
  return false;
};
/** People and the units they make up, as the object of running, leading, or managing. */
const PEOPLE = /^(?:team|teams|crew|crews|staff|people|employees|workers|techs?|technicians|drivers|cleaners|instructors|teachers|nurses|volunteers|vendors?|contractors?|pickers|operators|installers|agents|reps|associates|guards|servers|cooks|aides|interns|tutors|coaches|lifeguards|apprentices|laborers|labourers|movers|painters|stylists|cashiers|shifts?|group|groups)$/;
const UNIT = /^(?:program|programs|programme|department|departments|operation|operations|office|offices|shop|unit|units|division|business|site|sites|store|stores|facility|facilities|building|buildings|property|properties|location|locations|branch|branches|warehouse|portfolio|contract|contracts)$/;
const OBSERVES = new Set("watch watched watches watching observe observed observes observing shadow shadowed shadows shadowing".split(" "));
const OBSERVER_ROLE = /^(?:note-?taker|notetaker|scribe|observer|shadow|witness|onlooker)$/;
/** Asking someone else to do it: a ticket, a call, a request. */
const PROVIDER = /^(?:them|him|her|it|the|our|a|an|in|out|ahead)$/;

/** The person's main verb and the words after it, with the person and helper words taken off. */
function headVerb(text: string): { verb: string; after: string[] } | null {
  const sentence = text.replace(/^\W*(?:(?:i\s+mean|well|actually|honestly|to\s+be\s+honest|okay|ok|yes|yeah|yep)\b[,\s]*)+/i, "");
  const first = sentence.match(FIRST_PERSON);
  const tokens = ((first ? first[3] : sentence).toLowerCase().match(/[\p{L}'’-]+/gu) ?? []);
  let at = 0;
  while (at < tokens.length && AUXILIARY.has(tokens[at]) && !BE.has(tokens[at])) at++;
  // "I'm the one who troubleshoots them": the doing is after "the one".
  if (tokens[at] === "the" && tokens[at + 1] === "one") at += /^(?:who|that)$/.test(tokens[at + 2] ?? "") ? 3 : 2;
  return tokens[at] ? { verb: tokens[at], after: tokens.slice(at + 1, at + 8) } : null;
}
const objectHead = (after: string[]) => after.find(w => !/^(?:the|a|an|our|my|all|every|each|both|two|three|four|five|six|seven|eight|nine|ten|twelve|several|\d+|of|for|at|in|on|new|night|day|whole|entire|local)$/.test(w)) ?? "";
/** The object, up to the first word that says who it's for or where: "payroll for 40 people" is payroll. */
const objectWords = (after: string[]) => {
  const stop = after.findIndex(w => /^(?:for|at|in|on|with|to|from|across|around|during|after|before|when|while|so|because|by)$/.test(w));
  return after.slice(0, stop < 0 ? 5 : Math.min(stop, 5));
};

/** Past forms to their base, so "I built it" meets "builds". */
const BASE: Record<string, string> = { built: "build", ran: "run", did: "do", done: "do", made: "make", wrote: "write", written: "write", led: "lead", kept: "keep", took: "take", drove: "drive", sold: "sell", taught: "teach", held: "hold", sent: "send", gave: "give", found: "find", got: "get", went: "go", brought: "bring", bought: "buy", caught: "catch", fought: "fight", spun: "spin", swept: "sweep", laid: "lay", paid: "pay", met: "meet", read: "read", rode: "ride", drew: "draw", dug: "dig", hung: "hang", wove: "weave", struck: "strike", threw: "throw", picked: "pick" };
export const verbBase = (word: string) => BASE[word] ?? word.replace(/(?:ies)$/, "y").replace(/(?:ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1").replace(/e$/, "");
const FIRST_FINITE = /^(?:is|are|was|were|has|have|had|does|do|did|can|could|will|would)$/;
/** The main verb of a clause and the first word of its object, whoever the subject is: "the regional finance guy builds
 * the forecast" gives build and forecast; "I don't pick much myself" gives pick. */
export function verbAndObject(text: string): { verb: string; object: string } | null {
  const first = text.match(FIRST_PERSON);
  if (first) {
    const head = headVerb(text);
    if (!head) return null;
    let { verb, after } = head;
    // "don't pick", "didn't do the scanning": the verb after the negative.
    while ((/^(?:don['’]t|doesn['’]t|didn['’]t|haven['’]t|hasn['’]t|hadn['’]t|wasn['’]t|weren['’]t|isn['’]t|aren['’]t|not|never|really|ever|have|has|had)$/.test(verb) || (/^(?:do|does|did)$/.test(verb) && /^(?:not|never|n['’]t)$/.test(after[0] ?? ""))) && after.length) [verb, ...after] = after;
    return { verb: verbBase(verb), object: objectHead(after) };
  }
  const tokens = text.toLowerCase().match(/[\p{L}'’-]+/gu) ?? [];
  // A regular form first: in "our wound nurse does", "wound" is part of the name.
  for (const irregular of [false, true]) {
    for (let i = 1; i < Math.min(tokens.length, 10); i++) {
      const w = tokens[i];
      // A word right before a verb is the subject: "the mechanics do the engine work".
      if (FIRST_FINITE.test(tokens[i + 1] ?? "") || WORK_VERB_WORDS.has(tokens[i + 1] ?? "")) continue;
      if (irregular ? IRREGULAR_PAST.has(w) : FIRST_FINITE.test(w) || /^\p{Ll}{2,}(?:ed|[^su\W]s|es)$/u.test(w)) return { verb: verbBase(w), object: objectHead(tokens.slice(i + 1, i + 8)) };
    }
  }
  return null;
}

/** Checking someone's work. When the answer says others do the asked work, this is overseeing it. Alone, "I check the
 * oil" is doing it. */
const CHECKS = /^(?:check|checks|checked|checking|spot-check|spot-checks|spot-checked|inspect|inspects|inspected|review|reviews|reviewed|verify|verifies|verified|audit|audits|audited|monitor|monitors|monitored|test|tests|tested|taste|tastes|tasted|sample|samples|sampled|walk|walks|walked)$/;
export const checksOthersWork = (text: string) => CHECKS.test(headVerb(text)?.verb ?? "");

/** What the person's part was, read from the main verb and its object, then from phrases at a verb's position. */
export function involvement(text: string): Ownership {
  const head = headVerb(text);
  if (head) {
    const { verb, after } = head;
    const object = objectHead(after);
    const near = objectWords(after);
    if (OBSERVES.has(verb) || (/^(?:sat|sit|sits)$/.test(verb) && after[0] === "in") || (/^(?:took|take|takes)$/.test(verb) && near.includes("notes"))) return "observed";
    if (BE.has(verb) && near.some(w => OBSERVER_ROLE.test(w))) return "observed";
    if (/^(?:request|requests|requested|requesting)$/.test(verb)) return "requested";
    if (/^(?:submit|submits|submitted|contact|contacts|contacted|email|emails|emailed)$/.test(verb) && near.some(w => /^(?:tickets?|requests?|vendors?|contractors?|providers?|landlord|manufacturer|company|firm|support|helpdesk|help-desk)$/.test(w))) return "requested";
    if (/^(?:put|puts|open|opens|opened|log|logs|logged|file|files|filed)$/.test(verb) && /^(?:in|a|an|the)$/.test(after[0] ?? "") && after.slice(0, 5).some(w => /^(?:tickets?|requests?|work)$/.test(w))) return "requested";
    if (/^(?:call|calls|called|calling|phone|phones|phoned|ring|rang)$/.test(verb) && PROVIDER.test(after[0] ?? "") && !near.some(w => /^(?:customers?|patients?|clients?|families|parents|guests?|members?|residents?|tenants?)$/.test(w))) return "requested";
    if (/^(?:book|books|booked|order|orders|ordered)$/.test(verb) && near.some(w => /^(?:service|repair|repairs|technician|tech|contractor|plumber|electrician|exterminator|visit|pickup|crew)$/.test(w))) return "requested";
    if (/^(?:reach|reached|reaches)$/.test(verb) && after[0] === "out") return "requested";
    if (/^(?:make|makes|made|making)$/.test(verb) && after[0] === "sure") return "oversaw";
    if (/^(?:make|makes|made|making|do|does|did|write|writes|wrote|build|builds|built|set|sets)$/.test(verb) && near.some(w => /^(?:assignments?|schedules?|rotas?|rosters?)$/.test(w))) return "oversaw";
    if (/^(?:ensure|ensures|ensured)$/.test(verb)) return "oversaw";
    if (/^(?:manage|manages|managed|managing)$/.test(verb) && (/ing$/.test(object) || near.some(w => PEOPLE.test(w) || UNIT.test(w)))) return "oversaw";
    if (/^(?:run|runs|ran|running)$/.test(verb) && near.slice(0, 4).some(w => PEOPLE.test(w) || UNIT.test(w))) return "oversaw";
    if (/^(?:lead|leads|led|leading)$/.test(verb) && (PEOPLE.test(object) || near.some(w => PEOPLE.test(w)))) return "oversaw";
  }
  if (atVerbPosition(OVERSAW, text)) return "oversaw";
  if (atVerbPosition(ASSISTED, text)) return "assisted";
  return "performed";
}

function readAct(raw: string): { subject: Statement["subject"]; act: Statement["act"] } {
  const sentence = raw.replace(/^\W*(?:(?:i\s+mean|well|actually|honestly|to\s+be\s+honest|okay|ok|yes|yeah|yep)\b[,\s]*)+/i, "");
  const first = sentence.match(FIRST_PERSON);
  const tokens = (first ? first[3] : sentence).toLowerCase().match(/\p{L}+/gu) ?? [];
  if (!first) {
    // "Just stapling the dust cover back on": a word like "just" before the doing. "Anything" and "morning" aren't doing.
    const head = (/^(?:just|only|mostly|usually|mainly|also|basically|really)$/.test(tokens[0] ?? "") ? tokens[1] : tokens[0]) ?? "";
    if (/^(?:anything|something|nothing|everything|thing|morning|evening|building|ceiling|during|spring|string|sibling|wedding|clothing|ring|king|wing)$/.test(head)) return { subject: "unclear", act: "concrete" };
    if (WORKED.has(head)) return { subject: "self", act: "worked" };
    if (SAYS_LITTLE.has(head)) return { subject: "self", act: "says_little" };
    if (WORK_VERB_WORDS.has(head) || IRREGULAR_PAST.has(head) || /(?:ed|ing)$/.test(head)) return { subject: "self", act: "concrete" };
    // "Excel is a real strength" describes the thing, not any work on it. "Solid Excel background" says less.
    if (tokens.slice(1, 5).some(t => BE.has(t)) || /\b(?:experience|background|familiarity|knowledge)\b/i.test(sentence)) return { subject: "unclear", act: "says_little" };
    return { subject: "unclear", act: "concrete" };
  }
  const subject = first[1].toLowerCase() === "i" ? "self" : "team";
  if (subject === "team" && FRAMING.test(sentence)) {
    const own = /(?:^|[^\p{L}'’])(i(?:['’](?:ve|m|d|ll))?\s.+)$/iu.exec(sentence.slice((first.index ?? 0) + 2));
    if (own) return readAct(own[1]);
  }
  if (OWNS_IT.test(first[3])) return { subject, act: "concrete" };
  // "I'm the one on the kickoff call, loading their data": saying who does it, with the doing beside it.
  if (/^(?:['’]m|\s*am)?\s*the\s+one\b/i.test(`${first[2] ? "'" + first[2] : ""}${first[3]}`) && /\b\p{Ll}+ing\b/u.test(first[3])) return { subject, act: "concrete" };
  let be = first[2]?.toLowerCase() === "m";
  let at = 0;
  while (at < tokens.length && AUXILIARY.has(tokens[at])) {
    if (BE.has(tokens[at])) be = true;
    at++;
  }
  // "I do payroll" is a claim about the work. "I do know payroll" isn't.
  const verb = tokens[at] ?? "";
  if ((verb === "went" || verb === "go" || verb === "goes") && tokens[at + 1] === "through") return { subject, act: "concrete" };
  if (["do", "does", "did"].includes(verb)) return { subject, act: SAYS_LITTLE.has(tokens[at + 1] ?? "") && !["the", "a", "an", "our", "my", "all"].includes(tokens[at + 1] ?? "") ? "says_little" : "concrete" };
  if (WORKED.has(verb)) return { subject, act: "worked" };
  // "I've done some MIG tack welds", "I get three quotes": done or gotten things, counted, is doing them. A course isn't.
  if ((verb === "done" && /^(?:some|hundreds|dozens|\d+|two|three|four|five|six|several|many|few)$/.test(tokens[at + 1] ?? "") || /^(?:get|gets|got)$/.test(verb) && /^(?:\d+|two|three|four|five|six|several|multiple|few)$/.test(tokens[at + 1] ?? "")) && !/\b(?:course|class|workshop|training|tutorial|webinar|seminar|research|reading|bootcamp|certificate|certification|license|licence)\b/i.test(first[3])) return { subject, act: "concrete" };
  // "I went to a demo day where I flew their drone": what the person did is later in the sentence.
  if (SAYS_LITTLE.has(verb) || !verb) {
    const later = /\b(?:where|and|then|so)\s+(i\s+.+)$/i.exec(first[3]);
    if (later && readAct(later[1]).act === "concrete") return { subject, act: "concrete" };
    return { subject, act: "says_little" };
  }
  if (be && !/(?:ing|ed)$/.test(verb)) return { subject, act: "says_little" };
  return { subject, act: "concrete" };
}

/** Sentences of an answer that are plainly this person's own statement of having done something. Nothing
 * comes back unless the whole answer is plainly English: other answers stay unresolved. */
export function answerStatements(detail: string, rules: TextRules = DEFAULT_TEXT_RULES): Statement[] {
  const v22 = rules === "v22";
  const v21 = rules === "v21" || rules === "v21a" || v22;
  const v20 = rules === "v20" || v21;
  const readableOf = (text: string) => (v21 ? withoutOthersWorkV21(ownClauses(text, true)) : v20 ? withoutOthersWork(ownClauses(text)) : ownClauses(text));
  const boundsOf = (text: string): { bounded?: string } => {
    if (!v21) return {};
    const bounded = withoutOthersWorkV21(ownClauses(text, true, true));
    return bounded !== readableOf(text) ? { bounded } : {};
  };
  const ownershipOf = (raw: string): Ownership => {
    if (!v20) return involvement(raw);
    // F8: "I'm assigned to the trailers" is where the person works.
    const clause = v21 ? raw.replace(ASSIGNED_TO, "$1 working at") : raw;
    if (PASSED_MEDS.test(clause)) return "performed";
    if (teachesOthers(clause)) return "taught";
    // Reviewing or checking what others finished is overseeing it: "I reviewed the lesson plans our teachers prepared".
    if (checksOthersWork(clause) && new RegExp(OTHERS_FINISHED.source, "iu").test(clause)) return "oversaw";
    // F7: the same in the present tense, and supervising the people who do it.
    if (v21 && REVIEWS.test(headVerb(clause)?.verb ?? "") && new RegExp(OTHERS_DOING.source, "u").test(afterHeadVerb(clause))) return "oversaw";
    if (v21 && SUPERVISES_WHO.test(clause)) return "oversaw";
    // Paperwork for another party (O2): "I collect timesheets and send them to the payroll company".
    if (paperworkForOthers(clause)) return "requested";
    return involvement(clause);
  };
  const personal = (whole: string) => v20 && PERSONAL.test(whole);
  // An answer with an instruction in it gets no credit at all, however good the rest looks.
  if (answerLanguage(detail) !== "en" || hasDirectedText(detail)) return [];
  // A brief try colours everything said beside it: "Clicked around for an evening. Drew a box or two."
  // An answer that takes itself back: "Yes, I weld all the time. Well, I mostly tack things up."
  // What the answer takes back is out; everything else is read. The word before a hand-off verb has to be someone:
  // "...and run them on the analyzer" is still the person.
  // "v21a": an explicit correction the v21 retractions miss ("Actually, that was my partner") withdraws the corrected claim too.
  const taken = [...retractions(detail, v21), ...(rules === "v21a" ? withdrawnClaims(detail).map(w => w.claim) : [])];
  // F4: after a correction, the person's narrowed claim stays theirs, within its scope (Possible at most).
  const narrowedIn = (whole: string) => v21 && taken.length > 0 && NARROWS.test(whole);
  if (/\bgave\s+up\b|\bquit\s+(?:before|after|halfway|partway)\b|\b(?:not|wasn['’]t|isn['’]t)\s+for\s+me\b|\bstopped\s+(?:there|before|after|at\s+that)\b|\bhired\s+someone\b|\bnever\s+(?:used|touched|opened)\s+it\s+again\b/i.test(detail)) return [];
  // A class, demo, tutorial, or trial is limited familiarity: everything said beside it is read as that, and no more.
  const brief = BRIEF_TRY.test(detail);
  const barred = [...untrustedSpans(detail, "answer", v21), ...taken];
  const out: Statement[] = [];
  const leading: Statement[] = [];
  // Each sentence is read clause by clause where it changes hands: another person's clause is theirs, never the person's.
  // F4 (v21): "…, I only fix flats" / "…, and I only measure the residential rooms" starts the person's own narrowed clause,
  // so it's read on its own and isn't lost with the correction or the other person's clause before it.
  const clausesOf = (sentence: string) => {
    const clauses = splitBySubject(sentence);
    if (!v21) return clauses;
    return clauses.flatMap(c => {
      if (c.subject === "other") return [c];
      const pieces: typeof clauses = [];
      let from = 0;
      for (const cut of c.text.matchAll(/,\s*(?:and\s+|but\s+)?(?=i\s+(?:only|just)\b)/gi)) {
        pieces.push({ ...c, text: c.text.slice(from, cut.index), start: c.start + from });
        from = cut.index + cut[0].length;
      }
      pieces.push({ ...c, text: c.text.slice(from), start: c.start + from, subject: from > 0 ? "self" : c.subject });
      return pieces.filter(p => p.text.trim());
    });
  };
  for (const match of detail.matchAll(/(?:[^.!?;\n]|\.(?=\d))+/g)) for (const clause of clausesOf(match[0])) {
    // rules-v22 (F0): "My boss sends me out to install …": the act after "to" is the person's own, read as "I <act>" by every
    // rule below (negation, intention, helping, watching, overseeing, others' work). The quote is the answer's own words.
    const directed = v22 ? directedAtPerson(clause.text) : null;
    if (directed) {
      const whole = clause.text.trim();
      const act = directed.act;
      const start = match.index + clause.start + directed.index;
      const end = start + act.length;
      const asOwn = `I ${act}`;
      if (barred.some(([s, e]) => s < end && start < e)) continue;
      if (ownNegative(asOwn) || HYPOTHETICAL.test(ownClauses(asOwn).replace(WHAT_I_CAN, " ")) || NOT_DOING.test(asOwn) || notAStatement(asOwn) || keywordDump(act) || labelledList(act) || INTENT.test(ownClauses(asOwn))) continue;
      if (someoneElsesWork(asOwn, asOwn)) continue;
      const firstClause = asOwn.split(/,\s*(?:and|then|but)\s+/i)[0];
      const narrowed = narrowedIn(whole);
      out.push({ text: act, start, ...readAct(asOwn), exposureOnly: brief || EXPOSURE.test(whole) || LIMITED.test(whole) || personal(whole) || narrowed, brief, readable: readableOf(asOwn), ...boundsOf(asOwn), ownership: ownershipOf(firstClause), ...(paperworkForOthers(firstClause) ? { paperwork: true } : {}), ...(narrowed ? { narrowed: true } : {}) });
      continue;
    }
    if (clause.subject === "other") continue;
    const whole = clause.text.trim();
    const wholeStart = match.index + clause.start + clause.text.indexOf(whole);
    if (HANDED_OFF.test(whole) || DONE_ELSEWHERE.test(v20 ? whole.replace(PAYS_DOCUMENTS, "$1 ") : whole) || opensOnNamedOther(whole, true) || (!SUBJECT_AT.test(whole) && SOMEONE_ELSE_MIDWAY.test(whole))) continue;
    const span = ownSpan(whole, true);
    if (!span) continue;
    // "Property claims keep the office busy, and I've picked up a good sense of it": the part naming the
    // thing isn't the part saying what was done. Only the clause with the person in it counts.
    const own = whole.slice(span[0]);
    const subject = SUBJECT_AT.exec(own);
    // A short opening with no "the" or "a" sets the scene, like "Mondays" or "Most nights". "Marcy and I" doesn't.
    const before = own.slice(0, subject ? subject.index + 1 : 0).trim();
    const scene = /^[\p{L}'’-]+(?:\s+[\p{L}'’-]+)?$/u.test(before) && !/^(?:a|an|the|our|my|their|his|her|its|this|that)\b/i.test(before) && !/\band$/i.test(before);
    if (subject && subject.index > 0 && !FRAMING.test(own) && !scene) {
      // "A contractor we hired did the move": the "we" here belongs to the contractor's description. Only
      // a clause of the person's own, set apart, can stand by itself.
      if (!/(?:[,;:]\s*(?:and\s+|so\s+|then\s+|but\s+)?|\b(?:and|so|then|but)\s+)$/i.test(own.slice(0, subject.index + 1))) continue;
      // "Spun up a test bucket with Terraform, then we stuck with CloudFormation": the opening is the person's own too.
      const opening = own.slice(0, subject.index + 1).replace(/(?:[,;:]\s*(?:and|so|then|but)?|\s+(?:and|so|then|but))\s*$/i, "").trim();
      if (opening && /^\W*(?!\p{L}+ing\b)\p{L}/u.test(opening) && readAct(opening).subject === "self" && readAct(opening).act === "concrete" && !/\b(?:is|are|was|were|be|been)\b/i.test(opening) && !ownNegative(opening) && !HYPOTHETICAL.test(opening)) {
        const at = wholeStart + whole.indexOf(opening, span[0]);
        if (!barred.some(([s, e]) => s < at + opening.length && at < e) && !(v20 && INTENT.test(opening))) leading.push({ text: opening, start: at, ...readAct(opening), exposureOnly: brief || EXPOSURE.test(whole) || personal(whole), brief, readable: readableOf(opening), ...boundsOf(opening), ownership: ownershipOf(opening) });
      }
      span[0] += subject.index + subject[0].search(/\p{L}/u);
    }
    const text = whole.slice(span[0], span[1]).trim();
    const start = wholeStart + whole.indexOf(text, span[0]);
    const end = start + text.length;
    if (text.length < 3 || barred.some(([s, e]) => s < end && start < e)) continue;
    if (ownNegative(whole) || HYPOTHETICAL.test(ownClauses(whole).replace(WHAT_I_CAN, " ")) || NOT_DOING.test(whole) || notAStatement(whole) || keywordDump(text) || labelledList(text)) continue;
    if (v20 && INTENT.test(ownClauses(whole))) continue;
    if (someoneElsesWork(text, text)) continue;
    // Judged on the first clause: "I build the screens, and I hand them to engineering" is doing the work.
    const firstClause = text.split(/,\s*(?:and|then|but)\s+/i)[0];
    const ownership: Ownership = ownershipOf(firstClause);
    const read = readAct(text);
    const narrowed = narrowedIn(whole);
    out.push({ text, start, ...read, exposureOnly: brief || EXPOSURE.test(whole) || LIMITED.test(whole) || personal(whole) || narrowed, brief, readable: readableOf(text.replace(THE_ONE_WHO, "I ")), ...boundsOf(text.replace(THE_ONE_WHO, "I ")), ownership, ...(v20 && paperworkForOthers(firstClause) ? { paperwork: true } : {}), ...(narrowed ? { narrowed: true } : {}) });
    // "We use a calm corner, and I call home early": the "I" clause is the person's own, apart from the "we".
    const mine = read.subject === "team" ? /(?:,\s*(?:and|so|then|but)\s+|\s+and\s+)(?=i\s)/i.exec(text) : null;
    if (mine) {
      const own = text.slice(mine.index + mine[0].length);
      const firstOwn = own.split(/,\s*(?:and|then|but)\s+/i)[0];
      out.push({ text: own, start: start + mine.index + mine[0].length, ...readAct(own), exposureOnly: brief || EXPOSURE.test(whole) || personal(whole), brief, readable: readableOf(own), ...boundsOf(own), ownership: ownershipOf(firstOwn) });
    }
  }
  return [...leading, ...out].sort((x, y) => x.start - y.start);
}
