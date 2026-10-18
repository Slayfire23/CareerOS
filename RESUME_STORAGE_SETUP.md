# Private resume storage

## Initial scope

PDF only, 2 MiB maximum. Basic MIME, filename, PDF header and EOF checks are not full parsing or malware scanning. Downloads are attachments with no-store and nosniff; no inline preview or AI extraction. Each upload has a random UUID plus sanitized original name under the verified Supabase Auth UUID folder. Re-uploading a filename creates a new immutable version. Users may delete individual uploads. There is no new Prisma migration: Supabase Storage owns metadata and bytes, avoiding partially synchronized records. Version grouping/labels and account-wide storage quotas remain future work.

## Supabase setup (required before browser tests or deployment)

1. Open the project's SQL editor and run supabase/resume-storage.sql once. It creates the private careeros-resumes bucket with application/pdf and 2097152-byte restrictions, plus authenticated owner-folder SELECT/INSERT/DELETE policies and restrictive guards against broad existing grants. UPDATE is denied so overwrite is unavailable. Anonymous access is denied. Run the whole transaction; do not remove the restrictive policies. If policy names already exist, inspect the existing setup rather than rerunning piecemeal.
2. Confirm Storage shows careeros-resumes as PRIVATE, PDF-only, 2 MiB. Keep it private. Existing public/private buckets are unaffected.
3. No service-role secret is needed. Existing publishable key plus authenticated cookies is used. Disabling the database Data API does not replace Storage policies.
4. Restart npm run dev (next.config.ts now allows 3 MiB server-action requests to accommodate 2 MiB files plus multipart overhead). Keep the local test PostgreSQL override for app tests; resume files still use the configured hosted Supabase Storage.
5. Run the build and Playwright suite. It now has 19 browser tests. The new test uses only uniquely named synthetic PDFs in the two disposable accounts, deletes those fixtures, and checks direct Storage denial as well as app routes. It will fail until storage is configured; mocked unit tests do not prove RLS.
6. Deploy only after tests pass; live-check upload, same-name second upload, refresh, download, and deleting one version without deleting another.

## Failure and privacy behavior

Owner identity is always verified with getUser; submitted user IDs/paths are ignored or rejected. Downloads are routed through /api/resumes/[key], derive the owner's folder on the server, and return generic 404 for missing/denied objects. No public or signed URLs are exposed by the app. Deletion failure leaves the row visible for retry; Storage is the single source of truth. Listing reads all pages of owned objects. Direct Storage clients still require RLS, and MIME restriction alone is not content scanning. Account deletion is not implemented; when added, owned Storage objects must be removed before deleting the identity. Do not delete storage.objects rows using SQL to remove files.

References: https://supabase.com/docs/guides/storage/security/access-control and https://supabase.com/docs/guides/storage/buckets/fundamentals
