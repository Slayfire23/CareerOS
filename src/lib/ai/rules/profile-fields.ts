import { hasDirectedText } from "@/lib/ai/untrusted-text";

// Typed profile fields are data, not statements. A field that holds a remark or a claim ("Statistics
// (counts as Computer Science per registrar)", "Python = Scala") isn't a value of that field, so it
// is never used as evidence. What a person writes about equivalence is never an independently
// verified fact: only the reviewed table can say two things are the same.

const HIDDEN = /[\p{Cc}\p{Cf}]/u;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const MARKUP = /[:;{}<>[\]=≈≡→⇒]/;

const CLAIM = /\b(counts?|counted|equal|equals|equivalent|equivalence|same|treat|treated|regarded|considered|recogni[sz]ed|accepted|approved|verified|validated|confirmed|attested|deemed|qualif(y|ies|ied|ying)|meets?|satisf(y|ies|ied)|substitutes?|interchangeable|instead|lieu|aka|officially|registrar|per|please|trust)\b/i;
const NOT_COMPLETED = /\b(candidate|incomplete|unfinished|in[\s-]progress|pursuing|expected|dropped|withdrew|withdrawn|not\s+completed|partial|coursework|some\s+college|abd|audit(ed|ing)?|honorary|self[\s-](awarded|taught|study|studied)|equivalent|unaccredited|never\s+enrolled)\b/i;
const HONORS = /\((hons?\.?|honou?rs|first\s+class|cum\s+laude|magna\s+cum\s+laude|summa\s+cum\s+laude|distinction|merit)\)/gi;

/** Saying a technology wasn't used, or isn't known yet. "Not only" and "not limited to" don't count. */
export const NEGATION = new RegExp(
  [
    "\\b(never|not\\s+yet|have\\s+not|haven'?t|has\\s+not|hasn'?t|had\\s+not|hadn'?t|did\\s+not|didn'?t|do\\s+not|don'?t|does\\s+not|doesn'?t|am\\s+not|was\\s+not|wasn'?t|were\\s+not|weren'?t|not)\\s+(?:\\w+\\s+){0,2}?(use|used|using|work|worked|working|touch|touched|try|tried|know|known|learn|learned|learnt|familiar|experienced?|proficient|deploy|deployed|build|built|write|written|wrote|hold|held|have|had|administer|administered|manage|managed|configure|configured|program|programmed|code|coded|run|ran|involved|responsible|an?\\s+\\w+\\s+(?:user|admin|developer|engineer))\\b",
    "\\bnever\\s+(?!missed\\b|failed\\b|lost\\b|late\\b|dropped\\b|once\\b)\\w+\\b",
    "\\bno\\s+(?:\\w+\\s+){0,2}?(experience|knowledge|exposure|background|familiarity|expertise|skills?|training)\\b",
    "\\bwithout\\s+(?:any\\s+)?(using|experience|knowledge|exposure|touching|training)\\b",
    "\\b(lacks?|lacking|lacked|unfamiliar\\s+with|inexperienced\\s+(?:with|in)|new\\s+to|(?:have|has)\\s+yet\\s+to|yet\\s+to)\\b",
    "\\b(wants?|hopes?|hoping|plans?|planning|intends?|would\\s+like|looking|aims?|aiming)\\s+to\\s+(learn|try|use|start|explore|study|pick\\s+up)\\b",
    "\\b(?:would\\s+love|d\\s+love|love|excited|eager|keen|dreams?|dreaming|aspires?|aspiring|wish(?:es)?|looking\\s+forward)\\s+(?:to|of)\\s+(?:\\w+\\s+){0,2}?(?:learn\\w*|try\\w*|use|using|work\\w*|start\\w*|explor\\w*|study\\w*)\\b",
  ].join("|"),
  "gi",
);
export const hasNegation = (text: string) => new RegExp(NEGATION.source, "i").test(text);

const LEADING_OTHER = /^[^,;:]*?(?:[,;:]\s*(?:and\s+|so\s+|then\s+)?|\s+(?:so|and|then)\s+)(?=(?:i|we)(?:['’]\p{L}+)?\s)/iu;
const SIDE_CLAUSE = /\b(?:whenever|when|if|because|since|so\s+that|until|unless|while|after|before|once(?=\s+(?:the|a|an|our|my|it|they|he|she)\b)|where|though|although)\s+(?!(?:i|we)\b)[^,;:.!?]*?(?=\s+(?:i|we)(?:['’]\p{L}+)?\s|[,;:.!?]|$)|\b(?:who|whose|which|that|whatever|whichever|anything|everything)(?:['’](?:ve|d|re))?\s+(?!(?:i|we)\b)[^,;:.!?]*?(?=\s+(?:i|we)(?:['’]\p{L}+)?\s|[,;:.!?]|$)/giu;
/** A sentence without what it says about others: "customers can't log in, so I reset their accounts", "who
 * never bought from us". A negative left over is the person's own. An opening that negates ("Not once...") stays. */
export function ownClauses(sentence: string): string {
  const lead = LEADING_OTHER.exec(sentence);
  const keepLead = !lead || /\b(?:i|we|my)\b/i.test(lead[0]) || /^\W*(?:no|not|never|nor|neither|hardly|without|nothing)\b/i.test(lead[0]);
  return (keepLead ? sentence : sentence.slice(lead[0].length)).replace(SIDE_CLAUSE, " ");
}
const PLAIN_NEGATIVE = /\b(?:no|not|never|none|without|nothing|cannot|neither|nor)\b|n['’]t\b/i;
/** The person says they didn't: strict about any plain negative, but only in their own clauses. */
export const ownNegative = (sentence: string) => {
  const own = ownClauses(sentence);
  return PLAIN_NEGATIVE.test(own) || hasNegation(own);
};
/** The same, only for the phrasing that means not having done something. Any sentence of a longer text. */
export const statesNotDoing = (text: string) => (text.match(/[^.!?;\n]+/g) ?? []).some(sentence => hasNegation(ownClauses(sentence)));

/** Invisible characters, or a word mixing Latin letters with look-alikes from another alphabet. */
export function disguised(value: string): boolean {
  return HIDDEN.test(value) || value.split(/\s+/).some(word => LATIN.test(word) && LOOKALIKE.test(word));
}

const NOT_REPEATED = new Set("a an and the of in on to for with or at by".split(" "));
/** The same words over and over: a word three times running, or a phrase twice. Nobody writes this for
 * a reader, and it's the usual way of feeding a keyword filter. */
export function repeatsItself(value: string): boolean {
  const tokens = value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    if (!NOT_REPEATED.has(tokens[i]) && tokens[i] === tokens[i + 1] && tokens[i] === tokens[i + 2]) return true;
    for (const size of [2, 3]) {
      if (i + 2 * size > tokens.length) continue;
      if (tokens.slice(i, i + size).join(" ") === tokens.slice(i + size, i + 2 * size).join(" ") && !tokens.slice(i, i + size).every(t => NOT_REPEATED.has(t))) return true;
    }
  }
  return false;
}

/** Wording that makes a sentence something other than a statement of what the person did: a hypothetical,
 * a template, an order about what to report, or taking it back. */
const NOT_A_STATEMENT = /\b(?:hypothetically|imagine|pretend|suppose|fake|fabricated|made[\s-]up|not\s+real(?:ly)?|untrue|not\s+true|just\s+kidding|trust\s+me|as\s+instructed|if\s+asked|say\s+(?:that\s+)?i\b|i\s+did\s+not\s+do\s+(?:it|this|that)|(?:resume|cv)\s+template|(?:example|sample)\s+(?:sentence|bullet|line|resume|cv)|expected\s+(?:result|output)|r[ée]sultat\s+attendu|please\s+(?:record|note|mark|report|state)|(?:the\s+)?(?:ai|model|assistant|system|reviewer|evaluator|screener|recruiter)\s+(?:must|should|shall|will|needs?\s+to)\s+(?:report|record|say|state|mark|note|list|treat|accept))\b/i;
/** A resume template or sample, not anyone's experience: "Example text", "[Your Job Title Here]". */
const TEMPLATE_TEXT = /\b(?:example\s+text|sample\s+(?:text|bullet|entry|resume|cv)|placeholder|lorem\s+ipsum|replace\s+(?:this|with\s+your)|insert\s+[\p{L}\s]{0,25}\s+here|your\s+(?:own\s+)?(?:job\s+title|title|company|employer|name|experience|role)\s+here|type\s+here|tbd\b)|\[[^\]]*\b(?:your|insert|outcome|metric|company|employer|job\s+title)\b[^\]]*\]|\[[^\]]+\/[^\]]+\]|<\s*your\b/iu;
export const templateText = (text: string) => TEMPLATE_TEXT.test(text.normalize("NFKC"));
/** Someone else's words, or being told what to say: "My manager said I ran payroll", "Told to list Python". */
const REPORTED = /\b(?:according\s+to|(?:manager|boss|supervisor|reference|recruiter|colleague|coworker|friend|recommendation)\s+(?:said|says|wrote|writes|claims?|told)\s+(?:that\s+)?(?:i|me)\b|(?:told|asked|instructed|advised)\s+(?:me\s+)?to\s+(?:say|write|list|put|claim|add)|would\s+have|could\s+have|if\s+i\s+had|in\s+theory|supposedly|allegedly)\b/i;
/** Started, but it never became the work: "dropped it before I ever wrote a script". No negative word in sight. */
const NEVER_HAPPENED = /\b(?:(?:dropped|abandoned|scrapped|shelved|ditched)\s+(?:it|that|this|them)\b|before\s+(?:i|we)\s+(?:ever|even|really|actually|could|got\s+to)\b|gave\s+up\b|ended\s+up\s+(?:not|dropping|going\s+with|using\s+(?:something|another))\b|fell\s+through\b|clicked\s+around\b|played\s+around\b|messed\s+around\b|poked\s+around\b|dabbled\b|tinkered\b|(?:project|plan|idea|rollout|pilot)\s+(?:was|got)\s+(?:cancel+ed|scrapped|shelved|dropped)\b)/i;
/** Would or could, for a person: it says what might happen, not what did. */
const CONDITIONAL = /\b(?:i\s+(?:could|would|might)\b|would\s+be\s+able\b|if\s+(?:needed|required|asked)\b|(?:am|i['’]m)\s+willing\s+to\b)/i;
export const notAStatement = (text: string) => {
  const value = text.normalize("NFKC");
  return NOT_A_STATEMENT.test(value) || REPORTED.test(value) || NEVER_HAPPENED.test(value) || CONDITIONAL.test(value) || templateText(value);
};

/** The value carries something other than a name: markup, hidden characters, or claim wording. */
export function carriesClaim(value: string): boolean {
  const text = value.normalize("NFKC");
  return disguised(value) || MARKUP.test(text) || CLAIM.test(text) || hasNegation(text) || repeatsItself(text) || hasDirectedText(text) || notAStatement(text);
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** A field of study usable for matching, without any harmless qualifier: "Computer Science (Honors)"
 * -> "Computer Science". Null when the field holds a remark or claim. */
export function fieldOfStudyForMatching(field: string | null): string | null {
  if (!field || carriesClaim(field) || wordCount(field) > 10) return null;
  const main = field.normalize("NFKC").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return main || null;
}

/** A qualification usable for matching: a completed degree's name and nothing else. */
export function plainQualification(qualification: string): boolean {
  const text = qualification.normalize("NFKC").replace(HONORS, " ");
  return !carriesClaim(qualification) && !NOT_COMPLETED.test(text) && !text.includes("(") && wordCount(text) <= 10;
}

/** Whether a listed degree was earned. Free text can only lower this, never raise it. */
export type EducationStatus = "completed" | "in_progress" | "incomplete" | "unknown";
// A negation shortly before a word for finishing or receiving a degree, in any order of the small words
// between: "never conferred", "was not actually awarded", "didn't get my diploma". "Not only" isn't one.
const NOT_EARNED = /\b(?:never|not|didn'?t|wasn'?t|weren'?t|hasn'?t|hadn'?t)(?!\s+(?:only|just\s+a))(?:\s+\w+){0,3}?\s+(?:complet\w*|finish\w*|graduat\w*|confer\w*|award\w*|grant\w*|issu\w*|receiv\w*|obtain\w*|earn\w*|get|got|gotten)\b/i;
const SAYS_INCOMPLETE = /\b(without\s+(completing|finishing|graduating|a\s+degree)|left\s+(after|before|in|during|without)|stopped\s+(before|after|short)|dropped\s+out|drop[\s-]?out|withdrew|withdrawn|withheld|revoked|rescinded|discontinued|abandoned|unfinished|incomplete|abd|all\s+but\s+(thesis|dissertation)|no\s+degree|degree\s+(was\s+)?not|sin\s+terminar|no\s+terminad[oa]|inconclus[oa]|abgebrochen|nicht\s+abgeschlossen|non\s+termin[ée]e?)\b/i;
const NOT_YET = /\bnot\s+yet\s+(?:been\s+)?(?:confer\w*|award\w*|grant\w*|issu\w*)\b/i;
/** The qualification itself says it wasn't finished: usable to show that, and nothing else. */
export const saysNotCompleted = (qualification: string) => SAYS_INCOMPLETE.test(qualification) || NOT_EARNED.test(qualification);
const SAYS_IN_PROGRESS = /\b(currently\s+(enrolled|studying|pursuing|attending)|in[\s-]progress|expected\s+(in\s+|graduation\s+)?\d{0,4}|expected\s+to\s+(graduate|finish|complete)|pursuing|still\s+(studying|enrolled))\b/i;
const SAYS_UNCERTAIN = /\b(expired|lapsed|pending|awaiting|on\s+hold|deferred|on\s+leave|paused|thesis\s+(outstanding|pending)|may\s+(have|not)|unverified|not\s+sure|unsure|to\s+be\s+confirmed|tbc|provisional)\b/i;

export function educationStatus(entry: { qualification: string; field_of_study: string | null; end_month: string | null; description: string | null }, asOf: string): EducationStatus {
  const text = [entry.qualification, entry.field_of_study, entry.description].filter(Boolean).join(" . ").normalize("NFKC");
  if (NOT_YET.test(text)) return "unknown";
  if (SAYS_INCOMPLETE.test(text) || NOT_EARNED.test(text)) return "incomplete";
  if (SAYS_UNCERTAIN.test(text)) return "unknown";
  if (SAYS_IN_PROGRESS.test(text) || entry.end_month === null || entry.end_month > asOf) return "in_progress";
  return "completed";
}

/** A certificate or bootcamp: real training, but below any degree. */
const BELOW_DEGREE = /\b(bootcamp|boot\s+camp|certificate|certification|nanodegree|short\s+course|online\s+course|mooc|diploma)\b/i;
const DEGREE_DIPLOMA = /\b(graduate|postgraduate|post-graduate|advanced|higher|national)\s+diploma\b/i;
export const belowDegree = (qualification: string) => BELOW_DEGREE.test(qualification) && !DEGREE_DIPLOMA.test(qualification);

/** A credential listed by name, with words that say it's held rather than planned. */
const NOT_HELD = /\b(expired|lapsed|pending|booked|scheduled|studying|preparing|preparation|planned|planning|enrolled|working\s+toward|in\s+progress|not\s+yet|exam\s+(date|booked)|renewal\s+due|suspended|revoked|candidate|eligible|aspiring|sitting\s+for|exam\s+\d|exam\s+prep|prep\s+course|review\s+course|practice\s+(?:test|exam)|study\s+guide|not\s+(?:yet\s+)?(?:certified|licensed))\b/i;
const CREDENTIAL_MARKER = /\b(certified|certification|certificate|licensed|license|licence|card)\b/i;
const ACRONYM_NOTE = /\(([A-Z0-9+/]{2,8})\)/g;
export const notHeld = (text: string) => NOT_HELD.test(text.normalize("NFKC"));
export const hasCredentialMarker = (text: string) => CREDENTIAL_MARKER.test(text);
export function plainCredentialName(name: string): boolean {
  const text = name.normalize("NFKC").replace(ACRONYM_NOTE, " $1 ");
  return !carriesClaim(name) && !notHeld(text) && !text.includes("(") && wordCount(text) <= 10;
}

/** A title showing the job isn't the full role: "Chief Technology Officer (summer intern)". */
const NOT_THE_FULL_ROLE = /\b(intern|internship|trainee|apprentice|shadow\w*|student|volunteer|unpaid|assistant\s+to|aspiring|acting|interim\s+intern|emergency\s+permit)\b/i;
export const fullRoleTitle = (title: string) => !NOT_THE_FULL_ROLE.test(title.normalize("NFKC"));

/** Words that name a place of work, not what someone does there. */
const WORKPLACE_NOUN = /(?:^|\s)(home|hospital|clinic|center|centre|society|foundation|association|group|bank|museum|inc|llc|ltd|corp|corporation|company|co|university|college|school|academy|institute|hotel|restaurant|church|agency|firm|office|pharmacy|lab|laboratory|studio|partners)\.?$/i;
/** A place named right before the job: the "Nursing Home" of "Nursing Home Kitchen Aide". */
const WORKPLACE_BEFORE = /^(?:[\p{L}'-]+\s+)+?(?:home|center|centre|society|foundation|hotel|restaurant|clinic)\s+(?=\S)/iu;
const WORKPLACE_WORDS = /\b(home|hospital|clinic|center|centre|society|foundation|association|group|bank|university|college|school|academy|institute|hotel|restaurant|church|agency|firm|office|pharmacy|lab|laboratory|studio)\b/gi;

/** The part of a title saying what the person did, without where: "Kitchen Aide, Harbor Nursing Home" is
 * "Kitchen Aide". "Manager, Accounting" names a specialty, not a place, so it stays whole. */
export function rolePart(title: string): string {
  let text = title.normalize("NFKC").trim();
  text = text.split(/\s+at\s+|\s*@\s*/i)[0].trim();
  const aside = text.match(/\s*\(([^)]*)\)\s*$/);
  if (aside && WORKPLACE_NOUN.test(aside[1].trim())) text = text.slice(0, aside.index).trim();
  const tail = text.match(/^(.+?)(?:\s*,\s*|\s+[-\u2013\u2014|]\s+|\s*\|\s*|\s+for\s+)(.+)$/i);
  if (tail && WORKPLACE_NOUN.test(tail[2].trim())) text = tail[1].trim();
  const stripped = text.replace(WORKPLACE_BEFORE, "").trim();
  return stripped || text || title;
}
/** Place-of-work words in a title, for a requirement about the setting itself ("hospital experience"). */
export const workplaceWords = (title: string) => (title.normalize("NFKC").match(WORKPLACE_WORDS) ?? []).map(w => w.toLowerCase());

/** A job or project title usable as evidence or shown to local AI. */
export function plainTitle(title: string): boolean {
  return !carriesClaim(title) && wordCount(title) <= 12;
}
