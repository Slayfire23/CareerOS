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
  const ai = existsSync("ai-service/.env") ? parse(readFileSync("ai-service/.env")) : {};
  const isLocal = (url?: string) => { try { return ["127.0.0.1", "localhost"].includes(new URL(url!).hostname); } catch { return false; } };
  // Browser tests must never reach a paid AI provider: a cloud provider may only use the fictional
  // test key and the local mock API (ai-service/devtools/mock_anthropic.py).
  const cloudInAiService = (ai.AI_PROVIDERS ?? "").split(",").map(p => p.trim()).some(p => p && p !== "rules" && p !== "fake");
  const unsafeCloud = (cloudInAiService || ai.ANTHROPIC_API_KEY) &&
    (!(ai.ANTHROPIC_API_KEY ?? "").startsWith("sk-ant-test.") || !isLocal(ai.AI_ANTHROPIC_BASE_URL));
  const problems = [
    !isLocal(app.NEXT_PUBLIC_SUPABASE_URL) && "NEXT_PUBLIC_SUPABASE_URL is not the local Supabase API",
    !isLocal(app.DATABASE_URL) && "DATABASE_URL is not the local Supabase database",
    tests.E2E_SUPABASE_URL !== app.NEXT_PUBLIC_SUPABASE_URL && "E2E_SUPABASE_URL does not match the app (run npm run db:local:setup)",
    app.AI_SERVICE_URL && !isLocal(app.AI_SERVICE_URL) && "AI_SERVICE_URL is not a local AI service",
    unsafeCloud && "the AI service could reach a real AI provider (use the fictional test key and the local mock API)",
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
