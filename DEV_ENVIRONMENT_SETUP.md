# Development Supabase project

CareerOS uses three separate environments:

| Environment | Auth, Storage, database | Local file | Used by |
|---|---|---|---|
| Production | Live Supabase project | `.env.hosted-production` (local copy, for reviewed migrations only) | Vercel (its own variables), `prisma.production.config.ts` |
| Development | Dedicated dev Supabase project | `.env` | `npm run dev`, `prisma7.config.ts`, all Playwright tests |
| Integration tests | Local Docker PostgreSQL (no Auth) | none (fixed in `tests/support/local-database.ts`) | `prisma.integration.config.ts`, `vitest.integration.config.mts` |

All `.env*` files are ignored by Git. Never commit them, paste their values into chat or issues, or add them to Vercel.

## 1. Create the project (Supabase dashboard)

1. New project, for example `careeros-dev`, in the same organization. A region near the production project (`us-east-2`) is fine.
2. Save the database password in your password manager.

## 2. Authentication (dev project → Authentication)

- URL Configuration → Site URL: `http://localhost:3000`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/callback?next=/update-password`
- Sign In / Providers → Email: enabled, **Confirm email** on.
- Match any other settings you changed in production (password requirements, rate limits, email templates). The app's own forms require 12–128-character passwords.

## 3. Storage (dev project → SQL Editor)

Run the reviewed [supabase/resume-storage.sql](supabase/resume-storage.sql) once. It creates the private `careeros-resumes` bucket (PDF only, 2 MiB) and the owner-folder policies.

## 4. Local environment files

1. Production values were copied, unchanged, to `.env.hosted-production` and `.env.playwright.hosted-production`.
2. Edit `.env` and replace only these values with the dev project's values:
   - `DATABASE_URL`: Connect → **Session pooler** connection string (port 5432), with the URL-encoded password.
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://<dev-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: dev project → Settings → API Keys.
   - Keep `APP_URL=http://localhost:3000`.

## 5. Database schema

Review the target first; the Datasource line must show the dev project's pooler user (`postgres.<dev-ref>`):

```powershell
npx prisma migrate status --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
```

This applies the committed migrations, including `20261028010000_enable_row_level_security`.

## 6. Browser-test accounts

Dev project → Authentication → Users → Add user → Create new user, twice, with **Auto Confirm User** checked. Use two disposable addresses that are **not** registered in production, so a successful sign-in proves the app is using the dev project.

Then replace `.env.playwright.local` with:

```dotenv
E2E_SUPABASE_URL=https://<dev-ref>.supabase.co
E2E_TEST_EMAIL=...
E2E_TEST_PASSWORD=...
E2E_TEST_EMAIL_B=...
E2E_TEST_PASSWORD_B=...
```

`playwright.config.ts` refuses to run if any of these are true:

- `.env` (resolved the way `next dev` resolves it) doesn't match `E2E_SUPABASE_URL`.
- `DATABASE_URL` belongs to a different project.
- Anything points at the production project.

## 7. Verify

```powershell
npm run dev
npx playwright test
```

## Production migrations (approval required)

```powershell
npx prisma migrate status --config prisma.production.config.ts
npx prisma migrate deploy --config prisma.production.config.ts
```

Production Auth URLs, Storage, and Vercel variables are unchanged by this setup.
