import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Refuse to run unless the app's env files (resolved exactly as `next dev` does) point Auth and the
// database at the local Supabase stack that the test accounts belong to. Hosted projects are never allowed.
function assertLocalSupabase() {
  const app = loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error }).combinedEnv;
  const tests = existsSync(".env.playwright.local") ? parse(readFileSync(".env.playwright.local")) : {};
  const isLocal = (url?: string) => { try { return ["127.0.0.1", "localhost"].includes(new URL(url!).hostname); } catch { return false; } };
  const problems = [
    !isLocal(app.NEXT_PUBLIC_SUPABASE_URL) && "NEXT_PUBLIC_SUPABASE_URL is not the local Supabase API",
    !isLocal(app.DATABASE_URL) && "DATABASE_URL is not the local Supabase database",
    tests.E2E_SUPABASE_URL !== app.NEXT_PUBLIC_SUPABASE_URL && "E2E_SUPABASE_URL does not match the app (run npm run db:local:setup)",
    app.AI_SERVICE_URL && !isLocal(app.AI_SERVICE_URL) && "AI_SERVICE_URL is not a local AI service",
  ].filter(Boolean);
  if (problems.length) throw new Error(`Browser tests blocked: ${problems.join("; ")}.`);
}
assertLocalSupabase();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 15000 },
  reporter: "list",
  outputDir: join(tmpdir(), "careeros-playwright-results"),
  use: {
    baseURL: "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Start CareerOS in a separate terminal before running these tests.
});
