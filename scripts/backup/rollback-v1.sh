#!/bin/sh
# CareerOS V1 full rollback: returns the public schema to the verified pre-V1 backup, in ONE transaction.
# Runs INSIDE the postgres:17 container:
#   docker run --rm -e ROLLBACK_URL -v <backup folder>:/backup:ro -v <this folder>:/tools:ro postgres:17 \
#     sh /tools/rollback-v1.sh check|apply <backup sha256>
#   check = do everything, run the checks, then ROLLBACK (changes nothing; proves it would succeed)
#   apply = the same, then COMMIT
# The connection string arrives only as ROLLBACK_URL (forwarded by name) and is never printed.
# What it does, inside one transaction:
#   1. v1-drop.sql: drop the 7 tables and 8 enum types that only the V1 migrations create (no CASCADE)
#   2. recreate the 8 original tables from the backup (pg_restore --clean --if-exists): definitions, data, constraints,
#      indexes, RLS and grants, and _prisma_migrations with its 10 pre-V1 rows
#   3. rollback-verify.sql: no V1 objects left, 8 tables with RLS, the 10-row migration history; prints counts
# It deliberately does NOT touch: the public schema itself, its grants and default privileges, or the Supabase
# function public.rls_auto_enable() (V1 changes none of them). Everything written after the backup is LOST.
set -u
MODE=${1:-}; SHA=${2:-}
F=/backup/careeros-pre-v1-public.dump
case "$MODE" in check|apply) ;; *) echo "usage: rollback-v1.sh check|apply <backup sha256>"; exit 2 ;; esac
[ -n "${ROLLBACK_URL:-}" ] || { echo "STOP: ROLLBACK_URL is not set inside the container"; exit 2; }
case "$ROLLBACK_URL" in postgresql://*|postgres://*) ;; *) echo "STOP: ROLLBACK_URL is not a postgres URL"; exit 2 ;; esac
[ -s "$F" ] || { echo "STOP: $F is missing or empty"; exit 2; }
got=$(sha256sum "$F" | cut -d' ' -f1)
[ "$got" = "$SHA" ] || { echo "STOP: the backup's SHA-256 differs from the one given"; exit 2; }
echo "backup fingerprint: matches"

# Guard: the database must hold the 10 pre-V1 migrations plus only known V1 migrations, nothing else.
PRE="20261015041846_init_users_profiles 20261017010000_career_preferences 20261017020000_technical_skills 20261017030000_professional_experience 20261017040000_location_preferences 20261017050000_salary_expectations 20261017060000_education 20261017070000_projects_accomplishments 20261021010000_saved_jobs 20261026010000_job_requirements"
V1="20261028010000_enable_row_level_security 20261030010000_ai_analysis 20261031010000_ai_cost_ledger 20261102010000_ai_suggestions 20261103010000_candidate_clarifications 20261104010000_clarification_review 20261105010000_clarification_follow_up 20261110010000_structured_ownership 20261114010000_structured_matching_audit 20261117010000_assessment_approval"
names=$(psql "$ROLLBACK_URL" -X -At -v ON_ERROR_STOP=1 -c "select migration_name from public._prisma_migrations order by 1" 2>/dev/null) \
  || { echo "STOP: cannot read the migration history"; exit 2; }
pre=0; v1=0
for n in $names; do
  case " $PRE " in *" $n "*) pre=$((pre+1)); continue ;; esac
  case " $V1 " in *" $n "*) v1=$((v1+1)); continue ;; esac
  echo "STOP: unknown migration in the history: $n"; exit 2
done
[ "$pre" -eq 10 ] || { echo "STOP: expected the 10 pre-V1 migrations, found $pre"; exit 2; }
echo "database: 10 pre-V1 migrations + $v1 of 10 V1 migrations recorded"

# Restore list: everything in the backup except the schema itself, its comment/grants, default privileges and the
# Supabase function (and its grants), which V1 never changes and which must not be dropped.
pg_restore -l "$F" | grep -vE ' (SCHEMA - public |COMMENT - SCHEMA public |ACL - SCHEMA public |DEFAULT ACL public |FUNCTION public rls_auto_enable|ACL public FUNCTION rls_auto_enable)' > /tmp/list
pg_restore --clean --if-exists -L /tmp/list -f /tmp/restore.sql "$F" || { echo "STOP: could not read the backup"; exit 2; }
sed -i '/^SET lock_timeout = 0;$/d' /tmp/restore.sql

{
  echo '\set ON_ERROR_STOP on'
  echo 'BEGIN;'
  echo "SET LOCAL lock_timeout = '15s';"
  cat /tools/v1-drop.sql
  echo '\i /tmp/restore.sql'
  cat /tools/rollback-verify.sql
  if [ "$MODE" = apply ]; then echo 'COMMIT;'; else echo 'ROLLBACK;'; fi
} > /tmp/run.sql

psql "$ROLLBACK_URL" -X -q -At -f /tmp/run.sql > /tmp/out 2>&1
rc=$?
rm -f /tmp/restore.sql /tmp/run.sql /tmp/list
# Print only the check and count lines; on failure, the first error with quoted values masked (they could hold data).
grep -E '^(check|count): ' /tmp/out
if [ $rc -ne 0 ]; then
  grep -m1 -E 'ERROR' /tmp/out | sed -E 's/"[^"]*"/"<value>"/g; s/\x27[^\x27]*\x27/\x27<value>\x27/g'
  rm -f /tmp/out
  echo "rollback $MODE: FAILED (psql exit $rc); nothing was committed"
  exit 1
fi
rm -f /tmp/out
if [ "$MODE" = apply ]; then echo "rollback apply: PASS (committed)"; else echo "rollback check: PASS (rolled back; nothing changed)"; fi
