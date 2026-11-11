import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/support/local-database";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    fileParallelism: false,
    // One run at a time: the suite shares a database (see tests/support/integration-lock.ts).
    globalSetup: ["./tests/support/integration-lock.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
