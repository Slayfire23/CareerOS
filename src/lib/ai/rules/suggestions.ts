import type { Evidence, MatchRequest, MatchRequirement } from "@/lib/ai/evidence";
import { quoteIsVerbatim } from "@/lib/ai/evidence";
import { namesOfListedSkills } from "@/lib/ai/listed-skills";
import { requiredMonths, type Citation, type Finding, type Suggestion } from "@/lib/ai/match-validation";
import { listedTerms, namesAnItem, parseRequirement, untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import { plainTitle } from "@/lib/ai/rules/profile-fields";
import { canonicalTerms, hasQualificationWords, isDistinctPair, isKnownTechnology, ordinaryMeaning, otherSense, plainSkillName, quoteTerms, relation, words } from "@/lib/ai/skill-relations";
import { quoteInTrustedText } from "@/lib/ai/untrusted-text";

// AI suggestions: local AI only points at things. Code decides which pointers are worth showing and
// writes every word shown. Suggestions live in a separate column and never reach a verdict, a count,
// or a score: the analysis is saved before local AI is even asked, and this code only ever adds to
// that separate list.
//
// A pointer is dropped when:
// - the quote isn't verbatim from the cited entry, or comes from text aimed at an evaluator, a title
//   or skill name carrying a claim, or education;
// - the word is being used in its ordinary sense (Java the island, a ball python);
// - it names a technology the reviewed table knows and doesn't relate to the requirement. Only the
//   table can say two known technologies are connected, so Bash is never "another name" for Terraform
//   and JavaScript never one for Java;
// - it suggests a missing term the requirement doesn't name, or the profile already lists.

export const ASSIST_PROMPT_VERSION = "assist-v2";
export const MAX_SUGGESTIONS_PER_REQUIREMENT = 3;
const MAX_QUOTE_WORDS = 12;
const REMOVED = "[instruction-like text removed]";

export type SuggestEvidence =
  | { id: string; kind: "skill"; name: string }
  | { id: string; kind: "experience"; job_title: string | null; description: string | null }
  | { id: string; kind: "project"; title: string | null; description: string | null; contribution: string | null; results: string | null; skills: string[] };
export type SuggestRequest = { request_id: string; requirements: { index: number; text: string }[]; evidence: SuggestEvidence[] };

export type Rejected =
  | "invalid_kind" | "unknown_evidence" | "quote_not_verbatim" | "untrusted_text" | "long_quote" | "no_new_information"
  | "ordinary_word" | "table_says_unrelated" | "no_connection" | "term_not_in_requirement" | "term_already_listed";

/** Suggestions help where the rules didn't settle a skill question. Hard qualifications, durations,
 * and requirements awaiting confirmation never go to local AI. */
export function sendableRequirements(request: MatchRequest, findings: Pick<Finding, "requirementIndex" | "verdict" | "review">[]): MatchRequirement[] {
  const byIndex = new Map(findings.map(f => [f.requirementIndex, f]));
  return request.requirements.filter(r => {
    const f = byIndex.get(r.index);
    return !!f && f.verdict !== "supported" && !f.review && r.category !== "Education"
      && requiredMonths(r.text) === null && !hasQualificationWords(r.text);
  });
}

function masked(text: string | null): string | null {
  if (!text) return null;
  let result = "";
  let cursor = 0;
  for (const [start, end] of untrustedEvidenceSpans(text)) {
    if (start < cursor) continue;
    result += text.slice(cursor, start) + REMOVED;
    cursor = end;
  }
  return result + text.slice(cursor);
}

/** What local AI may see: what each requirement requests, and skills, roles, and projects with any
 * remark or claim removed. No dates, education, or skill levels, by construction of this type. */
export function buildSuggestRequest(request: MatchRequest, requirements: MatchRequirement[], requestId: string): SuggestRequest {
  const listed = listedTerms(namesOfListedSkills(request.evidence));
  const evidence: SuggestEvidence[] = [];
  for (const item of request.evidence) {
    if (item.kind === "skill") {
      if (plainSkillName(item.name)) evidence.push({ id: item.id, kind: "skill", name: item.name });
    } else if (item.kind === "experience") {
      evidence.push({ id: item.id, kind: "experience", job_title: plainTitle(item.job_title) ? item.job_title : null, description: masked(item.description) });
    } else if (item.kind === "project") {
      evidence.push({
        id: item.id, kind: "project", title: plainTitle(item.title) ? item.title : null, description: masked(item.description),
        contribution: masked(item.contribution), results: masked(item.results), skills: item.skills.filter(plainSkillName),
      });
    }
  }
  return {
    request_id: requestId,
    requirements: requirements.map(r => {
      const structure = parseRequirement(r.text, listed, r.confirmed === true);
      return { index: r.index, text: structure.creditText || r.text };
    }),
    evidence,
  };
}

/** Where a quote may come from: a clean structured field, or trusted parts of free text (returned). */
function quoteSource(item: Evidence, quote: string): { allowed: boolean; freeText: string | null } {
  if (item.kind === "skill") return { allowed: plainSkillName(item.name) && item.name.includes(quote), freeText: null };
  if (item.kind === "education") return { allowed: false, freeText: null };
  const [structured, free] = item.kind === "experience"
    ? [plainTitle(item.job_title) ? [item.job_title] : [], [item.description]]
    : [[...(plainTitle(item.title) ? [item.title] : []), ...item.skills.filter(plainSkillName)], [item.description, item.contribution, item.results]];
  if (structured.some(f => f.includes(quote))) return { allowed: true, freeText: null };
  const field = free.find(f => f && f.includes(quote) && quoteInTrustedText(f, quote, untrustedEvidenceSpans(f)));
  return field ? { allowed: true, freeText: field } : { allowed: false, freeText: null };
}

export type Pointer = { requirement_index?: unknown; kind?: unknown; evidence_id?: unknown; quote?: unknown; term?: unknown };

/** Turn one local-AI pointer into a suggestion with code-written wording, or say why not. */
export function checkPointer(requirement: MatchRequirement, target: string, pointer: Pointer, evidence: Map<string, Evidence>, alreadyCited: Set<string>): Suggestion | Rejected {
  if (pointer.kind === "missing_from_profile") {
    const term = typeof pointer.term === "string" ? pointer.term.trim() : "";
    if (term.length < 2 || term.length > 100 || !target.toLowerCase().includes(term.toLowerCase())) return "term_not_in_requirement";
    if (!namesAnItem(term) || !plainSkillName(term)) return "term_not_in_requirement";
    if ([...evidence.values()].some(e => e.kind === "skill" && plainSkillName(e.name) && relation(term, e.name) === "same")) return "term_already_listed";
    return {
      requirementIndex: requirement.index, kind: "profile_gap", term, citation: null, knownToRules: false,
      text: `“${term}” isn't in your profile. If you have it, add it and run the analysis again.`,
    };
  }
  if (pointer.kind !== "possible_connection") return "invalid_kind";
  const cited = typeof pointer.evidence_id === "string" ? evidence.get(pointer.evidence_id) : undefined;
  const quote = pointer.quote;
  if (!cited || typeof quote !== "string") return "unknown_evidence";
  if (quote.length < 1 || quote.length > 300 || !quoteIsVerbatim(cited, quote)) return "quote_not_verbatim";
  if (words(quote).length > MAX_QUOTE_WORDS) return "long_quote";
  const { allowed, freeText } = quoteSource(cited, quote);
  if (!allowed) return "untrusted_text";
  if (alreadyCited.has(`${cited.id}\u0000${quote}`)) return "no_new_information"; // the verified result already uses it

  const citation: Citation = { evidenceId: cited.id, quote };
  const named = `“${quote}”`;
  const base = { requirementIndex: requirement.index, citation, term: null };
  const wanted = canonicalTerms(target);
  const found = canonicalTerms(quote);

  // The same word in its ordinary meaning: the island, the animal, the season, the verb.
  if (freeText !== null) {
    const kept = quoteTerms(quote, freeText);
    for (const term of found) if (wanted.has(term) && (!kept.has(term) || ordinaryMeaning(freeText, term))) return "ordinary_word";
  }
  for (const a of wanted) for (const b of found) if (isDistinctPair(a, b)) return "table_says_unrelated";
  for (const term of found) if (wanted.has(term) && otherSense(target, term) !== otherSense(freeText ?? cited.kind, term)) return "ordinary_word";

  const strength = relation(target, quote, freeText);
  if (strength === "same") return { ...base, kind: "relevant_evidence", knownToRules: true, text: `Your profile mentions ${named}. Check whether it shows this. It doesn't change the result.` };
  if (strength === "related") return { ...base, kind: "related_technology", knownToRules: true, text: `${named} is a related technology. It doesn't change the result.` };

  // Unrelated by the table. A technology it knows has its own identity, so no pointer can connect it.
  if ([...found].some(isKnownTechnology)) return "table_says_unrelated";
  const isName = cited.kind === "skill" || (cited.kind === "project" && cited.skills.includes(quote));
  // Free text must share something with the requirement: a model's hunch alone isn't worth showing.
  if (!isName && ![...found].some(a => [...wanted].some(b => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))))))) return "no_connection";
  if (isName) return { ...base, kind: "alternate_name", knownToRules: false, text: `${named} might be another name for this, or related. Not verified, so please review it.` };
  return { ...base, kind: "relevant_evidence", knownToRules: false, text: `${named} in your profile might be relevant. Not verified, so please review it.` };
}

export type CheckedSuggestions = { suggestions: Suggestion[]; rejected: Partial<Record<Rejected, number>> };

/** Check every pointer against the person's own profile, however it was produced. */
export function checkPointers(request: MatchRequest, sent: MatchRequirement[], findings: Finding[], pointers: unknown[]): CheckedSuggestions {
  const evidence = new Map(request.evidence.map(e => [e.id, e]));
  const listed = listedTerms(namesOfListedSkills(request.evidence));
  const requirements = new Map(sent.map(r => [r.index, r]));
  const suggestions: Suggestion[] = [];
  const rejected: Partial<Record<Rejected, number>> = {};
  const counts = new Map<number, number>();
  const seen = new Set<string>();
  for (const raw of pointers) {
    if (typeof raw !== "object" || raw === null) continue;
    const pointer = raw as Pointer;
    const requirement = requirements.get(pointer.requirement_index as number);
    if (!requirement) continue; // only what was asked about can get a suggestion
    const finding = findings.find(f => f.requirementIndex === requirement.index);
    const cited = new Set((finding?.citations ?? []).map(c => `${c.evidenceId}\u0000${c.quote}`));
    const target = parseRequirement(requirement.text, listed, requirement.confirmed === true).creditText;
    const checked = checkPointer(requirement, target, pointer, evidence, cited);
    if (typeof checked === "string") {
      rejected[checked] = (rejected[checked] ?? 0) + 1;
      continue;
    }
    const key = `${checked.requirementIndex}\u0000${checked.kind}\u0000${checked.term}\u0000${checked.citation?.evidenceId}\u0000${checked.citation?.quote}`;
    const count = counts.get(requirement.index) ?? 0;
    if (seen.has(key) || count >= MAX_SUGGESTIONS_PER_REQUIREMENT) continue;
    seen.add(key);
    counts.set(requirement.index, count + 1);
    suggestions.push(checked);
  }
  return { suggestions, rejected };
}

/** A response from the local bridge, with a strict shape. Anything else means no suggestions. */
export function parseSuggestResponse(raw: unknown, requestId: string, model: string) {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  if (body.request_id !== requestId || body.model !== model) return null;
  if (body.ai_assist !== "used" && body.ai_assist !== "unavailable") return null;
  if (!Array.isArray(body.pointers) || body.pointers.length > 500) return null;
  const usage = body.usage as { input_tokens?: unknown; output_tokens?: unknown } | null | undefined;
  const tokens = usage && Number.isSafeInteger(usage.input_tokens) && Number.isSafeInteger(usage.output_tokens)
    ? { inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number }
    : null;
  return { aiAssist: body.ai_assist, pointers: body.pointers as unknown[], tokens };
}
