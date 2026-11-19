-- CreateEnum
CREATE TYPE "AiBillingState" AS ENUM ('NONE', 'RESERVED', 'CONFIRMED', 'UNRESOLVED', 'RELEASED');

-- AlterTable
ALTER TABLE "AiAnalysisRun" ADD COLUMN     "billingState" "AiBillingState" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "cacheReadTokens" INTEGER,
ADD COLUMN     "cacheWriteTokens" INTEGER,
ADD COLUMN     "confirmedMicroUsd" INTEGER,
ADD COLUMN     "countsTowardLimit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "model" VARCHAR(60),
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "providerRequestId" VARCHAR(100),
ADD COLUMN     "reconciledAt" TIMESTAMPTZ(3),
ADD COLUMN     "reservedMicroUsd" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiCloudConsentVersion" INTEGER;

-- CreateIndex
CREATE INDEX "AiAnalysisRun_startedAt_billingState_idx" ON "AiAnalysisRun"("startedAt", "billingState");


-- Ledger integrity (added by hand). Amounts and token counts are never negative, and each
-- billing state carries exactly the amounts it means. A held state (RESERVED, UNRESOLVED) never
-- has a confirmed amount, so an estimate can never be read as a confirmed charge.
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_ledger_non_negative" CHECK (
  "reservedMicroUsd" >= 0
  AND ("confirmedMicroUsd" IS NULL OR "confirmedMicroUsd" >= 0)
  AND ("inputTokens" IS NULL OR "inputTokens" >= 0)
  AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
  AND ("cacheReadTokens" IS NULL OR "cacheReadTokens" >= 0)
  AND ("cacheWriteTokens" IS NULL OR "cacheWriteTokens" >= 0)
);
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_billing_state_consistent" CHECK (
  ("billingState" = 'NONE' AND "reservedMicroUsd" = 0 AND "confirmedMicroUsd" IS NULL)
  OR ("billingState" = 'RESERVED' AND "status" = 'STARTED' AND "reservedMicroUsd" > 0 AND "confirmedMicroUsd" IS NULL)
  OR ("billingState" = 'UNRESOLVED' AND "status" = 'FAILED' AND "reservedMicroUsd" > 0 AND "confirmedMicroUsd" IS NULL)
  OR ("billingState" = 'CONFIRMED' AND "status" <> 'STARTED' AND "confirmedMicroUsd" IS NOT NULL)
  OR ("billingState" = 'RELEASED' AND "status" = 'FAILED' AND "confirmedMicroUsd" IS NULL)
);
ALTER TABLE "AiAnalysisRun" ADD CONSTRAINT "AiAnalysisRun_reconciled_only_when_settled" CHECK (
  "reconciledAt" IS NULL OR "billingState" IN ('CONFIRMED', 'RELEASED')
);
ALTER TABLE "User" ADD CONSTRAINT "User_ai_consent_version_positive" CHECK (
  "aiCloudConsentVersion" IS NULL OR ("aiCloudConsentVersion" > 0 AND "aiCloudConsentAt" IS NOT NULL)
);
