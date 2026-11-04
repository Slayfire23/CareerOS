import type { EvidenceKind, Verdict } from "@/lib/ai/evidence";

// Typed evidence for the shadow pipeline (docs/MILESTONE_11_PROPOSAL.md). Nothing here decides a verdict a
// person sees: production still runs assessRequirements alone.

export type FrameKind = "skill" | "credential" | "education" | "employment_duration" | "employment" | "not_assessable";

export type RequirementFrame = {
  /** Hash of the index and text, so a claim can't move between requirements. */
  requirementId: string;
  index: number;
  text: string;
  /** Without text directed at an AI or reviewer. */
  qualificationText: string;
  kind: FrameKind;
  /** Every mandatory part. */
  pieces: string[];
  requiredMonths: number | null;
  /** "Several years": asks for time without saying how much. */
  timeUnstated: boolean;
  level: "advanced" | "intermediate" | null;
};

export type SourceField = "name" | "job_title" | "description" | "qualification" | "field_of_study" | "title" | "contribution" | "results" | "skills";

export type ClaimSource = {
  evidenceId: string;
  kind: EvidenceKind;
  field: SourceField;
  /** Position within a project's skills list; null for every other field. */
  itemIndex: number | null;
  /** UTF-16 offsets into the original stored string, never normalized text. */
  start: number;
  end: number;
  text: string;
  origin: "profile" | "candidate_answer";
  /** The only value: CareerOS has no independent verification. */
  verification: "self_reported";
};

export type Holder = "candidate" | "third_party" | "unknown";
export type Polarity = "positive" | "negative" | "uncertain";
export type Modality = "stated" | "planned" | "wish" | "hypothetical" | "pending" | "expired" | "in_progress" | "not_a_statement";
export type RelationshipKind = "exact" | "alias" | "curated_equivalent" | "curated_related" | "semantic_candidate" | "none";

export type CheckName = "span_verbatim" | "screen" | "ownership" | "assertion" | "sense" | "direct" | "credential" | "duration" | "level" | "all_pieces" | "semantic_scope";
export type RejectionReason =
  | "span_not_verbatim" | "directed_text" | "keyword_dump" | "claim_in_field" | "hidden_characters"
  | "third_party" | "negated" | "wish_or_plan" | "not_a_statement" | "other_sense" | "workplace_name"
  | "credential_not_held" | "credential_grade_differs" | "insufficient_time" | "impossible_dates"
  | "project_not_employment" | "title_only" | "mention_only" | "different_named_thing" | "different_credential" | "semantic_not_allowed";
export type UncertaintyReason = "semantic_only" | "ownership_unknown" | "ambiguous_sense" | "conflicting_evidence" | "time_unstated" | "part_of_requirement" | "level_not_shown" | "language_not_supported" | "model_unavailable";

export type ClaimCheck = { check: CheckName; passed: boolean; reason: RejectionReason | UncertaintyReason | null };

export type EvidenceClaim = {
  schemaVersion: "claim-v1";
  claimId: string;
  requirementId: string;
  source: ClaimSource;
  extracted: { type: "skill" | "action" | "credential" | "experience" | "education"; normalized: string | null };
  ownership: { holder: Holder; cueSpan: [number, number] | null };
  assertion: { polarity: Polarity; modality: Modality; cueSpan: [number, number] | null };
  time: { startMonth: string | null; endMonth: string | null; months: number | null; mergedMonths: number | null; dateQuality: "valid" | "impossible" | "missing" | "not_applicable" };
  relationship: { kind: RelationshipKind; target: string; sourceId: string | null; tableVersion: string | null; modelId: string | null; similarity: number | null };
  confidence: { level: "high" | "medium" | "low"; uncertainties: UncertaintyReason[] };
  validation: { status: "valid" | "rejected" | "needs_clarification"; checks: ClaimCheck[]; rejectionReasons: RejectionReason[] };
};

/** Which rule of the arbitration table decided, for tests and reports. */
export type ArbitrationRule = "not_assessable" | "stated_absent" | "credential_not_held" | "too_little_time" | "conflict" | "all_pieces_direct" | "partial_or_candidate" | "nothing_settles" | "deferred_to_rules";

export type ShadowResult = {
  frame: RequirementFrame;
  claims: EvidenceClaim[];
  /** What a person sees today, kept beside every proposal and never changed by it. */
  rulesOnly: Verdict;
  /** The arbitration table reading the claims, for comparing with the engine. */
  table: { verdict: Verdict; rule: ArbitrationRule };
  /** Rules plus reviewed curated names. */
  withCurated: Verdict;
  /** withCurated, plus semantic evidence moving Not enough information to Possible, if ever approved. */
  proposed: Verdict;
  semanticStatus: "used" | "unavailable" | "not_eligible";
};
