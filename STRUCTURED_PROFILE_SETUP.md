# Structured profile fields — first increment

Prepared October 17, 2026. Local implementation is complete; hosted migration, browser verification, and deployment are pending.

## Fields and behavior

- Target roles and industries: optional lists, one entry per line, at most 10 entries of 100 characters each. Trim whitespace, discard blank lines, and deduplicate case-insensitively. Commas remain part of an entry.
- Work arrangements: any combination of remote, hybrid, on-site.
- Employment types: any combination of full-time, part-time, contract, internship.
- Empty lists mean unspecified; do not infer preferences from blank fields.
- A separate form/action saves only these four fields. Existing name, headline, and careerGoals are preserved. The original profile form does not overwrite preferences.
- Ownership comes only from the verified server-side identity. Invalid choices, files, duplicate text fields, and oversized lists are rejected.

The additive migration 20261017010000_career_preferences adds four non-null PostgreSQL text-array columns with empty-array defaults. Work-choice values are validated by application code. No existing column or record is removed. Structured skills, experience, salary, locations, and resumes remain future work.

## Verified in this change

- 67 unit tests passed.
- 8 isolated PostgreSQL integration tests passed.
- A fixture inserted before the migration retained its name, headline, and goals, with four empty preference lists afterward; fixture removed after verification.
- Prisma client generated; TypeScript and ESLint passed.
- Default production build attempted but blocked by sandbox permission to create a Turbopack junction; a successful build is still required.
- One new two-account browser test is prepared; 11 total browser tests need execution against the changed app. Existing live checks are not evidence for these new fields.

## Finish local verification before changing hosted data

Docker's careeros-test-db must be running. The migration has already been applied to that local database by the agent. In a fresh PowerShell terminal in the project root:

```powershell
$env:DATABASE_URL='postgresql://careeros_test:local_test_only@127.0.0.1:5433/careeros_test'
$env:APP_URL='http://localhost:3000'
npm run build
npm run dev
```

If the build fails, stop and inspect its error. Once dev is ready, in another project terminal run:

```powershell
npx playwright test
```

Expected: 11 browser tests passing. The app uses local PostgreSQL for these checks while Auth uses the existing Supabase test identities from .env.playwright.local. Sign-in provisions their profiles in the isolated local database. No email requests are made by this browser suite. Keep localhost:3000 free before starting; do not run a different hosted-database dev server there.

Stop the server and close the terminal when done; its environment overrides are session-local and do not modify .env. The normal local .env still points to the hosted database, so do not run this changed dashboard against it until the hosted migration is applied.

## Hosted rollout (not performed)

After local checks pass, review the additive migration and ensure a current backup/export appropriate to the shared database. In a fresh terminal with the intended hosted session/direct migration connection, use prisma7.config.ts to inspect status and apply committed migrations. Do not use the integration config for this step. Apply the additive database migration before deploying code that selects the new columns. The old deployed code remains compatible with the added columns. Vercel's build command generates the client but does not apply migrations.

Only after the hosted migration succeeds, commit/push the code for deployment and smoke-test saving/clearing preferences on disposable accounts. Do not mark the deployment complete based on local test results.
