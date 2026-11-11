-- Exception review, behind a disabled-by-default flag. Local only until separately approved.
-- Answers gain a status and a stable question key. Events are append-only, and never hold an answer's text.
ALTER TYPE "ClarificationOutcome" ADD VALUE IF NOT EXISTS 'DENIED';
ALTER TYPE "ClarificationOutcome" ADD VALUE IF NOT EXISTS 'SKIPPED';
CREATE TYPE "ClarificationStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVOKED');

ALTER TABLE "CandidateClarification"
  ADD COLUMN "questionKey" VARCHAR(64),
  ADD COLUMN "coveredKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" "ClarificationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "supersedesId" UUID,
  ADD COLUMN "evidenceId" VARCHAR(60),
  ADD COLUMN "revokedAt" TIMESTAMPTZ(3);

-- A revoked or removed education entry can leave an answer without one, so its row's link can be empty.
ALTER TABLE "CandidateClarification" DROP CONSTRAINT "CandidateClarification_outcome_fields";
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_outcome_fields" CHECK (
  ("outcome"::text = 'ROLE_DETAIL_ADDED' AND "experienceId" IS NOT NULL AND "educationId" IS NULL AND "detail" IS NOT NULL)
  OR ("outcome"::text = 'ENTRY_ADDED' AND "experienceId" IS NULL)
  OR ("outcome"::text IN ('DECLINED', 'DENIED', 'SKIPPED') AND "experienceId" IS NULL AND "educationId" IS NULL AND "detail" IS NULL)
);
ALTER TABLE "CandidateClarification" DROP CONSTRAINT "CandidateClarification_educationId_fkey";
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_educationId_fkey" FOREIGN KEY ("educationId") REFERENCES "Education"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CandidateClarification_userId_questionKey_status_idx" ON "CandidateClarification"("userId", "questionKey", "status");

CREATE TABLE "ClarificationEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    -- Not a foreign key: this outlives a permanently deleted answer.
    "clarificationId" UUID,
    "savedJobId" UUID,
    "action" VARCHAR(20) NOT NULL,
    "questionKey" VARCHAR(64),
    "requirementText" VARCHAR(500),
    "verdictBefore" VARCHAR(30),
    "verdictAfter" VARCHAR(30),
    "rulesVersion" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClarificationEvent_userId_createdAt_idx" ON "ClarificationEvent"("userId", "createdAt");
CREATE INDEX "ClarificationEvent_savedJobId_createdAt_idx" ON "ClarificationEvent"("savedJobId", "createdAt");
ALTER TABLE "ClarificationEvent" ADD CONSTRAINT "ClarificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarificationEvent" ENABLE ROW LEVEL SECURITY;

-- A recheck after an answer is free and rules-only, so it doesn't use the analysis limits.
ALTER TABLE "AiAnalysisRun" ADD COLUMN "isRecheck" BOOLEAN NOT NULL DEFAULT false;
