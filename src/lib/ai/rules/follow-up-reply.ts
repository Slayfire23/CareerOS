import { answerLanguage } from "@/lib/ai/answer-language";
import { handsPartToSomeoneElse } from "@/lib/ai/clauses";
import type { MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements } from "@/lib/ai/evidence-boundary";
import type { RuleBasis } from "@/lib/ai/match-validation";
import { asksForTime, needsCredentialEntry } from "@/lib/ai/rules/answer-review";
import { answerProblem } from "@/lib/ai/rules/clarifications";
import type { RawFinding } from "@/lib/ai/rules/engine";
import { hasQualificationWords, words } from "@/lib/ai/skill-relations";
import { hasDirectedText, qualificationText } from "@/lib/ai/untrusted-text";

// What code makes of a person's reply to a follow-up question. No model reads a reply. A model may have
// suggested asking, and that's all it did, so a reply reaches Possible — Self-reported at most.

/** Open-ended, and it doesn't suggest which answer is wanted. Code writes every word but the two quotes. */
export const followUpQuestion = (sentence: string, requirement: string) => `You said “${sentence}”. What, if anything, in that work involved “${requirement}”? Describe what you personally did. If it didn't, you can choose No or Skip.`;

/** One question per requirement, ever: answered, denied, or skipped, it doesn't come back. */
export const mayAskFollowUp = (key: string, alreadyAsked: ReadonlySet<string>) => !alreadyAsked.has(key);

export type ReplyReason = "not_english" | "instruction_in_reply" | "credential_or_time" | "says_no" | "not_specific" | "undercuts_itself" | "no_own_work" | "repeats_the_question" | "describes_own_work";
export type ReplyReading = { outcome: "possible_candidate" | "unresolved"; reason: ReplyReason; quote: string | null; provenance: "self_reported" };

const SAYS_NO = /^\W*(?:no|nope|not\s+really|different|it['’]?s\s+different|that['’]?s\s+different|something\s+different)\b/i;
const AFFIRMS = /^\W*(?:(?:yes|yeah|yep|it|it['’]s|its|is|that|that['’]s|the|same|work|right|correct|exactly)\W*)+$/i;
/** Offering a credential for the work: a reply can't show one, and it isn't a description of doing anything. */
const OFFERS_CREDENTIAL = /\b(?:hold|have|got|carry|earned|passed)\s+(?:an?|my|the)\b[^.]*\b(?:card|licen[cs]e|cert|certificate|credential|permit|ticket|bar|boards?|exam)\b|\b(?:covers|counts\s+for|answers)\s+(?:it|that|this)\b|\b(?:that|this|it)\s+counts\b/i;
/** Someone else did the real work, or the person's own part is framed as the small part. */
const OTHERS_DID_THE_WORK = /\b(?:did|does|do|handled?|handles)\s+the\s+actual\b|\bthe\s+actual\s+[\p{L}-]+(?:\s+[\p{L}-]+)?\s+(?:was|were|is|are)\b|\b(?:handles?|handled|does|did|do)\s+(?:everything|the\s+rest|all\s+(?:of\s+)?the\s+rest)\b|\b(?:was|is|were|are)\s+(?:all\s+)?(?:his|hers|theirs)\b|\bmy\s+(?:part|piece|bit|end|role)\s+(?:was|is)\b|\bi\s+just\b/iu;
const UNDERCUTS = /^\W*only\s+(?:some|part)\b|\b(?:part|some)\s+of\s+it\b|\bi\s+only\b|\bthough\s+really\b|\b(?:although|though)\s+i\b|\bonly\s+(?:ever|when|if)\b|\bbut\s+(?:only|mostly|just|really|honestly|mainly)\b|\b(?:sort|kind)\s+of\b|\bi\s+(?:guess|think|suppose|believe)\b|\bnot\s+sure\b|\bprobably\b|\bmaybe\b|\bmore\s+or\s+less\b|\bpretty\s+much\b|\bbasically\b|\bessentially\b/i;
const NEW_WORDS_NEEDED = 3;
const SAYS_NOTHING = new Set(words("yes yeah yep same work i i've we my our the a an and or of to in on at for with it this that these those is was are were be been did do does done have has had what you said also just always every each day week month year"));

/** Never Supported. The person has to say what they did themselves: no yes, no echo, nothing it takes back. */
export function readFollowUpReply(requirement: MatchRequirement, quoted: string, reply: string): ReplyReading {
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
  return { outcome: "possible_candidate", reason: "describes_own_work", quote: own[0].text, provenance: "self_reported" };
}

export type LinkedReply = { questionKey: string; evidenceId: string; quoted: string; detail: string };

/** Reads active replies again on every analysis, and lifts only Not enough information, only to Possible. */
export function applyFollowUps(request: MatchRequest, findings: RawFinding[], replies: LinkedReply[], keyFor: (r: MatchRequirement) => string): RawFinding[] {
  if (!replies.length) return findings;
  const byKey = new Map(replies.map(r => [r.questionKey, r]));
  return findings.map(f => {
    if (f.verdict !== "insufficient_information" || f.review) return f;
    const requirement = request.requirements.find(r => r.index === f.requirement_index)!;
    const reply = byKey.get(keyFor(requirement));
    if (!reply) return f;
    const reading = readFollowUpReply(requirement, reply.quoted, reply.detail);
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
};
