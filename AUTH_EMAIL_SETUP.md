# Email confirmation and password recovery

## Local configuration

Add the following to the existing ignored `.env` file without changing other values:

```dotenv
APP_URL=http://localhost:3000
```

In Supabase Authentication URL Configuration, use `http://localhost:3000` as the local Site URL and add both redirect URLs:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/update-password
```

Keep Confirm email enabled for signup. These handlers use the standard email template's `{{ .ConfirmationURL }}` link and the SSR client's PKCE flow; template editing is not required. If the templates were previously customized to token-hash links, they must be reconciled before testing. The callback here exchanges `code`; it does not consume token hashes or implicit-flow fragments.

Restart the dev server after updating `.env`. Start signup or recovery through CareerOS and open the newest link in the SAME browser and on the same hostname. Do not use an incognito session, another device, or `127.0.0.1` when the request used `localhost`. Browser-bound verification requires the original verifier cookie. The Supabase dashboard's Send password recovery button does not initiate this browser-bound request; use CareerOS's Forgot password form for this test.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

With the dev server running, also run `npx playwright test`. Expected totals after this change: 53 unit tests and 10 browser tests. The database integration suite remains separate with 6 tests. Do not run build and dev against the same `.next` directory concurrently; stop dev before building and restart it before browser tests.

Prepared October 16, 2026: all 53 unit tests and staged TypeScript checks passed in the chat workspace using installed project dependencies. Installation, full project lint/build, new browser tests, and actual email delivery still require verification in the project. Unit tests mock Supabase responses; browser tests added here do not send emails or change passwords.

## Manual email checks (pending)

1. Signup: use a fresh disposable email through `/signup`, open the newest confirmation email in the same browser, verify dashboard/profile creation, sign out and sign in again.
2. Recovery: sign out, use `/forgot-password` for a disposable account, open the email in the same browser, enter matching new passwords (12–128 characters), and verify the new password works and the previous password no longer works.
3. Try a used link in a signed-out browser and confirm the error page appears. Try an expired link when available.
4. If changing one of the automated test accounts, update its password in `.env.playwright.local` before rerunning authenticated browser tests. Never commit that file or share reset links/tokens.

Recovery responses intentionally do not disclose whether an account exists or guarantee delivery. Delivery failures/rate limits must be investigated in Supabase Auth logs. The default sender has documented recipient restrictions and low limits; successful delivery to one address does not establish that arbitrary addresses will work. Verify the brother's actual signup before considering public registration complete. No admin/service-role key is needed in CareerOS for these flows.

The update action validates the session on the server before changing a password; like Supabase's standard flow, an already authenticated account can also access this page. Changing a password is followed by current-browser sign-out. This does not claim immediate revocation of every already-issued access token on other devices.

## Deployment

Set APP_URL to the final HTTPS Vercel origin and configure the matching Site URL and callback redirect URLs in Supabase. Never build email URLs from untrusted Host or forwarded headers. The callback allows only the dashboard or password-update page, does not expose provider errors/tokens, and uses no-store/no-referrer headers. Code exchange provisions a career profile after successful signup confirmation. Public email delivery and recovery must be tested again on the deployed origin.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
