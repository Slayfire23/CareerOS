# Technical skills — local verification and rollout

October 17, 2026. Implemented locally; not deployed.

## Model and behavior

TechnicalSkill belongs to one CareerProfile and stores a UUID, name (1–100 characters), normalizedName, and optional SkillProficiency enum (BEGINNER, INTERMEDIATE, ADVANCED). The level is self-assessed, not a verified qualification. Normalization trims and collapses whitespace and lowercases the comparison key. A composite unique index prevents duplicate names within one profile. Two accounts may have the same skill independently.

Save finds the profile using verified Supabase identity, then upserts by that profile and normalized name. Save never accepts a client-supplied profile owner. Remove filters the skill ID by the authenticated profile owner. Profile deletion cascades to skills. The migration adds a table and enum; it does not replace existing profile columns or preferences.

The UI lists skills, allows adding or updating a level by entering the same name, permits clearing the level with Not specified, and offers per-skill removal. Skills are optional; removing the last skill leaves an empty list.

## Completed checks

- Local-only migration 20261017020000_technical_skills applied with prisma.integration.config.ts.
- Prisma client regenerated.
- 83 unit tests and 10 database integration tests passed.
- TypeScript, ESLint, and diff whitespace checks passed.
- New two-account browser test prepared; it creates uniquely named test skills and cleans them up.

## Pending local checks

Keep Docker running. Stop any existing Next.js server. In the web project terminal:

```powershell
$env:DATABASE_URL='postgresql://careeros_test:local_test_only@127.0.0.1:5433/careeros_test'
$env:APP_URL='http://localhost:3000'
npm run build
```

If the build passes, start `npm run dev` in the same terminal. In a second terminal:

```powershell
cd "C:\Users\slayf\OneDrive\Desktop\CareerOS\web"
.\node_modules\.bin\playwright.cmd test --config playwright.config.ts
```

Expect 12 browser tests. Use the existing two disposable accounts in ignored .env.playwright.local. These browser tests authenticate through Supabase but the app data connection above is the isolated Docker database. The new hosted table does not yet exist, so an app server using the normal hosted .env can fail when loading the new dashboard. A browser server error requires inspecting the app terminal, not relaxing assertions.

Close the overridden terminal afterward; .env is not modified by these commands.

## Hosted rollout — not yet performed

After build/browser verification, review the additive migration and check the hosted target in a fresh terminal using prisma7.config.ts. Apply committed migrations to the intended hosted database before pushing the new code for deployment. Do not use migrate reset. Vercel generates the Prisma client during its build but does not apply migrations.

After deployment, verify add, update without duplicates, persistence after refresh, unspecified proficiency, and removal using a disposable account. Mark the hosted checklist complete only after these checks.
