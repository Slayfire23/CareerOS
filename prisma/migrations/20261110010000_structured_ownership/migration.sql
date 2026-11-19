-- Structured ownership (Phase 5.3 Stage 1). Local only until separately approved for production.
-- Additive: new types, nullable columns, one column with a default, one new table. No existing value is rewritten:
-- answers given before this are "not stated" (involvement NULL, formVersion 1) and are read as text, exactly as today.
-- Every structured choice is self-reported; nothing here records anything as verified.

-- CreateEnum
CREATE TYPE "Involvement" AS ENUM ('PERFORMED', 'PART', 'SUPERVISED', 'REQUESTED', 'ASSISTED', 'OBSERVED_TRAINED', 'TAUGHT', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "WorkFrequency" AS ENUM ('MOST_DAYS', 'WEEKLY', 'MONTHLY', 'FEW_TIMES', 'ONCE');

-- CreateEnum
CREATE TYPE "WorkRecency" AS ENUM ('CURRENT', 'WITHIN_YEAR', 'ONE_TO_THREE_YEARS', 'OVER_THREE_YEARS');

-- AlterTable
ALTER TABLE "CandidateClarification" ADD COLUMN     "alsoDidSome" BOOLEAN,
ADD COLUMN     "claimedMonths" SMALLINT,
ADD COLUMN     "consistency" VARCHAR(30),
ADD COLUMN     "formVersion" SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN     "frequency" "WorkFrequency",
ADD COLUMN     "involvement" "Involvement",
ADD COLUMN     "recency" "WorkRecency";

-- AlterTable
ALTER TABLE "ClarificationEvent" ADD COLUMN     "involvement" VARCHAR(20);

-- CreateTable
CREATE TABLE "ClarificationPart" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clarificationId" UUID NOT NULL,
    "partIndex" SMALLINT NOT NULL,
    "partText" VARCHAR(300) NOT NULL,
    "checked" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClarificationPart_userId_idx" ON "ClarificationPart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationPart_clarificationId_partIndex_key" ON "ClarificationPart"("clarificationId", "partIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateClarification_id_userId_key" ON "CandidateClarification"("id", "userId");

-- AddForeignKey
ALTER TABLE "ClarificationPart" ADD CONSTRAINT "ClarificationPart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: (answer, owner), so a part can never be attached to another account's answer.
ALTER TABLE "ClarificationPart" ADD CONSTRAINT "ClarificationPart_clarificationId_userId_fkey" FOREIGN KEY ("clarificationId", "userId") REFERENCES "CandidateClarification"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same policy as every table: RLS on, no policies, so the browser Data API reads and writes nothing.
ALTER TABLE "ClarificationPart" ENABLE ROW LEVEL SECURITY;

-- Shape of a structured answer. Only the combinations the form can produce are accepted, so a malformed answer is
-- rejected by the database instead of being stored and read as evidence.
--   free text (every earlier answer): no structured field at all, formVersion 1
--   NOT_DONE: a denial (outcome DENIED), nothing else
--   PERFORMED / PART: a role answer with how often and how recently; PART may record that it came from a lead choice
--   SUPERVISED / REQUESTED / ASSISTED / TAUGHT: a role answer; "did you also do some?" either not asked or answered no
--     (yes is stored as PART)
--   OBSERVED_TRAINED: a role answer, nothing else
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_structured_fields" CHECK (
  (
    "involvement" IS NULL AND "alsoDidSome" IS NULL AND "frequency" IS NULL AND "recency" IS NULL
    AND "claimedMonths" IS NULL AND "consistency" IS NULL AND "formVersion" = 1
  )
  OR (
    "involvement" IS NOT NULL AND "formVersion" = 2
    AND ("consistency" IS NULL OR "consistency" IN ('consistent', 'text_mismatch', 'text_unread', 'no_text'))
    AND ("claimedMonths" IS NULL OR ("claimedMonths" BETWEEN 1 AND 720 AND "involvement" IN ('PERFORMED', 'PART')))
    AND (
      ("involvement" = 'NOT_DONE' AND "outcome"::text = 'DENIED'
        AND "alsoDidSome" IS NULL AND "frequency" IS NULL AND "recency" IS NULL)
      OR ("involvement" = 'PERFORMED' AND "outcome"::text = 'ROLE_DETAIL_ADDED'
        AND "frequency" IS NOT NULL AND "recency" IS NOT NULL AND "alsoDidSome" IS NULL)
      OR ("involvement" = 'PART' AND "outcome"::text = 'ROLE_DETAIL_ADDED'
        AND "frequency" IS NOT NULL AND "recency" IS NOT NULL AND ("alsoDidSome" IS NULL OR "alsoDidSome" = true))
      OR ("involvement" IN ('SUPERVISED', 'REQUESTED', 'ASSISTED', 'TAUGHT') AND "outcome"::text = 'ROLE_DETAIL_ADDED'
        AND "frequency" IS NULL AND "recency" IS NULL AND ("alsoDidSome" IS NULL OR "alsoDidSome" = false))
      OR ("involvement" = 'OBSERVED_TRAINED' AND "outcome"::text = 'ROLE_DETAIL_ADDED'
        AND "frequency" IS NULL AND "recency" IS NULL AND "alsoDidSome" IS NULL)
    )
  )
);

-- A role answer needs its text only when it's a free-text answer: a structured answer's explanation is optional (the
-- choice carries it, and the rules cap a choice without text at Possible). Every other condition is unchanged, and every
-- existing row already has its text, so all existing rows still satisfy this.
ALTER TABLE "CandidateClarification" DROP CONSTRAINT "CandidateClarification_outcome_fields";
ALTER TABLE "CandidateClarification" ADD CONSTRAINT "CandidateClarification_outcome_fields" CHECK (
  ("outcome"::text = 'ROLE_DETAIL_ADDED' AND "experienceId" IS NOT NULL AND "educationId" IS NULL AND ("detail" IS NOT NULL OR "involvement" IS NOT NULL))
  OR ("outcome"::text = 'ENTRY_ADDED' AND "experienceId" IS NULL)
  OR ("outcome"::text IN ('DECLINED', 'DENIED', 'SKIPPED') AND "experienceId" IS NULL AND "educationId" IS NULL AND "detail" IS NULL)
);

-- The audit trail records the choice by name only.
ALTER TABLE "ClarificationEvent" ADD CONSTRAINT "ClarificationEvent_involvement_value" CHECK (
  "involvement" IS NULL OR "involvement" IN ('PERFORMED', 'PART', 'SUPERVISED', 'REQUESTED', 'ASSISTED', 'OBSERVED_TRAINED', 'TAUGHT', 'NOT_DONE')
);

-- A compound requirement has at most ten parts, each with the requirement's own non-empty wording.
ALTER TABLE "ClarificationPart" ADD CONSTRAINT "ClarificationPart_values" CHECK (
  "partIndex" BETWEEN 0 AND 9 AND char_length(btrim("partText")) > 0
);
