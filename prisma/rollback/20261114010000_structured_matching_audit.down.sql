-- Rollback for 20261114010000_structured_matching_audit (Phase 5.3 Stage F1). Not a Prisma migration: run by hand, and
-- only with the same approval the forward migration needs. Removing the columns loses only audit values; the evidence
-- ids given to structured answers are harmless to keep (they only let masking and deletion find the answer), so they
-- stay. After running this, mark the migration rolled back: `prisma migrate resolve --rolled-back 20261114010000_structured_matching_audit`.
ALTER TABLE "JobMatchAnalysis" DROP CONSTRAINT IF EXISTS "JobMatchAnalysis_recognitionVersion_format";
ALTER TABLE "ClarificationEvent" DROP CONSTRAINT IF EXISTS "ClarificationEvent_recognitionVersion_format";
ALTER TABLE "JobMatchAnalysis" DROP COLUMN IF EXISTS "recognitionVersion";
ALTER TABLE "ClarificationEvent" DROP COLUMN IF EXISTS "recognitionVersion";
