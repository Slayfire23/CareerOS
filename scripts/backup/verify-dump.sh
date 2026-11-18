#!/bin/sh
# Checks the backup file's contents and fingerprint. Runs INSIDE the postgres:17 container; reads the dump only.
#   docker run --rm -v <backup folder>:/backup -v <this folder>:/tools:ro postgres:17 sh /tools/verify-dump.sh
set -u
F=/backup/careeros-pre-v1-public.dump
[ -s "$F" ] || { echo "STOP: $F is missing or empty"; exit 1; }
pg_restore --list "$F" > /tmp/toc 2> /tmp/toc.err || { echo "STOP: pg_restore --list failed ($(head -c 200 /tmp/toc.err))"; exit 1; }
t=$(grep -c ' TABLE public ' /tmp/toc)
d=$(grep -c ' TABLE DATA public ' /tmp/toc)
r=$(grep -c ' ROW SECURITY public ' /tmp/toc)
m=$(grep -c 'TABLE DATA public _prisma_migrations' /tmp/toc)
echo "TABLE: $t  TABLE DATA: $d  ROW SECURITY: $r  _prisma_migrations data: $m"
echo "bytes: $(wc -c < "$F")"
echo "SHA-256: $(sha256sum "$F" | cut -d' ' -f1)"
if [ "$t" = 8 ] && [ "$d" = 8 ] && [ "$r" = 8 ] && [ "$m" = 1 ]; then echo "contents: PASS"; else echo "contents: FAIL (expected 8/8/8/1)"; exit 1; fi
