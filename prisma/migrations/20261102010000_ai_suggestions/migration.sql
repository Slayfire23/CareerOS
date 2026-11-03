-- AI suggestions are stored apart from findings: they never change a verdict.
ALTER TABLE "JobMatchAnalysis" ADD COLUMN "aiSuggestions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "JobMatchAnalysis" ADD COLUMN "aiAssist" VARCHAR(20);
