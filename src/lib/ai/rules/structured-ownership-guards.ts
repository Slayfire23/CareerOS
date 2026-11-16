import { answerStatements, othersParts, type TextRules } from "@/lib/ai/evidence-boundary";
import { deniesRequirement, specificTerms } from "@/lib/ai/rules/answer-review";
import { canonicalTerms } from "@/lib/ai/skill-relations";
import { qualificationText } from "@/lib/ai/untrusted-text";

// Post-Stage G Gate A (consistency version 2, structured matching v2): ownership guards for a structured answer's explanation. Pure and
// deterministic. They only ever hold credit back, and only the structured consistency module reads them (under
// consistency version 2). The shared answer reader and its default are untouched: the free-text path never calls this
// module.
//
//   A2 `othersDoActivityOnly`: someone else is said to do the requirement's activity (active or passive voice: "The
//      forklift is operated by my coworker"), and none of the person's own doing statements touches that activity. An
//      unrelated own activity ("I pack orders") no longer makes the whole answer consistent. Collaboration where the
//      person also does it ("My team and I unload trucks, and I drive the forklift myself") is untouched, and so is a
//      division of a multi-activity requirement ("I build the endpoints and Kevin designs the API contracts").
//   A3 `withdrawnClaims` / `laterOwnDenial`: a correction that withdraws an earlier own claim, by giving it to someone
//      else ("Actually, that was my partner") or denying it ("..., but to be honest I never drove it"); or a later own
//      sentence that denies what an earlier one claimed. Narrowing ("Actually, I only drive it on weekends"), additions
//      ("Actually, I also...") and a change over time ("..., but these days my coworker drives it") are not withdrawals.

const stem = (word: string) => word.replace(/(ing|ings|ed|es|s)$/, "").replace(/e$/, "").replace(/(.)\1$/, "$1");
const SENTENCES = /(?:[^.!?;\n]|\.(?=\d))+/g;
const FIRST_PERSON = /(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s/iu;

/** Stems of the requirement's specific terms: the activity a statement must touch to be about this requirement. */
function activityStems(requirementText: string): Set<string> {
  return new Set(specificTerms(qualificationText(requirementText)).flatMap(t => [t, stem(t)]));
}
function touches(text: string, wanted: Set<string>): boolean {
  if (!wanted.size) return false;
  return [...canonicalTerms(text)].some(t => wanted.has(t) || wanted.has(stem(t)));
}
/** A requirement naming more than one activity ("Design and develop RESTful APIs"): someone else doing one of them leaves
 * the others open, so it takes someone else covering every term to contradict the person. */
const MULTI_ACTIVITY = /\b(?:and|or|as\s+well\s+as)\b|[,&/+]/i;

// ---- A2 ---------------------------------------------------------------------------------------------------------
/** Someone else's work in the passive, with its agent: "is operated by my coworker", "was handled by the night crew". */
const PASSIVE_BY_OTHER = /\b(?:is|are|was|were|gets?|got|been|being)\s+(?:(?:usually|always|mostly|all|actually|really|normally|generally)\s+)?(?:[\p{L}-]+ed|[\p{L}-]+en|done|run|driven|made|kept|built|sent|set\s+up|taken\s+care\s+of)\s+by\s+(?!me\b|myself\b|us\b|ourselves\b)(?:my|our|the|a|an|his|her|their|another|other|\p{Lu})/iu;
/** "My coworker and I", "I and my partner": the person is one of the doers. */
const WITH_ME = /\b(?:and\s+i|and\s+me|i\s+and|me\s+and|along\s+with\s+me|with\s+me)\b/i;
/** A clause that names the person ("My boss sends me out to install", "has me install") is never someone else's work
 * here: whether it is the person's own is the reader's question, and this guard only holds credit back. */
const NAMES_ME = /\b(?:me|myself)\b/i;
/** A clause that opens on a description ("<up to four words> is/are/was/were/has/have/had"). */
const DESCRIBES = /^\W*(?:[\p{L}'’-]+\s+){0,4}?(?:is|are|was|were|has|have|had)\b/iu;
const NEGATED = /\b(?:not|never|no|none|nobody)\b|n['’]t\b/i;

/** The clauses that say someone else does something: other people's clauses (active) and passives with an agent.
 * `directedIsOwn`: the opt-in reader that reads "sends me out to" as the person's own; the caller passes it. */
export function othersActivityClauses(text: string, directedIsOwn = false): string[] {
  // A description of a place or thing ("Our plant is SQF", "The team is small") says nobody did anything: the same
  // filter the whole-requirement check uses. Someone else's work in the passive needs its agent (below).
  // A negated clause ("Our team doesn't use ML") says nobody did it, not that someone else did.
  const active = othersParts(text, true, false, true, directedIsOwn).filter(p => !DESCRIBES.test(p) && !NEGATED.test(p));
  const passive = (text.match(SENTENCES) ?? []).flatMap(s => s.split(/,\s*(?:and|but)\s+|;\s*/i)).filter(c => PASSIVE_BY_OTHER.test(c));
  return [...active, ...passive].filter(c => !WITH_ME.test(c) && !NAMES_ME.test(c));
}

/** A2: someone else does this requirement's activity (every one of its activities, where it names several), and no own
 * doing statement, nor a sentence where the person is one of the doers, touches it. */
export function othersDoActivityOnly(requirementText: string, text: string, rules: TextRules, directedIsOwn = false): boolean {
  const asked = qualificationText(requirementText);
  const wanted = activityStems(requirementText);
  const others = othersActivityClauses(text, directedIsOwn);
  if (!others.some(c => touches(c, wanted))) return false;
  if (MULTI_ACTIVITY.test(asked)) {
    const said = new Set([...canonicalTerms(others.join(" "))].flatMap(t => [t, stem(t)]));
    if (!specificTerms(asked).every(t => said.has(t) || said.has(stem(t)))) return false;
  }
  const own = answerStatements(text, rules).filter(s => (s.subject === "self" || s.subject === "team") && s.ownership === "performed");
  if (own.some(s => touches(s.readable, wanted))) return false;
  if ((text.match(SENTENCES) ?? []).some(s => WITH_ME.test(s) && touches(s, wanted))) return false;
  return true;
}

// ---- A3 ---------------------------------------------------------------------------------------------------------
/** A correction opener, after punctuation or a joining "but/and/so". */
const MARKER = /(?:^|[.!?;,]\s*|\b(?:but|and|so)\s+)(?:actually|in\s+fact|correction|i\s+mean|to\s+be\s+honest|honestly|truthfully|in\s+reality|wait|sorry)\b[,:]?\s*(?:no[,.]?\s+)?([^.!?;\n]*)/giu;
/** After the marker: the claim goes to someone else. */
const TO_SOMEONE_ELSE = [
  /^(?:that|it|this|those)\s+(?:was|is|were|are)\s+(?:actually\s+|really\s+|all\s+)?(?:my|our|the|a|an|his|her|their)\s+[\p{L}-]+/iu,
  /^(?:that|it|this)\s+(?:was|is)\s+\p{Lu}\p{Ll}+/u,
  /^(?:my|our|the|his|her|their)\s+[\p{L}-]+(?:\s+[\p{L}-]+)?\s+(?:did|does|do|drove|drives|handled|handles|ran|runs|was\s+the\s+one|is\s+the\s+one|took\s+care|takes\s+care)\b/iu,
  /^(?:he|she|they|someone\s+else|somebody\s+else)\s+(?:did|does|do|was|is|were|handled|handles|drove|drives|ran|runs)\b/i,
  /^(?:not\s+me|it\s+wasn['’]t\s+me|that\s+wasn['’]t\s+me)\b/i,
];
/** After the marker: the person denies it. Narrowing ("I only", "I just") and additions ("I also") are not denials. */
const OWN_DENIAL = /^i\s+(?:never|didn['’]t|did\s+not|don['’]t|do\s+not|haven['’]t|have\s+not|wasn['’]t|was\s+not)\b/i;
/** A change over time is not a withdrawal: "..., but these days my coworker drives it". */
const OVER_TIME = /^(?:now|nowadays|these\s+days|currently|today|lately|since|recently|later|then|after\s+that)\b/i;

export type Withdrawal = { claim: [number, number]; by: "other_person" | "own_denial" };

/** The own claim just before a position: the rest of its sentence, or the sentence before when the marker opens one. */
function claimBefore(text: string, at: number): [number, number] | null {
  const before = text.slice(0, at);
  const inSentence = before.search(/[^.!?;\n]*$/);
  if (before.slice(inSentence).replace(/\b(?:but|and|so)\s*$/i, "").trim().length > 0) return [inSentence, at];
  const prior = before.slice(0, inSentence).replace(/[.!?;\s]+$/, "");
  if (!prior.trim()) return null;
  return [prior.search(/[^.!?;\n]*$/), prior.length];
}

/** A3: the own claims a correction withdraws (to someone else, or denied). Only claims made in the first person count. */
export function withdrawnClaims(text: string): Withdrawal[] {
  const out: Withdrawal[] = [];
  for (const m of text.matchAll(MARKER)) {
    const rest = m[1].trim();
    if (!rest || OVER_TIME.test(rest)) continue;
    const by = TO_SOMEONE_ELSE.some(p => p.test(rest)) ? "other_person" : OWN_DENIAL.test(rest) ? "own_denial" : null;
    if (!by) continue;
    const markerAt = m.index + m[0].search(/\p{L}/u);
    const claim = claimBefore(text, markerAt);
    if (!claim) continue;
    if (!FIRST_PERSON.test(text.slice(claim[0], claim[1]))) continue;
    out.push({ claim, by });
  }
  return out;
}

/** The text with withdrawn claims blanked (positions kept), for re-reading what is left. */
export function withoutWithdrawn(text: string, withdrawals: Withdrawal[]): string {
  let out = text;
  for (const { claim: [s, e] } of withdrawals) out = out.slice(0, s) + " ".repeat(e - s) + out.slice(e);
  return out;
}

/** A change over time inside a denial: "I no longer drive it", "I never drove one before this job". Not a contradiction. */
const DENIAL_OVER_TIME = /\b(?:no\s+longer|any\s*more|before|until|prior\s+to|previously|at\s+first|used\s+to|these\s+days|since|yet)\b/i;

/** A3: a later sentence of the person's own denies the activity an earlier own sentence claimed ("I operate the forklift.
 * I have never operated a forklift myself."). A denial first, or one about a change over time, isn't a contradiction. */
export function laterOwnDenial(requirementText: string, text: string): boolean {
  const wanted = activityStems(requirementText);
  const sentences = text.match(SENTENCES) ?? [];
  return sentences.some((s, i) => i > 0 && !DENIAL_OVER_TIME.test(s) && deniesRequirement(requirementText, s)
    && sentences.slice(0, i).some(p => FIRST_PERSON.test(p) && touches(p, wanted) && !deniesRequirement(requirementText, p)));
}

/** A3: corrections the shared reader missed. Where the reader already takes a claim back (its own retractions: "Actually,
 * the shop does the threading, I only fit the pipe"), it also keeps the narrowed claim, so this guard leaves it alone. */
export function unhandledWithdrawals(text: string, handled: [number, number][]): Withdrawal[] {
  return withdrawnClaims(text).filter(w => !handled.some(([s, e]) => s < w.claim[1] && w.claim[0] < e));
}

/** A3: a correction the shared reader missed withdraws an own claim about this requirement's activity. */
export function withdrawsActivity(requirementText: string, text: string, handled: [number, number][] = []): Withdrawal | null {
  const wanted = activityStems(requirementText);
  return unhandledWithdrawals(text, handled).find(w => touches(text.slice(w.claim[0], w.claim[1]), wanted)) ?? null;
}
