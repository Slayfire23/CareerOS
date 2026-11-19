// Migration rehearsal on a disposable LOCAL database (V1 release preparation, D6). It never accepts a non-local URL.
//   REHEARSAL_DATABASE_URL=postgresql://careeros_test:local_test_only@127.0.0.1:5433/<throwaway db> \
//   REHEARSAL_MIGRATIONS=<migrations directory, default prisma/migrations> \
//   npx prisma migrate deploy --config prisma.rehearsal.config.ts
// Used to replay production's migration history (main), then this branch's, then check drift. See
// docs/V1_PRODUCTION_MIGRATION_CHECKLIST.md.
import { defineConfig } from "prisma/config";

const url = process.env.REHEARSAL_DATABASE_URL ?? "";
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("The migration rehearsal uses a local database only (set REHEARSAL_DATABASE_URL).");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: process.env.REHEARSAL_MIGRATIONS ?? "prisma/migrations" },
  datasource: { url },
});
