// Prepares the local Supabase stack (`npm run supabase:start`) for CareerOS. Idempotent:
// applies resume storage policies once, Prisma migrations, and two disposable test accounts.
// Refuses to touch anything that is not the local stack.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { parse } from "dotenv";
import pg from "pg";

const isLocal = (url) => ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
function fail(message) { console.error(`Refusing: ${message}`); process.exit(1); }

const local = parse(execSync("npx supabase status -o env", { encoding: "utf8" }));
const env = parse(readFileSync(".env"));
if (!isLocal(local.API_URL) || !isLocal(local.DB_URL)) fail("supabase status did not report a local stack.");
if (env.DATABASE_URL !== local.DB_URL) fail(".env DATABASE_URL is not the local Supabase database.");
if (env.NEXT_PUBLIC_SUPABASE_URL !== local.API_URL) fail(".env NEXT_PUBLIC_SUPABASE_URL is not the local Supabase API.");

const client = new pg.Client({ connectionString: local.DB_URL });
await client.connect();
const { rowCount } = await client.query("select 1 from pg_policies where schemaname = 'storage' and policyname = 'careeros_resume_read'");
if (rowCount) console.log("Resume storage policies already present.");
else { await client.query(readFileSync("supabase/resume-storage.sql", "utf8")); console.log("Applied supabase/resume-storage.sql."); }
await client.end();

const migrate = spawnSync("npx prisma migrate deploy --config prisma7.config.ts", { stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: local.DB_URL } });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

// Disposable accounts exist only in the local stack. Existing credentials are kept if they still sign in.
const file = ".env.playwright.local";
const current = existsSync(file) ? parse(readFileSync(file)) : {};
const accounts = [["E2E_TEST_EMAIL", "E2E_TEST_PASSWORD", "e2e-a@careeros.test"], ["E2E_TEST_EMAIL_B", "E2E_TEST_PASSWORD_B", "e2e-b@careeros.test"]];
const admin = { apikey: local.SERVICE_ROLE_KEY, Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const result = { E2E_SUPABASE_URL: local.API_URL };
for (const [emailKey, passwordKey, email] of accounts) {
  const keep = current.E2E_SUPABASE_URL === local.API_URL && current[emailKey] === email && current[passwordKey];
  if (keep) {
    const signIn = await fetch(`${local.API_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: local.ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: current[passwordKey] }) });
    if (signIn.ok) { Object.assign(result, { [emailKey]: email, [passwordKey]: current[passwordKey] }); continue; }
  }
  const password = randomBytes(18).toString("base64url");
  const list = await (await fetch(`${local.API_URL}/auth/v1/admin/users?per_page=1000`, { headers: admin })).json();
  const existing = list.users?.find((user) => user.email === email);
  const response = await fetch(`${local.API_URL}/auth/v1/admin/users${existing ? `/${existing.id}` : ""}`, { method: existing ? "PUT" : "POST", headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) });
  if (!response.ok) fail(`could not provision ${email}: ${response.status} ${await response.text()}`);
  Object.assign(result, { [emailKey]: email, [passwordKey]: password });
}
writeFileSync(file, Object.entries(result).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
console.log(`Local test accounts ready in ${file}.`);
