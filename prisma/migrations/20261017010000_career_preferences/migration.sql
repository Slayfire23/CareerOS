-- Additive only: preserve every existing profile and its free-text career goals.
ALTER TABLE "CareerProfile"
ADD COLUMN "targetRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "industries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "workArrangements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "employmentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
