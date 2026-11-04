import { createHash } from "node:crypto";
import { citationOrigin, roleMonths, type Evidence, type ExperienceEvidence, type MatchRequest } from "@/lib/ai/evidence";
import { CURATED_VERSION, curatedFor } from "@/lib/ai/claims/curated";
import { check, checkAssertion, checkCredential, checkDuration, checkOwnership, checkSense, looksLikeList, screenText } from "@/lib/ai/claims/checks";
import type { ClaimCheck, EvidenceClaim, RejectionReason, RelationshipKind, RequirementFrame, SourceField, UncertaintyReason } from "@/lib/ai/claims/types";
import { fieldValue } from "@/lib/ai/claims/validate";
import { covers, durationField, sameSkill, titleCoverage } from "@/lib/ai/rules/engine";
import { TERMINOLOGY_VERSION, VOCABULARY, canonicalTerms, directUse, occurrences, relation, sentenceAt, surfaceForms, words } from "@/lib/ai/skill-relations";
import { fullRoleTitle, plainTitle, rolePart } from "@/lib/ai/rules/profile-fields";

// Every occurrence of what's asked becomes its own claim with exact offsets, so what's cited is always
// what was judged. Claims that fail a check are kept, with reasons, and never cited as support.

type FieldRef = { item: Evidence; field: SourceField; itemIndex: number | null; value: string };

export function fieldsOf(item: Evidence): FieldRef[] {
  const named: [SourceField, number | null][] = item.kind === "skill" ? [["name", null]]
    : item.kind === "experience" ? [["job_title", null], ["description", null]]
    : item.kind === "education" ? [["qualification", null], ["field_of_study", null], ["description", null]]
    : [["title", null], ["description", null], ["contribution", null], ["results", null], ...item.skills.map((_, i): [SourceField, number] => ["skills", i])];
  return named.flatMap(([field, itemIndex]) => {
    const value = fieldValue(item, field, itemIndex);
    return value ? [{ item, field, itemIndex, value }] : [];
  });
}

const STOP = new Set(words("experience experienced knowledge proficiency proficient familiarity required preferred ability strong solid good excellent work working with in of and or the a an for to on at years year months month"));
type Form = { form: string; kind: RelationshipKind; sourceId: string | null; tableVersion: string | null; target: string };

/** Every wording that counts for this piece, most specific first: the words asked, table aliases, then curated names. */
function formsFor(piece: string): Form[] {
  const forms = new Map<string, Form>();
  const add = (form: string, kind: RelationshipKind, sourceId: string | null, tableVersion: string | null) => {
    const key = form.toLowerCase();
    if (form.length >= 2 && !forms.has(key)) forms.set(key, { form, kind, sourceId, tableVersion, target: piece });
  };
  for (const term of canonicalTerms(piece)) {
    if (STOP.has(term)) continue;
    if (VOCABULARY.has(term)) {
      const written = surfaceForms(term);
      for (const form of written) add(form, words(piece).join(" ").includes(words(form).join(" ")) ? "exact" : "alias", `table:${term}`, TERMINOLOGY_VERSION);
    } else add(term, "exact", null, null);
  }
  for (const group of curatedFor(piece)) {
    for (const name of group.same) add(name, "curated_equivalent", `curated:${group.canonical}`, CURATED_VERSION);
    for (const name of group.related) add(name, "curated_related", `curated:${group.canonical}`, CURATED_VERSION);
  }
  return [...forms.values()].sort((a, b) => b.form.length - a.form.length);
}

/** Every term of a longer requirement sits close together in the sentence. */
function termsClose(piece: string, line: string): boolean {
  const wanted = [...canonicalTerms(piece)].filter(t => !STOP.has(t));
  if (wanted.length < 2) return true;
  const tokens = words(line);
  const places = wanted.map(t => tokens.indexOf(t)).filter(i => i >= 0);
  if (places.length < wanted.length) return true; // terms named another way are judged elsewhere
  return Math.max(...places) - Math.min(...places) <= wanted.length + 2;
}

const claimId = (frame: RequirementFrame, ref: FieldRef, start: number, end: number, kind: string) =>
  `clm_${createHash("sha256").update(`${frame.requirementId}\u0000${ref.item.id}\u0000${ref.field}\u0000${ref.itemIndex}\u0000${start}\u0000${end}\u0000${kind}`, "utf8").digest("hex").slice(0, 16)}`;

function timeOf(item: Evidence, asOf: string, mergedMonths: number | null): EvidenceClaim["time"] {
  if (item.kind !== "experience") return { startMonth: null, endMonth: null, months: null, mergedMonths: null, dateQuality: "not_applicable" };
  const months = roleMonths(item, asOf);
  return { startMonth: item.start_month, endMonth: item.end_month, months, mergedMonths, dateQuality: months === 0 ? "impossible" : "valid" };
}

function build(frame: RequirementFrame, ref: FieldRef, start: number, end: number, form: Form, asOf: string, options: { checks: ClaimCheck[]; uncertainties?: UncertaintyReason[]; mergedMonths?: number | null; similarity?: number | null; modelId?: string | null }): EvidenceClaim {
  const { value, item } = ref;
  const text = value.slice(start, end);
  const assertion = checkAssertion(value, ref.field, start, end);
  const ownership = checkOwnership(value, ref.field, start, end);
  // "Excel: never used it" is a plain statement of absence, whatever its punctuation.
  const screen = assertion.polarity === "negative" && ref.field === "name" ? null : screenText(value, ref.field, start, end);
  const sense = form.kind === "semantic_candidate" ? null : checkSense(frame.qualificationText, value, text, ref.field, item.kind === "experience" && ref.field === "job_title" ? item.job_title : null);
  const checks: ClaimCheck[] = [
    check("span_verbatim", value.slice(start, end) === text ? null : "span_not_verbatim"),
    check("screen", screen),
    check("assertion", assertion.reason),
    check("ownership", ownership.holder === "third_party" ? "third_party" : null),
    check("sense", sense),
    ...options.checks,
  ];
  const rejectionReasons = checks.filter((c): c is ClaimCheck & { reason: RejectionReason } => !c.passed && c.check !== "all_pieces" && c.check !== "level" && c.reason !== null).map(c => c.reason);
  const uncertainties = [...(options.uncertainties ?? []), ...checks.filter(c => !c.passed && (c.check === "all_pieces" || c.check === "level")).map(c => c.reason as UncertaintyReason)];
  const semantic = form.kind === "semantic_candidate";
  const status = rejectionReasons.length ? "rejected" : semantic || form.kind === "curated_related" || form.kind === "partial_title" || uncertainties.length ? "needs_clarification" : "valid";
  return {
    schemaVersion: "claim-v1",
    claimId: claimId(frame, ref, start, end, form.kind),
    requirementId: frame.requirementId,
    source: { evidenceId: item.id, kind: item.kind, field: ref.field, itemIndex: ref.itemIndex, start, end, text, origin: citationOrigin(item, text), verification: "self_reported" },
    extracted: { type: ref.field === "job_title" ? "experience" : item.kind === "skill" ? (frame.kind === "credential" ? "credential" : "skill") : item.kind === "education" ? "education" : "action", normalized: form.sourceId },
    ownership,
    assertion: { polarity: assertion.polarity, modality: screen === "not_a_statement" ? "not_a_statement" : assertion.modality, cueSpan: assertion.cueSpan },
    time: timeOf(item, asOf, options.mergedMonths ?? null),
    relationship: { kind: form.kind, target: form.target, sourceId: form.sourceId, tableVersion: form.tableVersion, modelId: options.modelId ?? null, similarity: options.similarity ?? null },
    confidence: { level: status === "valid" ? "high" : status === "needs_clarification" ? "medium" : "low", uncertainties },
    validation: { status, checks, rejectionReasons },
  };
}

/** Free-text mentions and listed names of what a skill or credential requirement asks for. */
function textClaims(request: MatchRequest, frame: RequirementFrame): EvidenceClaim[] {
  const claims = new Map<string, EvidenceClaim>();
  const credential = frame.kind === "credential";
  for (const piece of frame.pieces) {
    const forms = formsFor(piece);
    for (const item of request.evidence) {
      for (const ref of fieldsOf(item)) {
        const taken: [number, number][] = [];
        for (const form of forms) {
          for (const start of occurrences(ref.value, form.form)) {
            const end = start + form.form.length;
            // The longest wording at a place speaks for it: "drywall finishing" isn't also "drywall".
            if (taken.some(([s, e]) => s < end && start < e)) continue;
            taken.push([start, end]);
            const extra: ClaimCheck[] = [];
            const uncertainties: UncertaintyReason[] = [];
            const line = sentenceAt(ref.value, start, end);
            const structured = ref.field === "name" || ref.field === "qualification" || ref.field === "skills";
            if (credential) extra.push(check("credential", checkCredential(frame.qualificationText, item, request.as_of_month, ref.value, structured)));
            if (credential && structured && !covers(frame.qualificationText, ref.value) && form.kind !== "curated_equivalent") extra.push(check("credential", "different_credential"));
            if ((frame.requiredMonths !== null || frame.timeUnstated) && item.kind === "project") extra.push(check("duration", "project_not_employment"));
            if (ref.field === "job_title" || ref.field === "title") extra.push(check("direct", "title_only"));
            else if (ref.field === "description" || ref.field === "contribution" || ref.field === "results") {
              if (ref.field !== "description" || !directUse(ref.value, ref.value.slice(start, end), false, start)) extra.push(check("direct", "mention_only"));
              if (looksLikeList(ref.value, start, end)) extra.push(check("direct", "mention_only"));
            }
            const named = form.kind === "curated_equivalent" || form.kind === "curated_related";
            // The engine's own reading of a listed skill: "Go (board game)" isn't the language.
            if (ref.field === "name" && !credential && !named && !sameSkill(piece, ref.value)) extra.push({ check: "all_pieces", passed: false, reason: "part_of_requirement" });
            // Words scattered through a sentence aren't the phrase: "butter churn" and "ran analysis".
            if ((ref.field === "description" || ref.field === "contribution" || ref.field === "results") && !named && !termsClose(piece, line)) extra.push({ check: "all_pieces", passed: false, reason: "part_of_requirement" });
            if (!named && !covers(piece, ref.field === "description" || ref.field === "contribution" || ref.field === "results" ? line : ref.value)) {
              extra.push({ check: "all_pieces", passed: false, reason: "part_of_requirement" });
            }
            if (frame.level) uncertainties.push("level_not_shown");
            if (frame.requiredMonths !== null || frame.timeUnstated) uncertainties.push("time_unstated");
            const claim = build(frame, ref, start, end, form, request.as_of_month, { checks: extra, uncertainties });
            if (!claims.has(claim.claimId)) claims.set(claim.claimId, claim);
          }
        }
      }
    }
  }
  return [...claims.values()];
}

/** Roles in the field, with time computed from their dates. */
function employmentClaims(request: MatchRequest, frame: RequirementFrame): EvidenceClaim[] {
  const roles = request.evidence.filter((e): e is ExperienceEvidence => e.kind === "experience");
  const field = durationField(frame.qualificationText);
  const inField = roles.filter(r => plainTitle(r.job_title) && fullRoleTitle(r.job_title) && titleCoverage(field, r.job_title) === "full");
  const partly = roles.filter(r => plainTitle(r.job_title) && titleCoverage(field, r.job_title) !== "none");
  const { merged, reason } = checkDuration(frame.requiredMonths, inField.length ? inField : partly, request.as_of_month);
  const claims = roles.flatMap((role): EvidenceClaim[] => {
    const found = plainTitle(role.job_title) ? titleCoverage(field, role.job_title) : "none";
    const coverage = found === "full" && !fullRoleTitle(role.job_title) ? "some" : found;
    // Only the engine's own reading of the title counts: a shared first few letters isn't a lead.
    if (coverage === "none") return [];
    const ref: FieldRef = { item: role, field: "job_title", itemIndex: null, value: role.job_title };
    const part = rolePart(role.job_title);
    const form: Form = { form: role.job_title, kind: coverage === "full" ? "exact" : "partial_title", sourceId: null, tableVersion: null, target: frame.qualificationText };
    const dates = roleMonths(role, request.as_of_month) === 0 ? "impossible_dates" : null;
    const checks = [check("duration", dates ?? (coverage === "full" || !inField.length ? reason : null))];
    if (coverage !== "full" && part !== role.job_title) checks.push(check("sense", "workplace_name"));
    return [build(frame, ref, 0, role.job_title.length, form, request.as_of_month, { checks, mergedMonths: merged, uncertainties: frame.timeUnstated ? ["time_unstated"] : [] })];
  });
  return claims;
}

export function extractClaims(request: MatchRequest, frame: RequirementFrame): EvidenceClaim[] {
  switch (frame.kind) {
    case "skill":
    case "credential": return textClaims(request, frame);
    case "employment_duration":
    case "employment": {
      // A technology named in an experience requirement can also be shown by what a role says it did.
      const hasTechnology = [...canonicalTerms(frame.qualificationText)].some(t => VOCABULARY.has(t));
      return [...employmentClaims(request, frame), ...(hasTechnology ? textClaims(request, frame).map(c => ({ ...c, confidence: { ...c.confidence } })) : [])];
    }
    case "education": return [];
    case "not_assessable": return [];
  }
}

export { relation as tableRelation };
