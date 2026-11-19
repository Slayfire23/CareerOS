-- Structured matching audit (Phase 5.3 Stage F1, decision F-8). Local only until separately approved for production,
-- which needs the Stage 1 migration (20261110010000_structured_ownership) first.
-- Additive: two nullable columns with format checks, and an idempotent evidence id for structured answers.
-- No existing analysis or event is rewritten or recalculated: NULL means "no split recognition was used", which is
-- true of every row written before Stage F.

-- AlterTable
ALTER TABLE "ClarificationEvent" ADD COLUMN     "recognitionVersion" VARCHAR(20);

-- AlterTable
ALTER TABLE "JobMatchAnalysis" ADD COLUMN     "recognitionVersion" VARCHAR(20);

-- Hand-written additions (reviewed).

-- The recognition version, when there is one, is a split-recognition version such as "splits-v1.1".
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_recognitionVersion_format"
  CHECK ("recognitionVersion" IS NULL OR "recognitionVersion" ~ '^splits-v[0-9]+(\.[0-9]+)*$');
ALTER TABLE "ClarificationEvent" ADD CONSTRAINT "ClarificationEvent_recognitionVersion_format"
  CHECK ("recognitionVersion" IS NULL OR "recognitionVersion" ~ '^splits-v[0-9]+(\.[0-9]+)*$');

-- Structured answers (formVersion 2) get the evidence id every free-text answer has, so revoking, correcting or deleting
-- one masks anything that cites it. A "haven't done this" answer (DENIED) has none, like a free-text denial.
-- Idempotent; rows that already have an id keep it. Matching still ignores formVersion 2: this changes no verdict.
UPDATE "CandidateClarification" SET "evidenceId" = 'experience:' || "id"
  WHERE "formVersion" = 2 AND "outcome" = 'ROLE_DETAIL_ADDED' AND "evidenceId" IS NULL;
