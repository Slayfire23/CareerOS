# Education entries

Institution and qualification/program are required (100 characters each). Field of study is optional (100); details optional (5000). Start month is required; end month is required unless currently studying. Month format YYYY-MM; end cannot precede start. A null end month means currently studying, not that a qualification was awarded. Details can clarify award/completion status. Multiple entries at one institution are allowed.

Related Education table cascades with its profile. Creation derives ownership from verified identity; edits/deletes filter by both record ID and identity. Existing profile information remains intact. Apply migration to isolated local PostgreSQL and regenerate client first; restart dev, then run build/browser tests before hosted migration.

Verification: 148 unit tests, 16 database tests, TypeScript and lint passed. Restart the local app to load the regenerated client, then run build and all 16 browser tests. Hosted migration remains pending.
