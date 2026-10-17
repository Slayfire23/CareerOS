# Location and commute preferences

Preferred locations: up to 10 cities/regions, one per line, 100 characters each. Trim and deduplicate without splitting commas. Relocation: unspecified (null), yes, no, or undecided. Maximum one-way commute: optional whole minutes, 0–300; blank is null and zero remains zero. These are preferences, not a home address or calculated travel times. No geocoding is performed. A separate authenticated action updates only these fields and preserves other profile information. All fields can be cleared.

Apply the additive migration to local test PostgreSQL first using prisma.integration.config.ts; regenerate the client and restart the app against that local database. Verify tests/build before hosted migration and deployment.

Verification: 112 unit tests, 13 database tests, TypeScript and lint passed. Restart the development server to load the generated Prisma client. Run the production build and all 14 browser tests before hosted migration.
