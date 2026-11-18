#!/usr/bin/env bash
# LOCAL-ONLY rehearsal of the V1 production migration, starting from the production state the owner confirmed
# read-only on 2026-11-17: 10 migrations applied, through 20261026010000_job_requirements; RLS migration NOT applied.
#
# Runs on disposable databases in the local test container (careeros-test-db, 127.0.0.1:5433) and drops them at the end.
# Never point this at a hosted database: prisma.rehearsal.config.ts only accepts local URLs.
#
# Variant a: no RLS on any table before the pending migrations (what the migration history alone produces).
# Variant b: RLS already enabled on every app table outside migrations (what the RLS migration's comment says
#            production has). The owner's read-only check decides which one matches production; both must pass.
#
# Usage (from web/):  bash scripts/rehearse-production-migrations.sh
set -u
cd "$(dirname "$0")/.."
APPLIED=10   # migrations production has applied (owner's read-only check)
P="docker exec careeros-test-db psql -U careeros_test -At"
U=postgresql://careeros_test:local_test_only@127.0.0.1:5433
WORK=$(mktemp -d)
FIRST=$WORK/migrations
mkdir -p "$FIRST"
for m in $(ls prisma/migrations | grep -v toml | head -$APPLIED); do cp -r "prisma/migrations/$m" "$FIRST/"; done
cp prisma/migrations/migration_lock.toml "$FIRST/"
git show origin/main:prisma/schema.prisma > "$WORK/main_schema.prisma"
echo "production state: $(ls "$FIRST" | grep -v toml | tail -1) ($APPLIED migrations)"

for variant in a b; do
  db=v1_prod_rehearsal_$variant
  echo "################ variant $variant"
  $P -d careeros_test -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" >/dev/null; $P -d careeros_test -c "CREATE DATABASE $db" >/dev/null
  echo "== 1. production state"
  REHEARSAL_DATABASE_URL=$U/$db REHEARSAL_MIGRATIONS=$FIRST npx prisma migrate deploy --config prisma.rehearsal.config.ts 2>&1 | grep -E "found|successfully|Error"
  echo "   recorded: $($P -d $db -c "select count(*)||' rows, last '||max(migration_name) from \"_prisma_migrations\"")"
  echo "   checksums of the applied migrations (compare with production's _prisma_migrations):"
  $P -d $db -c "select '     '||migration_name||' '||checksum from \"_prisma_migrations\" order by migration_name"
  echo "== 2. existing data (as the live app writes it)"
  $P -d $db -c "INSERT INTO \"User\"(id,\"supabaseAuthId\",\"updatedAt\") VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',now());
    INSERT INTO \"CareerProfile\"(id,\"userId\",\"displayName\",\"updatedAt\") VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Existing User',now());
    INSERT INTO \"SavedJob\"(id,\"userId\",title,company,description,\"updatedAt\",requirements,\"reviewedDescription\",\"reviewVersion\") VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','Clerk','Acme','Requirements:\n- Excel',now(),'[{\"text\":\"Excel\",\"category\":\"Skills\",\"priority\":\"Required\",\"source\":\"\"}]','Requirements:\n- Excel',1);" >/dev/null && echo "   seeded 1 user, 1 profile, 1 reviewed job"
  if [ $variant = b ]; then
    $P -d $db -c "DO \$\$ DECLARE t text; BEGIN FOR t IN SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE nspname='public' AND relkind='r' AND relname <> '_prisma_migrations' LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t); END LOOP; END \$\$;" >/dev/null && echo "   RLS enabled outside migrations on every app table"
  fi
  echo "   before: tables without RLS = [$($P -d $db -c "select string_agg(relname,',' order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and not relrowsecurity")]"
  echo "== 3. apply the pending migrations (this branch)"
  REHEARSAL_DATABASE_URL=$U/$db npx prisma migrate deploy --config prisma.rehearsal.config.ts 2>&1 | grep -E "found|Applying|successfully|Error|error"
  echo "== 4. checks"
  echo "   recorded: $($P -d $db -c "select count(*)||' rows, unfinished '||count(*) filter (where finished_at is null)||', rolled back '||count(*) filter (where rolled_back_at is not null) from \"_prisma_migrations\"")"
  echo -n "   drift vs schema.prisma: "; REHEARSAL_DATABASE_URL=$U/$db npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --config prisma.rehearsal.config.ts 2>&1 | grep -E "No difference|CREATE|ALTER|DROP" | head -3
  echo "   tables: $($P -d $db -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r'")   without RLS: [$($P -d $db -c "select string_agg(relname,',') from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and not relrowsecurity")]   policies: $($P -d $db -c "select count(*) from pg_policies where schemaname='public'")"
  echo "   not-validated constraints: $($P -d $db -c "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where nspname='public' and not convalidated")"
  echo "   existing rows intact: $($P -d $db -c "select (select count(*) from \"User\")||' user, '||(select count(*) from \"CareerProfile\")||' profile, '||(select count(*) from \"SavedJob\" where \"reviewVersion\"=1 and requirements::text like '%Excel%')||' job; consent cols null: '||(select (\"aiCloudConsentAt\" is null and \"aiCloudConsentVersion\" is null)::text from \"User\")")"
  echo "== 5. compatibility with the deployed app: statements that would turn the migrated DB back into main's schema"
  REHEARSAL_DATABASE_URL=$U/$db npx prisma migrate diff --from-config-datasource --to-schema "$WORK/main_schema.prisma" --script --config prisma.rehearsal.config.ts 2>/dev/null | grep -E "^(ALTER|DROP|CREATE)" | sed -E 's/\s+/ /g' | sort | uniq -c | sort -rn | head -40
done
for variant in a b; do $P -d careeros_test -c "DROP DATABASE IF EXISTS v1_prod_rehearsal_$variant WITH (FORCE)" >/dev/null; done
rm -rf "$WORK"
echo "disposable databases left: $($P -d careeros_test -c "select count(*) from pg_database where datname like 'v1_prod_rehearsal_%'")"
