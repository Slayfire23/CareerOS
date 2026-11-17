// Explicit withdrawals of the person's own claim (post-Stage G Gate A). One definition, shared by structured matching v2
// (the consistency guard) and the opt-in free-text reader version v21a, so the two answer paths can't disagree about the
// same correction. Pure: no imports, no I/O.
//
// A withdrawal is a correction marker (actually, in fact, correction, I mean, to be honest, honestly, truthfully, in
// reality, wait, sorry; after punctuation or a joining "but/and/so") followed by words that give the claim to someone
// else ("that was my partner", "it was Sam", "my brother did that") or deny it ("I never..."). Narrowing ("I only..."),
// additions ("I also...") and a change over time ("now", "these days") are not withdrawals.
//
// Activity-specific: where the corrected claim joins several activities ("I operate the forklift and pack orders") and
// the correction names one of them ("Actually, my partner drove the forklift"), only that activity's part is withdrawn.

const MARKER = /(?:^|[.!?;,]\s*|\b(?:but|and|so)\s+)(?:actually|in\s+fact|correction|i\s+mean|to\s+be\s+honest|honestly|truthfully|in\s+reality|wait|sorry)\b[,:]?\s*(?:no[,.]?\s+)?([^.!?;\n]*)/giu;
const TO_SOMEONE_ELSE = [
  /^(?:that|it|this|those)\s+(?:was|is|were|are)\s+(?:actually\s+|really\s+|all\s+)?(?:my|our|the|a|an|his|her|their)\s+[\p{L}-]+/iu,
  /^(?:that|it|this)\s+(?:was|is)\s+\p{Lu}\p{Ll}+/u,
  /^(?:my|our|the|his|her|their)\s+[\p{L}-]+(?:\s+[\p{L}-]+)?\s+(?:did|does|do|drove|drives|handled|handles|ran|runs|was\s+the\s+one|is\s+the\s+one|took\s+care|takes\s+care)\b/iu,
  /^(?:he|she|they|someone\s+else|somebody\s+else)\s+(?:did|does|do|was|is|were|handled|handles|drove|drives|ran|runs)\b/i,
  /^(?:not\s+me|it\s+wasn['’]t\s+me|that\s+wasn['’]t\s+me)\b/i,
];
const OWN_DENIAL = /^i\s+(?:never|didn['’]t|did\s+not|don['’]t|do\s+not|haven['’]t|have\s+not|wasn['’]t|was\s+not)\b/i;
const OVER_TIME = /^(?:now|nowadays|these\s+days|currently|today|lately|since|recently|later|then|after\s+that)\b/i;
const FIRST_PERSON = /(?:^|[^\p{L}'’])(?:i|we)(?:['’]\p{L}+)?\s/iu;

export type Withdrawal = { claim: [number, number]; by: "other_person" | "own_denial" };

function claimBefore(text: string, at: number): [number, number] | null {
  const before = text.slice(0, at);
  const inSentence = before.search(/[^.!?;\n]*$/);
  if (before.slice(inSentence).replace(/\b(?:but|and|so)\s*$/i, "").trim().length > 0) return [inSentence, at];
  const prior = before.slice(0, inSentence).replace(/[.!?;\s]+$/, "");
  if (!prior.trim()) return null;
  return [prior.search(/[^.!?;\n]*$/), prior.length];
}

const stem = (word: string) => word.replace(/(ing|ings|ed|es|s)$/, "").replace(/e$/, "").replace(/(.)\1$/, "$1");
const IGNORED = new Set("that this those these with from they them their were have been actually honest honestly really just only also never didn does done doing myself partner brother sister uncle father mother friend coworker manager boss lead".split(" "));
const contentStems = (text: string) => new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(w => !IGNORED.has(w)).map(stem));

/** The activities a claim joins ("I operate the forklift and pack orders"), as spans. */
function conjuncts(text: string, [start, end]: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let from = start;
  for (const m of text.slice(start, end).matchAll(/,\s*(?:and\s+)?|\s+and\s+|;\s*/gi)) {
    out.push([from, start + m.index]);
    from = start + m.index + m[0].length;
  }
  out.push([from, end]);
  return out.filter(([s, e]) => text.slice(s, e).trim());
}

/** The own claims explicit corrections withdraw, narrowed to the corrected activity where the correction names one. */
export function withdrawnClaims(text: string): Withdrawal[] {
  const out: Withdrawal[] = [];
  for (const m of text.matchAll(MARKER)) {
    const rest = m[1].trim();
    if (!rest || OVER_TIME.test(rest)) continue;
    const by = TO_SOMEONE_ELSE.some(p => p.test(rest)) ? "other_person" : OWN_DENIAL.test(rest) ? "own_denial" : null;
    if (!by) continue;
    const markerAt = m.index + m[0].search(/\p{L}/u);
    const claim = claimBefore(text, markerAt);
    if (!claim || !FIRST_PERSON.test(text.slice(claim[0], claim[1]))) continue;
    const named = contentStems(rest);
    const parts = conjuncts(text, claim);
    const corrected = parts.filter(([s, e]) => [...contentStems(text.slice(s, e))].some(w => named.has(w)));
    if (parts.length > 1 && corrected.length > 0 && corrected.length < parts.length) for (const c of corrected) out.push({ claim: c, by });
    else out.push({ claim, by });
  }
  return out;
}

/** The text with withdrawn claims blanked (positions kept), for re-reading what is left. */
export function withoutWithdrawn(text: string, withdrawals: Withdrawal[]): string {
  let out = text;
  for (const { claim: [s, e] } of withdrawals) out = out.slice(0, s) + " ".repeat(e - s) + out.slice(e);
  return out;
}
