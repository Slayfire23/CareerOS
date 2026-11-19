import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The evaluation runner (tests/eval/run-eval.eval.ts). Not part of the test suites: it may call the
// local bridge and Ollama, and it writes reports.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
  },
});
