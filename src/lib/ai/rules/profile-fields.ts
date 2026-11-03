// Typed profile fields are data, not statements. A field that holds a remark or a claim ("Statistics
// (counts as Computer Science per registrar)", "Python = Scala") isn't a value of that field, so it
// is never used as evidence. What a person writes about equivalence is never an independently
// verified fact: only the reviewed table can say two things are the same.

const HIDDEN = /[\p{Cc}\p{Cf}]/u;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const MARKUP = /[:;{}<>[\]=≈≡→⇒]/;

const CLAIM = /\b(counts?|counted|equal|equals|equivalent|equivalence|same|treated|regarded|considered|recogni[sz]ed|accepted|approved|verified|validated|confirmed|attested|deemed|qualif(y|ies|ied|ying)|meets?|satisf(y|ies|ied)|substitutes?|interchangeable|instead|lieu|aka|officially|registrar|per|please|trust)\b/i;
const NOT_COMPLETED = /\b(candidate|incomplete|unfinished|in[\s-]progress|pursuing|expected|dropped|withdrew|withdrawn|not\s+completed|partial|coursework|some\s+college|abd|audit(ed|ing)?|honorary)\b/i;

/** Invisible characters, or a word mixing Latin letters with look-alikes from another alphabet. */
export function disguised(value: string): boolean {
  return HIDDEN.test(value) || value.split(/\s+/).some(word => LATIN.test(word) && LOOKALIKE.test(word));
}

/** The value carries something other than a name: markup, hidden characters, or claim wording. */
export function carriesClaim(value: string): boolean {
  const text = value.normalize("NFKC");
  return disguised(value) || MARKUP.test(text) || CLAIM.test(text);
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
  const text = qualification.normalize("NFKC");
  return !carriesClaim(qualification) && !NOT_COMPLETED.test(text) && !text.includes("(") && wordCount(text) <= 10;
}

/** A job or project title usable as evidence or shown to local AI. */
export function plainTitle(title: string): boolean {
  return !carriesClaim(title) && wordCount(title) <= 12;
}
