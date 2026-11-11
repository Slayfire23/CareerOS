import { Client } from "pg";
import { TEST_DATABASE_URL } from "./local-database";

// Vitest global setup for the integration suite. The tests share one database, and the cloud budget
// checks are database-wide by design, so two runs at the same time make each other fail. This holds
// a Postgres session lock for the whole run and stops a second run at once with a clear message.
const LOCK_KEY = 461_302_771; // arbitrary, fixed

export default async function setup() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
  if (!rows[0]?.locked) {
    await client.end();
    throw new Error("Another integration test run is using the test database. Wait for it to finish, then run again.");
  }
  return async () => {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    await client.end();
  };
}
