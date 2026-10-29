import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const original = process.env.DATABASE_URL;
beforeEach(() => {
  vi.resetModules();
  delete (globalThis as { prisma?: unknown }).prisma;
});
afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = original;
});

it("can be imported without DATABASE_URL, so builds need no database", async () => {
  delete process.env.DATABASE_URL;
  await expect(import("@/lib/db")).resolves.toHaveProperty("prisma");
});

it("still refuses to run a query without DATABASE_URL, with no fallback connection", async () => {
  delete process.env.DATABASE_URL;
  const { prisma } = await import("@/lib/db");
  expect(() => prisma.careerProfile).toThrow("DATABASE_URL is missing.");
  expect(() => prisma.$transaction).toThrow("DATABASE_URL is missing.");
});

it("creates one client on first use and binds its methods", async () => {
  process.env.DATABASE_URL = "postgresql://user:password@127.0.0.1:1/never_connected";
  const { prisma } = await import("@/lib/db");
  expect(prisma.careerProfile).toBe(prisma.careerProfile);
  expect(typeof prisma.$disconnect).toBe("function");
  await prisma.$disconnect();
});
