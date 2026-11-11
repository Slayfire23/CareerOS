// Replays every migration into a throwaway shadow database and compares the result with the
// schema (`npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma
// --exit-code --config prisma.shadow-check.config.ts`). Local databases only.
import { defineConfig } from "prisma/config";

const local = "postgresql://careeros_test:local_test_only@127.0.0.1:5433";
const url = process.env.SHADOW_CHECK_DATABASE_URL ?? `${local}/careeros_test`;
const shadow = process.env.SHADOW_DATABASE_URL ?? `${local}/careeros_shadow`;
for (const value of [url, shadow]) {
  if (!["127.0.0.1", "localhost"].includes(new URL(value).hostname)) throw new Error("The migration check uses local databases only.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url, shadowDatabaseUrl: shadow },
});
