CREATE TYPE "SkillProficiency" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

CREATE TABLE "TechnicalSkill" (
  "id" UUID NOT NULL,
  "profileId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "normalizedName" VARCHAR(100) NOT NULL,
  "proficiency" "SkillProficiency",
  CONSTRAINT "TechnicalSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TechnicalSkill_profileId_normalizedName_key" ON "TechnicalSkill"("profileId", "normalizedName");
ALTER TABLE "TechnicalSkill" ADD CONSTRAINT "TechnicalSkill_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
