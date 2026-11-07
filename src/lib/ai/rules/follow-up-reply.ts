import { answerLanguage } from "@/lib/ai/answer-language";
import { handsPartToSomeoneElse } from "@/lib/ai/clauses";
import type { MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements, othersParts, othersText, verbAndObject } from "@/lib/ai/evidence-boundary";
import type { RuleBasis } from "@/lib/ai/match-validation";
import { asksForTime, needsCredentialEntry, readAnswer, specificTerms } from "@/lib/ai/rules/answer-review";
import { answerProblem } from "@/lib/ai/rules/clarifications";
import type { RawFinding } from "@/lib/ai/rules/engine";
import { ownNegative } from "@/lib/ai/rules/profile-fields";
import { canonicalTerms, hasQualificationWords, words } from "@/lib/ai/skill-relations";
import { hasDirectedText, qualificationText } from "@/lib/ai/untrusted-text";

// What code makes of a person's reply to a follow-up question. No model reads a reply. A model may have
// suggested asking, and that's all it did, so a reply reaches Possible — Self-reported at most.


/** One question per requirement, ever: answered, denied, or skipped, it doesn't come back. */
export const mayAskFollowUp = (key: string, alreadyAsked: ReadonlySet<string>) => !alreadyAsked.has(key);

export type ReplyReason = "not_english" | "instruction_in_reply" | "credential_or_time" | "says_no" | "not_specific" | "undercuts_itself" | "no_own_work" | "repeats_the_question" | "contradicts_answer" | "describes_own_work";
export type ReplyReading = { outcome: "possible_candidate" | "unresolved"; reason: ReplyReason; quote: string | null; provenance: "self_reported" };

const SAYS_NO = /^\W*(?:no|nope|not\s+really|different|it['’]?s\s+different|that['’]?s\s+different|something\s+different)\b/i;
const AFFIRMS = /^\W*(?:(?:yes|yeah|yep|it|it['’]s|its|is|that|that['’]s|the|same|work|right|correct|exactly)\W*)+$/i;
/** Offering a credential for the work: a reply can't show one, and it isn't a description of doing anything. */
const OFFERS_CREDENTIAL = /\b(?:hold|have|got|carry|earned|passed)\s+(?:an?|my|the)\b[^.]*\b(?:card|licen[cs]e|cert|certificate|credential|permit|ticket|bar|boards?|exam)\b|\b(?:covers|counts\s+for|answers)\s+(?:it|that|this)\b|\b(?:that|this|it)\s+counts\b/i;
/** Someone else did the real work, or the person's own part is framed as the small part. */
const OTHERS_DID_THE_WORK = /\b(?:did|does|do|handled?|handles)\s+the\s+actual\b|\bthe\s+actual\s+[\p{L}-]+(?:\s+[\p{L}-]+)?\s+(?:was|were|is|are)\b|\b(?:handles?|handled|does|did|do)\s+(?:everything|the\s+rest|all\s+(?:of\s+)?the\s+rest)\b|\b(?:was|is|were|are)\s+(?:all\s+)?(?:his|hers|theirs)\b|\bmy\s+(?:part|piece|bit|end|role)\s+(?:was|is)\b|\bi\s+just\b|\b(?:is|are|was|were)\s+(?:all\s+|mostly\s+|really\s+)?(?:them|theirs|(?:the|our|an?|their)\s+(?:[\p{L}-]+\s+){0,2}(?:company|contractor|contractors|vendor|agency|firm|team|department|provider|crew|guys?|people|techs?|staff|office))\b|\b(?:rarely|seldom|hardly\s+ever|barely\s+ever|not\s+often|once\s+in\s+a\s+while)\b/iu;
const UNDERCUTS = /^\W*only\s+(?:some|part)\b|\b(?:part|some)\s+of\s+it\b|\bi\s+only\b|\bthough\s+really\b|\b(?:although|though)\s+i\b|\bonly\s+(?:ever|when|if)\b|\bbut\s+(?:only|mostly|just|really|honestly|mainly)\b|\b(?:sort|kind)\s+of\b|\bi\s+(?:guess|think|suppose|believe)\b|\bnot\s+sure\b|\bprobably\b|\bmaybe\b|\bmore\s+or\s+less\b|\bpretty\s+much\b|\bbasically\b|\bessentially\b/i;
const NEW_WORDS_NEEDED = 3;
const SAYS_NOTHING = new Set(words("yes yeah yep same work i i've we my our the a an and or of to in on at for with it this that these those is was are were be been did do does done have has had what you said also just always every each day week month year"));
/** What a follow-up question asks. Code chooses it from the answer: who did which part, or whether the person did it
 * themselves or led or arranged it. "relation" is the open question the local model may suggest for a paraphrase. */
export type FollowUpKind = "who" | "responsibility" | "relation";

/** Open-ended, and it doesn't suggest which answer is wanted. Code writes every word but the two quotes. */
export function followUpQuestion(sentence: string, requirement: string, kind: FollowUpKind = "relation"): string {
  if (kind === "who") return `You said “${sentence}”. Which parts of “${requirement}” did you do yourself, and which did others do? Describe what you personally did, and for how long. If you didn't do it yourself, you can choose No or Skip.`;
  if (kind === "responsibility") return `You said “${sentence}”. Did you do “${requirement}” yourself, or did you lead, schedule, or arrange for others to do it? Describe what you personally did, and for how long. If you didn't do it yourself, you can choose No or Skip.`;
  return `You said “${sentence}”. What, if anything, in that work involved “${requirement}”? Describe what you personally did. If it didn't, you can choose No or Skip.`;
}

const termsOf = (text: string) => new Set([...canonicalTerms(text)].flatMap(t => [t, stemOf(t)]));
const stemOf = (word: string) => word.replace(/(ing|ings|ed|es|s)$/, "").replace(/e$/, "").replace(/(.)\1$/, "$1");
const touches = (wanted: string[], text: string) => {
  const have = termsOf(text);
  return wanted.some(t => have.has(t) || have.has(stemOf(t)));
};

/** When an answer is plausible but incomplete, the question code asks, about which sentence. No model takes part:
 * the answer is about this work, but who did it isn't plain, or the person's part was leading, arranging, or helping.
 * Nothing is asked about an answer that already counts, a credential, time, or anything not plainly English. */
export function followUpNeed(requirement: MatchRequirement, answer: string): { kind: Exclude<FollowUpKind, "relation">; start: number; end: number } | null {
  const text = qualificationText(requirement.text).trim();
  if (!text || answerLanguage(answer) !== "en" || hasDirectedText(answer) || needsCredentialEntry(text) || asksForTime(text)) return null;
  if (readAnswer(requirement, answer).verdict !== "insufficient_information") return null;
  const wanted = specificTerms(text);
  if (!wanted.length) return null;
  const statements = answerStatements(answer);
  const span = (s: { start: number; text: string }) => ({ start: s.start, end: s.start + s.text.length });
  // Their part was leading, arranging, or helping with this work: did they do it themselves?
  const led = statements.find(s => s.subject === "self" && s.act !== "says_little" && s.ownership !== "performed" && (touches(wanted, s.readable) || touches(wanted, answer)));
  if (led) return { kind: "responsibility", ...span(led) };
  // "We" did it, or someone else did part of it beside the person's own work: which part was theirs?
  const shared = statements.find(s => s.subject === "team" && s.act !== "says_little" && touches(wanted, s.readable));
  if (shared) return { kind: "who", ...span(shared) };
  const own = statements.find(s => s.subject === "self" && s.act !== "says_little" && !s.exposureOnly);
  if (own && touches(wanted, othersText(answer))) return { kind: "who", ...span(own) };
  return null;
}

/** The kind of a stored question, worked out again from the same answer and words. */
export function followUpKind(requirement: MatchRequirement, answer: string, quoted: string): FollowUpKind {
  const need = followUpNeed(requirement, answer);
  return need && answer.slice(need.start, need.end) === quoted ? need.kind : "relation";
}

/** A reply that says what changed: when, or what moved. Without it, a reply can't reverse the answer. */
const SAYS_WHAT_CHANGED = /\b(?:since|until|used\s+to|these\s+days|nowadays|now\s+i|i\s+now|took\s+over|moved\s+(?:to|into|over|up)|(?:was|got)\s+promoted|switched|changed|started\s+(?:doing|in|at|on|last|this)|before\s+(?:that|i|we)|after\s+(?:that|i|we|the|our)|last\s+(?:year|month|season|spring|summer|fall|autumn|winter|quarter)|this\s+(?:year|season|quarter)|in\s+(?:19|20)\d\d|left|retired|quit|no\s+longer)\b/i;
/** Verbs that say nothing about which work it was. */
const VAGUE_VERBS = new Set("be is are was were have has had do get go make take keep use help work".split(" "));
/** What the answer itself says the person doesn't do, someone else does, or takes back: each part's main verb and the
 * object of it. Only a person's or a firm's part counts, not a thing's ("our old encoder kept suggesting wrong codes"). */
function disputed(answer: string): { verbs: Set<string>; objects: Set<string> } {
  const negatives = (answer.match(/(?:[^.!?;\n]|\.(?=\d))+/g) ?? []).filter(s => /(?:^|[^\p{L}'’])i(?:['’]\p{L}+)?\s/iu.test(s) && ownNegative(s));
  const parts = [...othersParts(answer, true), ...negatives].map(verbAndObject).filter((p): p is { verb: string; object: string } => !!p);
  return { verbs: new Set(parts.map(p => p.verb).filter(v => v && !VAGUE_VERBS.has(v))), objects: new Set(parts.map(p => stemOf(p.object)).filter(Boolean)) };
}


/** Never Supported. The person has to say what they did themselves: no yes, no echo, nothing it takes back, and nothing
 * the answer itself rules out. `answer` is the whole answer the question was asked about. */
export function readFollowUpReply(requirement: MatchRequirement, quoted: string, reply: string, answer: string = quoted): ReplyReading {
  const unresolved = (reason: ReplyReason): ReplyReading => ({ outcome: "unresolved", reason, quote: null, provenance: "self_reported" });
  const text = qualificationText(requirement.text).trim();
  const value = reply.trim();
  if (needsCredentialEntry(text) || asksForTime(text) || hasQualificationWords(value) || OFFERS_CREDENTIAL.test(value)) return unresolved("credential_or_time");
  if (SAYS_NO.test(value)) return unresolved("says_no");
  if (hasDirectedText(value)) return unresolved("instruction_in_reply");
  // Before language: "Yes." is too short to be any language, and it's a yes.
  if (answerProblem(value, `${text} ${quoted}`)) return unresolved("not_specific");
  if (answerLanguage(value) !== "en") return unresolved("not_english");
  if (UNDERCUTS.test(value) || OTHERS_DID_THE_WORK.test(value)) return unresolved("undercuts_itself");
  const sentences = (value.match(/(?:[^.!?;\n]|\.(?=\d))+/g) ?? []).filter(s => words(s).length > 2 && !AFFIRMS.test(s));
  const statements = answerStatements(value).filter(s => !AFFIRMS.test(s.text));
  // Every sentence with something to say has to clear. One that doesn't takes back what the rest claims.
  // A sentence about someone else's part ("He sprays and does the bait stations") doesn't take back the person's own
  // limited part. One that denies, corrects, or hedges does.
  const othersPart = (s: string) => !/(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s/iu.test(s) && !/\b(?:no|not|never|none)\b|n['’]t\b/i.test(s) && /^\W*(?:he|she|they|\p{Lu}\p{Ll}+|(?:the|our|a|an|my|their)\s+[\p{L}-]+)\b/u.test(s);
  if (statements.length < sentences.filter(s => !othersPart(s)).length) return unresolved("undercuts_itself");
  // "He did the ratings, I took the photos": a sentence that hands part of it to someone else, beside the person's own.
  if (sentences.some(handsPartToSomeoneElse)) return unresolved("undercuts_itself");
  const own = statements.filter(s => s.subject === "self" && s.act === "concrete" && !s.exposureOnly && s.ownership === "performed");
  if (!own.length) return unresolved("no_own_work");
  const asked = new Set(words(`${text} ${quoted}`));
  const added = new Set(own.flatMap(s => words(s.readable)).filter(w => !asked.has(w) && !SAYS_NOTHING.has(w)));
  if (added.size < NEW_WORDS_NEEDED) return unresolved("repeats_the_question");
  // The answer said someone else does this, or that the person doesn't, or took it back. A reply claiming that same work
  // counts only if it says what changed: "I pick right alongside them every day" after "I don't pick much myself" doesn't.
  // Code asked whether they did it themselves, or which part was theirs: the reply has to describe doing the asked work
  // itself, in its words. Posting the notices, or salting the steps beside the plow contract, isn't snow removal.
  if (followUpKind(requirement, answer, quoted) !== "relation" && !own.some(s => touches(specificTerms(text), s.readable))) return unresolved("no_own_work");
  const ruledOut = disputed(answer);
  const claims = own.map(s => verbAndObject(s.text)).filter((p): p is { verb: string; object: string } => !!p);
  const reverses = claims.some(c => ruledOut.verbs.has(c.verb) || ruledOut.objects.has(stemOf(c.object)));
  if (reverses && !SAYS_WHAT_CHANGED.test(value)) return unresolved("contradicts_answer");
  return { outcome: "possible_candidate", reason: "describes_own_work", quote: own[0].text, provenance: "self_reported" };
}

export type LinkedReply = { questionKey: string; evidenceId: string; quoted: string; detail: string; answer?: string };

/** Reads active replies again on every analysis, and lifts only Not enough information, only to Possible. */
export function applyFollowUps(request: MatchRequest, findings: RawFinding[], replies: LinkedReply[], keyFor: (r: MatchRequirement) => string): RawFinding[] {
  if (!replies.length) return findings;
  const byKey = new Map(replies.map(r => [r.questionKey, r]));
  return findings.map(f => {
    if (f.verdict !== "insufficient_information" || f.review) return f;
    const requirement = request.requirements.find(r => r.index === f.requirement_index)!;
    const reply = byKey.get(keyFor(requirement));
    if (!reply) return f;
    const reading = readFollowUpReply(requirement, reply.quoted, reply.detail, reply.answer);
    if (reading.outcome !== "possible_candidate" || !reading.quote) return f;
    return {
      ...f,
      verdict: "possible",
      explanation: "You described doing this work in reply to a question. It's self-reported, and it can only reach Possible.",
      citations: [{ evidence_id: reply.evidenceId, quote: reading.quote.slice(0, 300) }],
      caveats: [],
      basis: "candidate_follow_up" as RuleBasis,
      rules_only_verdict: f.verdict,
    };
  });
}

/** What a person sees about a saved reply. */
export const REPLY_NOTES: Record<ReplyReason, string> = {
  describes_own_work: "This counts toward Possible — Self-reported. CareerOS doesn't independently verify it.",
  not_english: "Saved, but not used yet. For now CareerOS can only read replies written fully in English, so this stays unresolved. You can edit it.",
  instruction_in_reply: "This stays unresolved: remarks about how this should be judged can't be used. You can edit it.",
  credential_or_time: "This stays unresolved: a credential goes in Education, and time comes from your role dates. You can edit it.",
  says_no: "This stays unresolved. If this is different work, choose No.",
  not_specific: "This stays unresolved, because it doesn't say what you did. You can edit it.",
  undercuts_itself: "This stays unresolved, because part of it says you didn't do this yourself or takes it back. You can edit it.",
  no_own_work: "This stays unresolved, because it doesn't say what you personally did. You can edit it.",
  repeats_the_question: "This stays unresolved, because it repeats the question instead of adding what you did. You can edit it.",
  contradicts_answer: "This stays unresolved, because it says the opposite of your earlier answer without saying what changed. If something changed, say when and what you did yourself. You can edit it.",
};
