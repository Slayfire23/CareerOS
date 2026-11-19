-- CareerOS V1: read-only production verification after `prisma migrate deploy` (checklist §9, step E).
-- The SET line only pins this session's output format so the data fingerprints are comparable; it changes no data.
set time zone 'UTC'; set datestyle = 'ISO, MDY'; set intervalstyle = 'postgres'; set extra_float_digits = 1; set bytea_output = 'hex';
with expected_migrations(name, checksum) as (values
  ('20261015041846_init_users_profiles',        'aa9d1e82e23ef4d4d563bb630700e678d4e4328019e6bb06c8cd79cc419289f2'),
  ('20261017010000_career_preferences',         'f64290c5997404e44c500f4a244a940788674a94135d28964c131df8bf7ed618'),
  ('20261017020000_technical_skills',           '7c347814a45f689f5f9de48f6ad986ac8002173e6592ad2d2d6315934ba54201'),
  ('20261017030000_professional_experience',    '6916427df84b22cc00fc191bc740639cac0304cd0b1ec6fa67dc80fa663528b0'),
  ('20261017040000_location_preferences',       'a41eecb598fddc0efcc9c68540d662cc7f84ddb5dc8fc7b13cd1107ce60594e5'),
  ('20261017050000_salary_expectations',        'c4880ef806c3e353ae8380545e10874bbf964a2dbdb3a2774268187de58d6da4'),
  ('20261017060000_education',                  '25b588f876ba38d8dd76ecc7f3110a3c9ce99a2233ef846f7c5fbcc90fd706bd'),
  ('20261017070000_projects_accomplishments',   '88ec9ee99ed92ecd97a6892aeece1a21e96aaf9783174795f62d4784ead63c09'),
  ('20261021010000_saved_jobs',                 'a833c7940f6e1986f0ff563c18b301832a9cabbf3969ebd98fe585b5d976829b'),
  ('20261026010000_job_requirements',           '1eb5c9a2d6791dac092d4c40b828cb53db27622b472266e884e2fa0c5cb920d4'),
  ('20261028010000_enable_row_level_security',  '41455d3cac6d20ab5886c441252ca83f7c1c48deef7bb0642a1d0baa1544e7de'),
  ('20261030010000_ai_analysis',                '3f59ef5a7a54672b72c56e2e7db732ef0ebd9b51f27dda098325e8ad9e7bb639'),
  ('20261031010000_ai_cost_ledger',             'cb64f9fcb7c1db651ca47e4a0beb4a87d7ede9e7e5b89a7ae63362f301612c45'),
  ('20261102010000_ai_suggestions',             '67650f04820d45ad4b9ed4873c0b804fb04a6826754509d85ff5953e5fd38d35'),
  ('20261103010000_candidate_clarifications',   'c962b000f0d336443a9c38e0bc37a3d4ac4ff7127eb2c3dd1fe4e5917fd903f6'),
  ('20261104010000_clarification_review',       '257d43e4f6e0da138c451f7eb0ef5dfefaaf113dabc23afb094cd4646b2d0700'),
  ('20261105010000_clarification_follow_up',    'fe04080570e1dc6f508993596ce01538cce393b8ab84dc4a79cad720860a6242'),
  ('20261110010000_structured_ownership',       '706723d3447bd1b6cab7d381be4b0901d6423866bba3baaf1ae89c12f60f0b58'),
  ('20261114010000_structured_matching_audit',  '3052000b57bc837bd6e42a1f3771cfcf8fa8df1d296948568cd68e3e344a16b4'),
  ('20261117010000_assessment_approval',        '2a65db85e549452a273d7b1cbac874e6aa4310f364352988e45952b3368d9b9e')),
-- Data fingerprints from the verified pre-V1 backup (2026-11-18 05:29 UTC). User is read over its 4 original
-- columns (V1 added 2 nullable columns); _prisma_migrations over its 10 pre-V1 rows.
expected_data(o, name, rows, fp) as (values
  (1, 'User',                   3,  '605d7d158eb178eeae8005fb0de585a1'),
  (2, 'CareerProfile',          3,  '222f0991e6e4d94bc0d4a6a886c5b818'),
  (3, 'TechnicalSkill',         46, '09c01da7d48af5605821ed2c58d1a649'),
  (4, 'ProfessionalExperience', 4,  '7c6c38f1a7be90a83850feefbcc93d89'),
  (5, 'Education',              1,  '849c492121e93083879a93066cee91f1'),
  (6, 'ProjectAccomplishment',  0,  'd41d8cd98f00b204e9800998ecf8427e'),
  (7, 'SavedJob',               0,  'd41d8cd98f00b204e9800998ecf8427e'),
  (8, '_prisma_migrations (first 10 rows)', 10, 'a19091f46e7b3e5cdc62544b1a4e2f2b')),
actual_data(name, rows, fp) as (
  select 'User', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), ''))
    from (select id, "supabaseAuthId", "createdAt", "updatedAt" from public."User") x
  union all select 'CareerProfile', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."CareerProfile" x
  union all select 'TechnicalSkill', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."TechnicalSkill" x
  union all select 'ProfessionalExperience', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."ProfessionalExperience" x
  union all select 'Education', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."Education" x
  union all select 'ProjectAccomplishment', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."ProjectAccomplishment" x
  union all select 'SavedJob', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."SavedJob" x
  union all select '_prisma_migrations (first 10 rows)', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), ''))
    from public._prisma_migrations x where x.migration_name <= '20261026010000_job_requirements'),
migration_check as (
  select
    (select count(*) from public._prisma_migrations) as total,
    (select count(*) from public._prisma_migrations m join expected_migrations e on e.name = m.migration_name
      where m.checksum = e.checksum and m.finished_at is not null and m.rolled_back_at is null) as good,
    (select count(*) from public._prisma_migrations m where not exists (select 1 from expected_migrations e where e.name = m.migration_name)) as unknown),
table_check as (
  select count(*) as tables, count(*) filter (where c.relrowsecurity) as rls_on, count(*) filter (where c.relforcerowsecurity) as forced,
         count(*) filter (where c.relname in ('AiAnalysisRun','JobMatchAnalysis','CandidateClarification','ClarificationEvent',
                                              'ClarificationFollowUp','ClarificationPart','AssessmentApproval')) as v1_tables
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'),
results(o, item, expected, actual, ok) as (
  select 1, 'Migrations recorded', '20', (select total::text from migration_check), (select total = 20 from migration_check)
  union all select 2, 'Migrations finished, not rolled back, expected name + checksum', '20', (select good::text from migration_check), (select good = 20 from migration_check)
  union all select 3, 'Unknown migration names', '0', (select unknown::text from migration_check), (select unknown = 0 from migration_check)
  union all select 4, 'Public tables', '15', (select tables::text from table_check), (select tables = 15 from table_check)
  union all select 5, 'V1 tables present', '7', (select v1_tables::text from table_check), (select v1_tables = 7 from table_check)
  union all select 6, 'Tables with RLS enabled', '15', (select rls_on::text from table_check), (select rls_on = 15 from table_check)
  union all select 7, 'Tables with RLS forced', '0', (select forced::text from table_check), (select forced = 0 from table_check)
  union all select 10 + e.o, 'Original data: ' || e.name, e.rows::text || ' rows, backup content',
         a.rows::text || ' rows, ' || case when a.fp = e.fp then 'same content' else 'DIFFERENT content' end,
         a.rows = e.rows and a.fp = e.fp
    from expected_data e join actual_data a using (name))
select item, expected, actual, result from (
  select o, item, expected, actual, case when ok then 'PASS' else 'FAIL' end as result from results
  union all
  select 99, 'OVERALL', null, null,
         case when bool_and(ok) then 'PASS: migrations, tables, RLS and original data verified' else 'FAIL: stop and send me this result' end
  from results
) z order by o;
