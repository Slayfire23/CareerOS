# Salary expectations

Optional gross base-pay preferences, excluding bonuses/equity. Minimum or maximum may be blank. At least one amount requires both a currency (USD/CAD/EUR/GBP) and period (hour/month/year). Both amounts blank clears all salary fields. Nonnegative amounts up to 9,999,999.99 with at most two decimals; minimum must not exceed maximum. Zero is distinct from unspecified. No currency conversion or annualization is performed.

Amounts are stored as integer cents, avoiding floating-point currency calculations and Prisma Decimal serialization. A separate server action updates only salary fields scoped to verified identity. Existing fields are preserved. First apply the additive migration to isolated local PostgreSQL, generate the client, restart the local app, and verify tests/build before hosted rollout.

Verification: 135 unit tests, 14 database tests, TypeScript and lint passed. Restart the app against local test PostgreSQL to load the generated client, then run build and all 15 browser tests. Hosted migration remains pending.
