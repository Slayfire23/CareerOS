-- CareerOS V1 rollback, part 3: checks run INSIDE the rollback transaction, before COMMIT.
-- Any failure raises an exception; with ON_ERROR_STOP the transaction is never committed.
DO $verify$
DECLARE
  v1_tables int; v1_types int; v1_columns int; v1_indexes int; tables int; rls int; forced int;
  migrations int; unfinished int; last_name text;
BEGIN
  SELECT count(*) INTO v1_tables FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('AssessmentApproval','ClarificationPart','ClarificationFollowUp',
         'ClarificationEvent','CandidateClarification','JobMatchAnalysis','AiAnalysisRun');
  SELECT count(*) INTO v1_types FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname IN ('AiAnalysisStatus','AiBillingState','ClarificationOutcome',
         'ClarificationStatus','FollowUpStatus','Involvement','WorkFrequency','WorkRecency');
  SELECT count(*) INTO v1_columns FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'User' AND column_name IN ('aiCloudConsentAt','aiCloudConsentVersion');
  SELECT count(*) INTO v1_indexes FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('SavedJob_id_userId_key','JobMatchAnalysis_id_savedJobId_userId_key');
  SELECT count(*), count(*) FILTER (WHERE c.relrowsecurity), count(*) FILTER (WHERE c.relforcerowsecurity)
    INTO tables, rls, forced
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r';
  SELECT count(*), count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL), max(migration_name)
    INTO migrations, unfinished, last_name FROM public._prisma_migrations;

  IF v1_tables + v1_types + v1_columns + v1_indexes <> 0 THEN
    RAISE EXCEPTION 'rollback check failed: V1 objects remain (tables %, types %, columns %, indexes %)', v1_tables, v1_types, v1_columns, v1_indexes;
  END IF;
  IF tables <> 8 OR rls <> 8 OR forced <> 0 THEN
    RAISE EXCEPTION 'rollback check failed: expected 8 tables with RLS (not forced), found % tables, % with RLS, % forced', tables, rls, forced;
  END IF;
  IF migrations <> 10 OR unfinished <> 0 OR last_name <> '20261026010000_job_requirements' THEN
    RAISE EXCEPTION 'rollback check failed: expected the 10 pre-V1 migrations, found % (unfinished %, last %)', migrations, unfinished, last_name;
  END IF;
END
$verify$;

SELECT 'check: V1 objects 0; tables 8, RLS 8 of 8, forced 0; migrations 10, last 20261026010000_job_requirements';
SELECT 'count: ' || t || ' ' || n FROM (
  SELECT 1 o, 'User' t, count(*) n FROM public."User" UNION ALL
  SELECT 2, 'CareerProfile', count(*) FROM public."CareerProfile" UNION ALL
  SELECT 3, 'TechnicalSkill', count(*) FROM public."TechnicalSkill" UNION ALL
  SELECT 4, 'ProfessionalExperience', count(*) FROM public."ProfessionalExperience" UNION ALL
  SELECT 5, 'Education', count(*) FROM public."Education" UNION ALL
  SELECT 6, 'ProjectAccomplishment', count(*) FROM public."ProjectAccomplishment" UNION ALL
  SELECT 7, 'SavedJob', count(*) FROM public."SavedJob" UNION ALL
  SELECT 8, '_prisma_migrations', count(*) FROM public._prisma_migrations) x ORDER BY o;
