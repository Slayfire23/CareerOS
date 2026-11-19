-- CareerOS: compare production with the verified pre-V1 backup (2026-11-18 05:29 UTC, SHA-256 299bed70...4d82). READ-ONLY.
-- The SET line only pins this session's output format so the fingerprints are comparable; it changes no data.
set time zone 'UTC'; set datestyle = 'ISO, MDY'; set intervalstyle = 'postgres'; set extra_float_digits = 1; set bytea_output = 'hex';
with expected(o, name, rows, fp) as (values
  (1, 'User',                   3,  '605d7d158eb178eeae8005fb0de585a1'),
  (2, 'CareerProfile',          3,  '222f0991e6e4d94bc0d4a6a886c5b818'),
  (3, 'TechnicalSkill',         46, '09c01da7d48af5605821ed2c58d1a649'),
  (4, 'ProfessionalExperience', 4,  '7c6c38f1a7be90a83850feefbcc93d89'),
  (5, 'Education',              1,  '849c492121e93083879a93066cee91f1'),
  (6, 'ProjectAccomplishment',  0,  'd41d8cd98f00b204e9800998ecf8427e'),
  (7, 'SavedJob',               0,  'd41d8cd98f00b204e9800998ecf8427e'),
  (8, '_prisma_migrations',     10, 'a19091f46e7b3e5cdc62544b1a4e2f2b')),
current_state(name, rows, fp) as (
  select 'User', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."User" x
  union all select 'CareerProfile', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."CareerProfile" x
  union all select 'TechnicalSkill', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."TechnicalSkill" x
  union all select 'ProfessionalExperience', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."ProfessionalExperience" x
  union all select 'Education', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."Education" x
  union all select 'ProjectAccomplishment', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."ProjectAccomplishment" x
  union all select 'SavedJob', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public."SavedJob" x
  union all select '_prisma_migrations', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) from public._prisma_migrations x),
tables as (
  select e.o, e.name as item, e.rows as backup_rows, c.rows as production_rows,
         case when c.rows = e.rows and c.fp = e.fp then 'MATCH'
              when c.rows = e.rows then 'CHANGED (same count, different content)'
              else 'DIFFERENT COUNT' end as result
  from expected e join current_state c using (name)),
extra as (
  select 9 o, 'V1 tables present (must be 0)' item, null::bigint backup_rows,
         (select count(*) from pg_catalog.pg_class k join pg_catalog.pg_namespace n on n.oid = k.relnamespace
           where n.nspname = 'public' and k.relkind = 'r'
             and k.relname in ('AiAnalysisRun','JobMatchAnalysis','CandidateClarification','ClarificationEvent',
                               'ClarificationFollowUp','ClarificationPart','AssessmentApproval')) production_rows,
         null::text result)
select item, backup_rows, production_rows, result from (
  select o, item, backup_rows, production_rows,
         coalesce(result, case when production_rows = 0 then 'MATCH' else 'DIFFERENT' end) as result
  from (select * from tables union all select * from extra) r
  union all
  select 99, 'OVERALL', null, null,
         case when (select count(*) from tables where result <> 'MATCH') = 0 and (select production_rows from extra) = 0
              then 'MATCH: production is unchanged since the backup' else 'STOP: take a new verified backup first' end
) z order by o;
