// Typed profile fields are data, not statements. A field that holds a remark or a claim ("Statistics
// (counts as Computer Science per registrar)", "Python = Scala") isn't a value of that field, so it
// is never used as evidence. What a person writes about equivalence is never an independently
// verified fact: only the reviewed table can say two things are the same.

const HIDDEN = /[\p{Cc}\p{Cf}]/u;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const MARKUP = /[:;{}<>[\]=≈≡→⇒]/;

const CLAIM = /\b(counts?|counted|equal|equals|equivalent|equivalence|same|treated|regarded|considered|recogni[sz]ed|accepted|approved|verified|validated|confirmed|attested|deemed|qualif(y|ies|ied|ying)|meets?|satisf(y|ies|ied)|substitutes?|interchangeable|instead|lieu|aka|officially|registrar|per|please|trust)\b/i;
const NOT_COMPLETED = /\b(candidate|incomplete|unfinished|in[\s-]progress|pursuing|expected|dropped|withdrew|withdrawn|not\s+completed|partial|coursework|some\s+college|abd|audit(ed|ing)?|honorary|self[\s-](awarded|taught|study|studied)|equivalent|unaccredited|never\s+enrolled)\b/i;
const HONORS = /\((hons?\.?|honou?rs|first\s+class|cum\s+laude|magna\s+cum\s+laude|summa\s+cum\s+laude|distinction|merit)\)/gi;

/** Saying a technology wasn't used, or isn't known yet. "Not only" and "not limited to" don't count. */
export const NEGATION = new RegExp(
  [
    "\\b(never|not\\s+yet|have\\s+not|haven'?t|has\\s+not|hasn'?t|had\\s+not|hadn'?t|did\\s+not|didn'?t|do\\s+not|don'?t|does\\s+not|doesn'?t|am\\s+not|was\\s+not|wasn'?t|were\\s+not|weren'?t|not)\\s+(?:\\w+\\s+){0,2}?(use|used|using|work|worked|working|touch|touched|try|tried|know|known|learn|learned|learnt|familiar|experienced?|proficient|deploy|deployed|build|built|write|written|wrote|hold|held|have|had|administer|administered|manage|managed|configure|configured|program|programmed|code|coded|run|ran|involved|responsible|an?\\s+\\w+\\s+(?:user|admin|developer|engineer))\\b",
    "\\bno\\s+(?:\\w+\\s+){0,2}?(experience|knowledge|exposure|background|familiarity|expertise|skills?|training)\\b",
    "\\bwithout\\s+(?:any\\s+)?(using|experience|knowledge|exposure|touching|training)\\b",
    "\\b(lacks?|lacking|lacked|unfamiliar\\s+with|inexperienced\\s+(?:with|in)|new\\s+to|(?:have|has)\\s+yet\\s+to|yet\\s+to)\\b",
    "\\b(wants?|hopes?|hoping|plans?|planning|intends?|would\\s+like|looking|aims?|aiming)\\s+to\\s+(learn|try|use|start|explore|study|pick\\s+up)\\b",
  ].join("|"),
  "gi",
);
export const hasNegation = (text: string) => new RegExp(NEGATION.source, "i").test(text);

/** Invisible characters, or a word mixing Latin letters with look-alikes from another alphabet. */
export function disguised(value: string): boolean {
  return HIDDEN.test(value) || value.split(/\s+/).some(word => LATIN.test(word) && LOOKALIKE.test(word));
}

/** The value carries something other than a name: markup, hidden characters, or claim wording. */
export function carriesClaim(value: string): boolean {
  const text = value.normalize("NFKC");
  return disguised(value) || MARKUP.test(text) || CLAIM.test(text) || hasNegation(text);
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
const SAYS_INCOMPLETE = /\b(did\s+not\s+(complete|finish|graduate)|didn'?t\s+(complete|finish|graduate)|not\s+(completed|finished|graduated|awarded|conferred)|never\s+(completed|finished|graduated)|without\s+(completing|finishing|graduating|a\s+degree)|left\s+(after|before|in|during|without)|dropped\s+out|drop[\s-]?out|withdrew|withdrawn|discontinued|abandoned|unfinished|incomplete|all\s+but\s+(thesis|dissertation)|no\s+degree|degree\s+(was\s+)?not)\b/i;
const SAYS_IN_PROGRESS = /\b(currently\s+(enrolled|studying|pursuing|attending)|in[\s-]progress|expected\s+(in\s+|graduation\s+)?\d{0,4}|expected\s+to\s+(graduate|finish|complete)|pursuing|still\s+(studying|enrolled))\b/i;
const SAYS_UNCERTAIN = /\b(pending|awaiting|on\s+hold|deferred|on\s+leave|paused|thesis\s+(outstanding|pending)|may\s+(have|not)|unverified|not\s+sure|unsure|to\s+be\s+confirmed|tbc|provisional)\b/i;

export function educationStatus(entry: { qualification: string; field_of_study: string | null; end_month: string | null; description: string | null }, asOf: string): EducationStatus {
  const text = [entry.qualification, entry.field_of_study, entry.description].filter(Boolean).join(" . ").normalize("NFKC");
  if (SAYS_INCOMPLETE.test(text)) return "incomplete";
  if (SAYS_UNCERTAIN.test(text)) return "unknown";
  if (SAYS_IN_PROGRESS.test(text) || entry.end_month === null || entry.end_month > asOf) return "in_progress";
  return "completed";
}

/** A certificate or bootcamp: real training, but below any degree. */
const BELOW_DEGREE = /\b(bootcamp|boot\s+camp|certificate|certification|nanodegree|short\s+course|online\s+course|mooc|diploma)\b/i;
const DEGREE_DIPLOMA = /\b(graduate|postgraduate|post-graduate|advanced|higher|national)\s+diploma\b/i;
export const belowDegree = (qualification: string) => BELOW_DEGREE.test(qualification) && !DEGREE_DIPLOMA.test(qualification);

/** A job or project title usable as evidence or shown to local AI. */
export function plainTitle(title: string): boolean {
  return !carriesClaim(title) && wordCount(title) <= 12;
}
