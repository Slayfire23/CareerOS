// Drift check: compares a database migrated from scratch with `prisma migrate deploy` (CI's previous step) with the schema
// (`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --config
// prisma.shadow-check.config.ts`). Local databases only. A shadow-database replay (`--from-migrations`) isn't used: Prisma
// resets the shadow database, and migration 20261028010000 keeps its original, production-applied statement on
// _prisma_migrations, which needs that table (V1 release preparation, D6).
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
