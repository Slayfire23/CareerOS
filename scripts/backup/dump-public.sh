#!/bin/sh
# CareerOS production backup of the public schema. Runs INSIDE the postgres:17 container:
#   docker run --rm -e PGDUMP_URL -v <backup folder>:/backup -v <this folder>:/tools:ro postgres:17 sh /tools/dump-public.sh
# The connection string arrives only as the environment variable PGDUMP_URL (forwarded by name) and is never printed.
# It contains no credentials itself. See docs/V1_PRODUCTION_BACKUP_PROCEDURE.md.
set -u
OUT=/backup/careeros-pre-v1-public.dump
LOG=/backup/careeros-pre-v1-public.log

if [ -z "${PGDUMP_URL:-}" ]; then echo "STOP: PGDUMP_URL is not set inside the container"; exit 2; fi
case "$PGDUMP_URL" in postgresql://*|postgres://*) ;; *) echo "STOP: PGDUMP_URL is not a postgres URL"; exit 2 ;; esac
if [ -e "$OUT" ] || [ -e "$LOG" ]; then echo "STOP: a dump or log already exists in the backup folder; remove it first"; exit 2; fi

pg_dump --dbname="$PGDUMP_URL" --format=custom --schema=public --lock-wait-timeout=30s --verbose --file="$OUT" 2> "$LOG"
code=$?
echo "pg_dump exit $code"

# The log must never hold the connection string or the password. If it does, delete it.
rest=${PGDUMP_URL#*://}; userinfo=${rest%%@*}; pw=${userinfo#*:}
leak=0
grep -qF -- "$PGDUMP_URL" "$LOG" 2>/dev/null && leak=1
if [ "$pw" != "$userinfo" ] && [ -n "$pw" ]; then grep -qF -- "$pw" "$LOG" 2>/dev/null && leak=1; fi
if [ $leak -eq 1 ]; then rm -f "$LOG"; echo "WARNING: the log contained credentials and was deleted"; fi

errs=$(grep -ciE 'error|fatal' "$LOG" 2>/dev/null); errs=${errs:-0}
bytes=0; [ -f "$OUT" ] && bytes=$(wc -c < "$OUT")
echo "dump bytes: $bytes   log error lines: $errs   log credential check: $([ $leak -eq 0 ] && echo clean || echo LEAK-REMOVED)"
exit $code
