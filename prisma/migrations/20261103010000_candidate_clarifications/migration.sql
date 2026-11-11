-- A person's answers to targeted questions about a requirement, kept with where they came from.
-- A role detail is evidence in its own right; an added education entry points back here. Nothing in this
-- table says anything was independently checked: every answer is self-reported.
CREATE TYPE "ClarificationOutcome" AS ENUM ('ROLE_DETAIL_ADDED', 'ENTRY_ADDED', 'DECLINED');

CREATE TABLE "CandidateClarification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "savedJobId" UUID,
    "requirementText" VARCHAR(500) NOT NULL,
    "outcome" "ClarificationOutcome" NOT NULL,
    "experienceId" UUID,
    "educationId" UUID,
    "detail" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateClarification_pkey" PRIMARY KEY ("id"),
    -- Each outcome carries exactly what it means, so an answer can't exist without its specifics.
    CONSTRAINT "CandidateClarification_outcome_fields" CHECK (
      ("outcome" = 'ROLE_DETAIL_ADDED' AND "experienceId" IS NOT NULL AND "educationId" IS NULL AND "detail" IS NOT NULL)
      OR ("outcome" = 'ENTRY_ADDED' AND "educationId" IS NOT NULL AND "experienceId" IS NULL AND "detail" IS NULL)
      OR ("outcome" = 'DECLINED' AND "experienceId" IS NULL AND "educationId" IS NULL AND "detail" IS NULL)
    )
);

CREATE INDEX "CandidateClarification_userId_createdAt_idx" ON "CandidateClarification"("userId", "createdAt");
CREATE INDEX "CandidateClarification_savedJobId_idx" ON "CandidateClarification"("savedJobId");
CREATE INDEX "CandidateClarification_experienceId_idx" ON "CandidateClarification"("experienceId");
CREATE INDEX "CandidateClarification_educationId_idx" ON "CandidateClarification"("educationId");

ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_savedJobId_fkey" FOREIGN KEY ("savedJobId") REFERENCES "SavedJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "ProfessionalExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_educationId_fkey" FOREIGN KEY ("educationId") REFERENCES "Education"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- As with every table: browser Data API access stays denied, and Prisma connects as the owner.
ALTER TABLE "CandidateClarification" ENABLE ROW LEVEL SECURITY;
