// Fails if a tracked file contains something that looks like a real secret, or if an env file
// is tracked. Runs in CI and locally (`npm run check:secrets`). Local-only test values that are
// documented in the repository are allowed explicitly.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const PATTERNS = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JSON web token", /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ["database URL with password", /postgres(?:ql)?:\/\/[^\s:@/"'`]+:([^\s@/"'`]+)@([^\s/:"'`]+)/],
];
// Documented local-only credentials (test container and local Supabase defaults).
const ALLOWED_DB = new Set(["local_test_only@127.0.0.1", "postgres@127.0.0.1", "postgres@localhost", "local_test_only@localhost"]);
const PLACEHOLDER = /^(<[^>]+>|\$\{?[A-Z_]+\}?|password|PASSWORD|\*+|x+)$/;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];
for (const file of files) {
  const name = file.split("/").pop();
  if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") problems.push(`${file}: environment files must not be committed`);
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [label, pattern] of PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      if (label === "database URL with password") {
        const [, password, host] = match;
        if (PLACEHOLDER.test(password) || ALLOWED_DB.has(`${password}@${host}`)) continue;
      }
      problems.push(`${file}:${i + 1}: possible ${label}`);
    }
  });
}

if (problems.length) {
  console.error(`Secret check failed:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Secret check passed (${files.length} tracked files).`);
