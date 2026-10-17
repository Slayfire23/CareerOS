import { defineConfig } from "prisma/config";
import { TEST_DATABASE_URL } from "./tests/support/local-database";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: TEST_DATABASE_URL },
});
