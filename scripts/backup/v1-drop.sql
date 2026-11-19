-- CareerOS V1 rollback, part 1: drop the objects that ONLY the 10 V1 migrations create
-- (20261028010000_enable_row_level_security .. 20261117010000_assessment_approval).
-- Their changes to the 8 original tables (two User columns and a check, the SavedJob(id, userId) index, RLS) are
-- undone in part 2, which recreates those tables from the pre-V1 backup.
-- No CASCADE: if anything unexpected depends on these objects, the statement fails and the whole rollback aborts.
DROP TABLE IF EXISTS
  public."AssessmentApproval",
  public."ClarificationPart",
  public."ClarificationFollowUp",
  public."ClarificationEvent",
  public."CandidateClarification",
  public."JobMatchAnalysis",
  public."AiAnalysisRun";
DROP TYPE IF EXISTS
  public."AiAnalysisStatus",
  public."AiBillingState",
  public."ClarificationOutcome",
  public."ClarificationStatus",
  public."FollowUpStatus",
  public."Involvement",
  public."WorkFrequency",
  public."WorkRecency";
