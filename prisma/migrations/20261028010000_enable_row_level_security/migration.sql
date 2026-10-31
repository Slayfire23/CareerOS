-- Production already has RLS enabled on every table (set outside migrations); this records that
-- state so new environments match. Idempotent. No policies are added: browser Data API access stays
-- denied, while Prisma connects as the table owner, which bypasses RLS.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CareerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TechnicalSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfessionalExperience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Education" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectAccomplishment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedJob" ENABLE ROW LEVEL SECURITY;
-- Guarded: Prisma's shadow database replays migrations without its _prisma_migrations table.
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
