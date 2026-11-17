import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DEFAULT_TEXT_RULES } from "@/lib/ai/evidence-boundary";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { localTestReader } from "@/lib/ai/test-reader";

// The local browser-test switch for the opt-in reader v21a. It must never change a deployed default.
const LOCAL = "postgresql://127.0.0.1:54322/postgres";

describe("localTestReader: a guarded, local-only opt-in", () => {
  it("off unless asked for: the default (v21a since V1, D2) applies here", () => {
    expect(localTestReader({ DATABASE_URL: LOCAL })).toBeNull();
    expect(DEFAULT_TEXT_RULES).toBe("v21a");
    expect(RULES_VERSION).toBe("rules-v21a");
  });
  it("a local server can select the previous v21 to compare", () => {
    expect(localTestReader({ CAREEROS_TEST_READER: "v21", DATABASE_URL: LOCAL })).toBe("v21");
    expect(localTestReader({ CAREEROS_TEST_READER: "v21", DATABASE_URL: LOCAL, VERCEL: "1" })).toBeNull();
  });
  it("selects v21a for a local server that asks for it", () => {
    expect(localTestReader({ CAREEROS_TEST_READER: "v21a", DATABASE_URL: LOCAL })).toBe("v21a");
    expect(localTestReader({ CAREEROS_TEST_READER: "v21a", DATABASE_URL: "postgresql://localhost/db" })).toBe("v21a");
  });
  it("refused on Vercel, with a hosted database, or for any other value", () => {
    expect(localTestReader({ CAREEROS_TEST_READER: "v21a", DATABASE_URL: LOCAL, VERCEL: "1" })).toBeNull();
    expect(localTestReader({ CAREEROS_TEST_READER: "v21a", DATABASE_URL: LOCAL, VERCEL_ENV: "preview" })).toBeNull();
    expect(localTestReader({ CAREEROS_TEST_READER: "v21a", DATABASE_URL: "postgresql://db.example.supabase.co:5432/postgres" })).toBeNull();
    expect(localTestReader({ CAREEROS_TEST_READER: "v21a" })).toBeNull();
    for (const other of ["v22", "v20", "V21A", "V21", "true", ""]) expect(localTestReader({ CAREEROS_TEST_READER: other, DATABASE_URL: LOCAL })).toBeNull();
  });
});
