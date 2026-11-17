// Local browser tests only: select the opt-in reader "v21a" for a whole local server, to test the real workflow before any
// adoption decision. Set CAREEROS_TEST_READER=v21a in a local launch entry. It is refused on Vercel and unless the
// database is local (127.0.0.1 or localhost), so it can never change a deployed default. Without it, nothing changes.
// Pure apart from reading the environment it is given.

const LOCAL_DATABASE = /^postgres(?:ql)?:\/\/(?:[^@/]*@)?(?:127\.0\.0\.1|localhost)(?::\d+)?\//;

export function localTestReader(env: Record<string, string | undefined> = process.env): "v21a" | null {
  if (env.CAREEROS_TEST_READER !== "v21a") return null;
  if (env.VERCEL || env.VERCEL_ENV) return null;
  if (!LOCAL_DATABASE.test(env.DATABASE_URL ?? "")) return null;
  return "v21a";
}
