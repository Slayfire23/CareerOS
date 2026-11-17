// Local browser tests only: select a reader version for a whole local server, to compare the default with the previous
// one in the real workflow. Set CAREEROS_TEST_READER in a local launch entry: "v21" (the previous default) or "v21a" (the
// default since V1, D2). It is refused on Vercel and unless the database is local (127.0.0.1 or localhost), so it can never
// change a deployed default. Without it, the default applies. Pure apart from reading the environment it is given.

const LOCAL_DATABASE = /^postgres(?:ql)?:\/\/(?:[^@/]*@)?(?:127\.0\.0\.1|localhost)(?::\d+)?\//;
const SELECTABLE = ["v21", "v21a"] as const;

export function localTestReader(env: Record<string, string | undefined> = process.env): (typeof SELECTABLE)[number] | null {
  const asked = env.CAREEROS_TEST_READER;
  if (!SELECTABLE.includes(asked as (typeof SELECTABLE)[number])) return null;
  if (env.VERCEL || env.VERCEL_ENV) return null;
  if (!LOCAL_DATABASE.test(env.DATABASE_URL ?? "")) return null;
  return asked as (typeof SELECTABLE)[number];
}
