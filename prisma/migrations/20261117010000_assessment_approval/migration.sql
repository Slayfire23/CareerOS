-- V1 (owner decision D4): AssessmentApproval, the owner's final, append-only approval of one analysis. Additive only:
-- one new table and one unique index on JobMatchAnalysis (id is already unique, so it can't fail on existing rows).
-- CreateTable
CREATE TABLE "AssessmentApproval" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "savedJobId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "methodVersion" VARCHAR(40) NOT NULL,
    "requirementsVersion" INTEGER NOT NULL,
    "profileFingerprint" CHAR(64) NOT NULL,
    "feedbackVersion" INTEGER NOT NULL,
    "decisions" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "note" VARCHAR(1000),

    CONSTRAINT "AssessmentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentApproval_userId_approvedAt_idx" ON "AssessmentApproval"("userId", "approvedAt");

-- CreateIndex
CREATE INDEX "AssessmentApproval_analysisId_idx" ON "AssessmentApproval"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentApproval_savedJobId_version_key" ON "AssessmentApproval"("savedJobId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchAnalysis_id_savedJobId_userId_key" ON "JobMatchAnalysis"("id", "savedJobId", "userId");

-- AddForeignKey
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_savedJobId_userId_fkey" FOREIGN KEY ("savedJobId", "userId") REFERENCES "SavedJob"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_analysisId_savedJobId_userId_fkey" FOREIGN KEY ("analysisId", "savedJobId", "userId") REFERENCES "JobMatchAnalysis"("id", "savedJobId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security, as on every table: no policies, so the browser Data API stays denied; Prisma connects as the owner.
ALTER TABLE "AssessmentApproval" ENABLE ROW LEVEL SECURITY;

-- Shapes and formats the application relies on.
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_version_positive" CHECK ("version" >= 1);
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_json_shapes" CHECK (
  jsonb_typeof("decisions") = 'array' AND jsonb_array_length("decisions") >= 1 AND jsonb_typeof("summary") = 'object'
);
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_fingerprint_hex" CHECK ("profileFingerprint" ~ '^[0-9a-f]{64}$');
ALTER TABLE "AssessmentApproval" ADD CONSTRAINT "AssessmentApproval_feedback_version" CHECK ("feedbackVersion" >= 0);
