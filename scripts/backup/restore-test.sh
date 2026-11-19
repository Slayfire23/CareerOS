#!/bin/sh
# Restores the backup into a disposable LOCAL database on the test container (careeros-test-db, port 5433), compares
# row counts with production's, checks RLS and the migration history, then ALWAYS drops the database (it holds real
# user data). Runs INSIDE the postgres:17 container; never connects to production.
#   docker run --rm -v <backup folder>:/backup -v <this folder>:/tools:ro postgres:17 sh /tools/restore-test.sh <8 counts>
# Counts, in order: User CareerProfile TechnicalSkill ProfessionalExperience Education ProjectAccomplishment SavedJob _prisma_migrations
set -u
# Local test container only (its password is the documented local-only one); passed via PGPASSWORD, not in the URL.
export PGPASSWORD=local_test_only
L=postgresql://careeros_test@host.docker.internal:5433
DB=v1_backup_check
F=/backup/careeros-pre-v1-public.dump
# md5 of the 10 applied migrations' names and checksums as they are in the repository (production matched all 10).
EXPECTED_HISTORY=98379339973132207148fee5d0c31fad

[ $# -eq 8 ] || { echo "usage: restore-test.sh <8 production row counts>"; exit 2; }
[ -s "$F" ] || { echo "STOP: $F is missing or empty"; exit 1; }

cleanup() {
  psql -q "$L/careeros_test" -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1
  left=$(psql -At "$L/careeros_test" -c "select count(*) from pg_database where datname = '$DB'" 2>/dev/null)
  echo "restored copy deleted: $([ "$left" = 0 ] && echo yes || echo NO - delete it manually)"
}
trap cleanup EXIT

psql -q "$L/careeros_test" -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB" >/dev/null || { echo "STOP: cannot reach the local test database"; exit 1; }
psql -q "$L/$DB" -c "DROP SCHEMA public CASCADE" >/dev/null 2>&1
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$L/$DB" "$F"
rc=$?
echo "pg_restore exit $rc"
[ $rc -eq 0 ] || exit 1

fail=0
for t in User CareerProfile TechnicalSkill ProfessionalExperience Education ProjectAccomplishment SavedJob _prisma_migrations; do
  exp=$1; shift
  got=$(psql -At "$L/$DB" -c "select count(*) from \"$t\"")
  if [ "$got" = "$exp" ]; then mark=ok; else mark=MISMATCH; fail=1; fi
  printf '%-24s production %-6s restored %-6s %s\n' "$t" "$exp" "$got" "$mark"
done
rls=$(psql -At "$L/$DB" -c "select count(*) filter (where relrowsecurity) || ' of ' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where nspname = 'public' and relkind = 'r'")
hist=$(psql -At "$L/$DB" -c "select md5(string_agg(migration_name || checksum, ',' order by migration_name)) from \"_prisma_migrations\"")
echo "RLS: $rls tables"; [ "$rls" = "8 of 8" ] || fail=1
echo "migration history matches the repository: $([ "$hist" = "$EXPECTED_HISTORY" ] && echo yes || echo NO)"; [ "$hist" = "$EXPECTED_HISTORY" ] || fail=1
if [ $fail -eq 0 ]; then echo "restore test: PASS"; else echo "restore test: FAIL"; exit 1; fi
