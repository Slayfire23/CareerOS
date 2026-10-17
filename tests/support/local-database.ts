// Test-only credentials for the isolated Docker container. Never load .env here.
export const TEST_DATABASE_URL =
  "postgresql://careeros_test:local_test_only@127.0.0.1:5433/careeros_test";
