# Professional experience

Optional collection of jobs. Title/company are required (100 characters each). Start month is required; completed jobs require an end month no earlier than start. Current jobs store a null end month. Dates use YYYY-MM. Description is optional (5000 characters). Repeat jobs at the same company are allowed. Ownership derives from the verified user. Existing profile fields are preserved.

Generate the client and apply the additive migration with prisma.integration.config.ts to local PostgreSQL first. Restart the development server after generation with the local test DATABASE_URL. Run tests and build before hosted migration or deployment.

## Verification status

95 unit tests, 12 database tests, TypeScript, and lint passed. The owner supplied a successful production build, all 13 browser tests, and successful hosted migration output. Next: commit/push for Vercel deployment, then verify live add, refresh, edit to current employment, and removal.
