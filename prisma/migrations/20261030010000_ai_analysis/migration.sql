-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiCloudConsentAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "AiAnalysisRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "savedJobId" UUID,
    "status" "AiAnalysisStatus" NOT NULL DEFAULT 'STARTED',
    "provider" VARCHAR(40) NOT NULL,
    "errorCode" VARCHAR(60),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AiAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatchAnalysis" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "savedJobId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "requirementsVersion" INTEGER NOT NULL,
    "profileFingerprint" CHAR(64) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(100),
    "methodVersion" VARCHAR(40) NOT NULL,
    "requirements" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "verdictCounts" JSONB NOT NULL,
    "feedback" JSONB NOT NULL DEFAULT '{}',
    "feedbackVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAnalysisRun_userId_startedAt_idx" ON "AiAnalysisRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "AiAnalysisRun_savedJobId_startedAt_idx" ON "AiAnalysisRun"("savedJobId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiAnalysisRun_id_userId_key" ON "AiAnalysisRun"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchAnalysis_runId_key" ON "JobMatchAnalysis"("runId");

-- CreateIndex
CREATE INDEX "JobMatchAnalysis_savedJobId_createdAt_idx" ON "JobMatchAnalysis"("savedJobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobMatchAnalysis_userId_createdAt_idx" ON "JobMatchAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchAnalysis_runId_userId_key" ON "JobMatchAnalysis"("runId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_id_userId_key" ON "SavedJob"("id", "userId");

-- AddForeignKey
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_savedJobId_fkey" FOREIGN KEY ("savedJobId") REFERENCES "SavedJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_savedJobId_userId_fkey" FOREIGN KEY ("savedJobId", "userId") REFERENCES "SavedJob"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_runId_userId_fkey" FOREIGN KEY ("runId", "userId") REFERENCES "AiAnalysisRun"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written additions (reviewed). All additive; existing rows are unaffected.

-- Same posture as every other table: RLS on with no client policies, so the browser Data API
-- cannot read or write these tables. Prisma connects as the table owner, which bypasses RLS.
ALTER TABLE "AiAnalysisRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobMatchAnalysis" ENABLE ROW LEVEL SECURITY;

-- A run is either still running, or finished with a finish time. Only failed runs carry an error code.
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_status_consistent" CHECK (
  ("status" = 'STARTED' AND "finishedAt" IS NULL AND "errorCode" IS NULL)
  OR ("status" = 'SUCCEEDED' AND "finishedAt" IS NOT NULL AND "errorCode" IS NULL)
  OR ("status" = 'FAILED' AND "finishedAt" IS NOT NULL AND "errorCode" IS NOT NULL)
);
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_error_code_format" CHECK ("errorCode" IS NULL OR "errorCode" ~ '^[a-z_]{1,60}$');

-- Stored JSON must have the expected top-level shape.
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_json_shapes" CHECK (
  jsonb_typeof("requirements") = 'array'
  AND jsonb_typeof("findings") = 'array'
  AND jsonb_typeof("verdictCounts") = 'object'
  AND jsonb_typeof("feedback") = 'object'
);
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_fingerprint_hex" CHECK ("profileFingerprint" ~ '^[0-9a-f]{64}$');
