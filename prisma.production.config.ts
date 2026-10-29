// Hosted production database. Use only for reviewed `migrate status` / `migrate deploy`.
// Its credentials live in the ignored .env.hosted-production file; .env is the development project.
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";

const file = ".env.hosted-production";
if (!existsSync(file)) throw new Error(`${file} is missing; production migrations are unavailable.`);
const url = parse(readFileSync(file)).DATABASE_URL;
if (!url) throw new Error(`${file} has no DATABASE_URL.`);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
