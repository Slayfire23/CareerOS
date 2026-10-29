import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Refuse to run unless the app's env files (resolved exactly as `next dev` does) point Auth and the
// database at the development Supabase project the test accounts belong to.
function assertDevelopmentProject() {
  const read = (file: string) => (existsSync(file) ? parse(readFileSync(file)) : {});
  const app = loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error }).combinedEnv;
  const expected = read(".env.playwright.local").E2E_SUPABASE_URL;
  const production = read(".env.hosted-production");
  const ref = (url?: string) => (url ? new URL(url).hostname.split(".")[0] : undefined);
  const devRef = ref(app.NEXT_PUBLIC_SUPABASE_URL);
  const prodRef = ref(production.NEXT_PUBLIC_SUPABASE_URL);
  const problems = [
    !expected && "set E2E_SUPABASE_URL in .env.playwright.local to the development project URL",
    expected && app.NEXT_PUBLIC_SUPABASE_URL !== expected && "NEXT_PUBLIC_SUPABASE_URL does not match E2E_SUPABASE_URL",
    devRef && !app.DATABASE_URL?.includes(devRef) && "DATABASE_URL is not the development project's database",
    prodRef && (devRef === prodRef || app.DATABASE_URL?.includes(prodRef)) && "the app is configured for the production project",
  ].filter(Boolean);
  if (problems.length) throw new Error(`Browser tests blocked: ${problems.join("; ")}.`);
}
assertDevelopmentProject();

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
