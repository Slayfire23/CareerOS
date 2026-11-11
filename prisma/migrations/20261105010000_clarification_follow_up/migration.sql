-- Follow-up questions, behind a disabled-by-default flag. Local only until separately approved.
-- Holds offsets into the answer, not its words. A reply's words are removed by permanent deletion.
CREATE TYPE "FollowUpStatus" AS ENUM ('PROPOSED', 'ANSWERED', 'DENIED', 'SKIPPED', 'REVOKED', 'CLOSED');

CREATE TABLE "ClarificationFollowUp" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clarificationId" UUID NOT NULL,
    "savedJobId" UUID,
    "experienceId" UUID NOT NULL,
    "questionKey" VARCHAR(64) NOT NULL,
    "requirementText" VARCHAR(500) NOT NULL,
    "quoteStart" INTEGER NOT NULL,
    "quoteEnd" INTEGER NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PROPOSED',
    "detail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClarificationFollowUp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClarificationFollowUp_userId_questionKey_key" ON "ClarificationFollowUp"("userId", "questionKey");
CREATE INDEX "ClarificationFollowUp_clarificationId_idx" ON "ClarificationFollowUp"("clarificationId");
CREATE INDEX "ClarificationFollowUp_savedJobId_idx" ON "ClarificationFollowUp"("savedJobId");
ALTER TABLE "ClarificationFollowUp" ADD CONSTRAINT "ClarificationFollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarificationFollowUp" ADD CONSTRAINT "ClarificationFollowUp_clarificationId_fkey" FOREIGN KEY ("clarificationId") REFERENCES "CandidateClarification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarificationFollowUp" ENABLE ROW LEVEL SECURITY;
