import { answerLanguage } from "@/lib/ai/answer-language";
import { splitBySubject } from "@/lib/ai/clauses";
import type { Evidence } from "@/lib/ai/evidence";
import { answerUntrustedSpans, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import { notAStatement, ownClauses, ownNegative } from "@/lib/ai/rules/profile-fields";
import { HANDED_OFF, IRREGULAR_PAST, keywordDump, labelledList, opensOnNamedOther, ownSpan, someoneElsesWork, WORK_VERB_WORDS } from "@/lib/ai/skill-relations";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

// The one place text is cleared before it can count. Resume and profile text goes through the checks that
// apply to it; an answer goes through those and more, because it's written in reply to a question and could
// otherwise be shaped to fit one. An answer is never ordinary role text: the engine doesn't read it, no AI
// provider receives it (local shadow testing has its own route, and decides nothing), and it's read again from scratch on every analysis, so what was saved earlier gets
// no standing from having been saved.

export type TextOrigin = "profile" | "answer";

/** Spans of text that can never be evidence. */
export const untrustedSpans = (text: string, origin: TextOrigin) => (origin === "answer" ? answerUntrustedSpans(text) : untrustedEvidenceSpans(text));

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
/** The parts of an answer it takes back. "Yes, I teach it. Well, volunteers teach it" takes back the first sentence and
 * nothing else; the correcting words are read like any others. A marker means nothing by itself. */
export function retractions(detail: string): [number, number][] {
  const out: [number, number][] = [];
  for (const match of detail.matchAll(CORRECTION_MARKER)) {
    const markerAt = match.index + match[0].search(/\p{L}/u);
    if (!detail.slice(0, markerAt).trim() || !contradicts(match[1].trim())) continue;
    const claim = claimBefore(detail, markerAt);
    if (claim) out.push(claim);
  }
  for (const sentence of detail.matchAll(/(?:[^.!?;\n]|\.(?=\d))+/g)) {
    const hand = HANDS_THIS_OFF.exec(sentence[0]);
    if (!hand || NOT_A_DOER.has((hand[1] ?? "").toLowerCase())) continue;
    // "The month-end close, our accountant does that part" is about its own topic. "Finance handles that" is about
    // what the person just said, so that goes too.
    out.push([sentence.index, sentence.index + sentence[0].length]);
    const topic = sentence[0].slice(0, hand.index).match(/\p{L}{3,}/gu) ?? [];
    if (topic.filter(w => !/^(?:the|and|but|though|really|honestly|actually|well|that|this|all|our|their)$/i.test(w)).length < 2) {
      const claim = claimBefore(detail, sentence.index + sentence[0].search(/\S|$/));
      if (claim) out.push(claim);
    }
  }
  return out;
}
/** What an answer says someone else did, or takes back: other people's clauses and retracted claims. Never the
 * person's own work, and only ever used to hold credit back. */
export function othersText(detail: string): string {
  const parts: string[] = retractions(detail).map(([s, e]) => detail.slice(s, e));
  for (const sentence of detail.match(/(?:[^.!?;\n]|\.(?=\d))+/g) ?? []) {
    for (const clause of splitBySubject(sentence)) if (clause.subject === "other") parts.push(clause.text);
    // A whole sentence about someone else, with no "I" or "we" in it. One where the person speaks gives only the other clause.
    if (!/(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s/iu.test(sentence) && (opensOnNamedOther(sentence.trim(), true) || someoneElsesWork(sentence.trim(), sentence.trim()))) parts.push(sentence);
  }
  return parts.join(" ");
}
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
const FRAMING = /^\W*(?:over|through|throughout|across|under|per|around|near|about|when|whenever|before|after|once|if|as|at|in|on|for|during|since|while|each|every|most|all|with|by|from|to|last|this|on|weekly|daily|monthly|then|also|yes|sure|so|because)\b/i;
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
export type Ownership = "performed" | "oversaw" | "requested" | "assisted" | "observed";

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
    const head = tokens[0] ?? "";
    if (WORKED.has(head)) return { subject: "self", act: "worked" };
    if (SAYS_LITTLE.has(head)) return { subject: "self", act: "says_little" };
    if (WORK_VERB_WORDS.has(head) || IRREGULAR_PAST.has(head) || /(?:ed|ing)$/.test(head)) return { subject: "self", act: "concrete" };
    // "Excel is a real strength" describes the thing, not any work on it. "Solid Excel background" says less.
    if (tokens.slice(1, 5).some(t => BE.has(t)) || /\b(?:experience|background|familiarity|knowledge)\b/i.test(sentence)) return { subject: "unclear", act: "says_little" };
    return { subject: "unclear", act: "concrete" };
  }
  const subject = first[1].toLowerCase() === "i" ? "self" : "team";
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
export function answerStatements(detail: string): Statement[] {
  // An answer with an instruction in it gets no credit at all, however good the rest looks.
  if (answerLanguage(detail) !== "en" || hasDirectedText(detail)) return [];
  // A brief try colours everything said beside it: "Clicked around for an evening. Drew a box or two."
  // An answer that takes itself back: "Yes, I weld all the time. Well, I mostly tack things up."
  // What the answer takes back is out; everything else is read. The word before a hand-off verb has to be someone:
  // "...and run them on the analyzer" is still the person.
  const taken = retractions(detail);
  if (/\bgave\s+up\b|\bquit\s+(?:before|after|halfway|partway)\b|\b(?:not|wasn['’]t|isn['’]t)\s+for\s+me\b|\bstopped\s+(?:there|before|after|at\s+that)\b|\bhired\s+someone\b|\bnever\s+(?:used|touched|opened)\s+it\s+again\b/i.test(detail)) return [];
  // A class, demo, tutorial, or trial is limited familiarity: everything said beside it is read as that, and no more.
  const brief = BRIEF_TRY.test(detail);
  const barred = [...untrustedSpans(detail, "answer"), ...taken];
  const out: Statement[] = [];
  const leading: Statement[] = [];
  // Each sentence is read clause by clause where it changes hands: another person's clause is theirs, never the person's.
  for (const match of detail.matchAll(/(?:[^.!?;\n]|\.(?=\d))+/g)) for (const clause of splitBySubject(match[0])) {
    if (clause.subject === "other") continue;
    const whole = clause.text.trim();
    const wholeStart = match.index + clause.start + clause.text.indexOf(whole);
    if (HANDED_OFF.test(whole) || DONE_ELSEWHERE.test(whole) || opensOnNamedOther(whole, true) || (!SUBJECT_AT.test(whole) && SOMEONE_ELSE_MIDWAY.test(whole))) continue;
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
        if (!barred.some(([s, e]) => s < at + opening.length && at < e)) leading.push({ text: opening, start: at, ...readAct(opening), exposureOnly: brief || EXPOSURE.test(whole), brief, readable: ownClauses(opening), ownership: involvement(opening) });
      }
      span[0] += subject.index + subject[0].search(/\p{L}/u);
    }
    const text = whole.slice(span[0], span[1]).trim();
    const start = wholeStart + whole.indexOf(text, span[0]);
    const end = start + text.length;
    if (text.length < 3 || barred.some(([s, e]) => s < end && start < e)) continue;
    if (ownNegative(whole) || HYPOTHETICAL.test(ownClauses(whole).replace(WHAT_I_CAN, " ")) || NOT_DOING.test(whole) || notAStatement(whole) || keywordDump(text) || labelledList(text)) continue;
    if (someoneElsesWork(text, text)) continue;
    // Judged on the first clause: "I build the screens, and I hand them to engineering" is doing the work.
    const firstClause = text.split(/,\s*(?:and|then|but)\s+/i)[0];
    const ownership: Ownership = involvement(firstClause);
    const read = readAct(text);
    out.push({ text, start, ...read, exposureOnly: brief || EXPOSURE.test(whole) || LIMITED.test(whole), brief, readable: ownClauses(text.replace(THE_ONE_WHO, "I ")), ownership });
    // "We use a calm corner, and I call home early": the "I" clause is the person's own, apart from the "we".
    const mine = read.subject === "team" ? /(?:,\s*(?:and|so|then|but)\s+|\s+and\s+)(?=i\s)/i.exec(text) : null;
    if (mine) {
      const own = text.slice(mine.index + mine[0].length);
      const firstOwn = own.split(/,\s*(?:and|then|but)\s+/i)[0];
      out.push({ text: own, start: start + mine.index + mine[0].length, ...readAct(own), exposureOnly: brief || EXPOSURE.test(whole), brief, readable: ownClauses(own), ownership: involvement(firstOwn) });
    }
  }
  return [...leading, ...out].sort((x, y) => x.start - y.start);
}
