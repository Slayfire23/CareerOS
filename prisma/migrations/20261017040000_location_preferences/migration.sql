ALTER TABLE "CareerProfile"
ADD COLUMN "preferredLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "relocationWillingness" VARCHAR(10),
ADD COLUMN "maxCommuteMinutes" INTEGER,
ADD CONSTRAINT "CareerProfile_relocation_check" CHECK ("relocationWillingness" IS NULL OR "relocationWillingness" IN ('yes','no','undecided')),
ADD CONSTRAINT "CareerProfile_commute_check" CHECK ("maxCommuteMinutes" IS NULL OR "maxCommuteMinutes" BETWEEN 0 AND 300);
