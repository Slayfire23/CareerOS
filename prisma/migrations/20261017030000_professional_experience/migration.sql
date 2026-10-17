CREATE TABLE "ProfessionalExperience" (
 "id" UUID NOT NULL, "profileId" UUID NOT NULL,
 "jobTitle" VARCHAR(100) NOT NULL, "company" VARCHAR(100) NOT NULL,
 "startMonth" VARCHAR(7) NOT NULL, "endMonth" VARCHAR(7), "description" VARCHAR(5000),
 CONSTRAINT "ProfessionalExperience_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProfessionalExperience_months_check" CHECK (
 "startMonth" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' AND
 ("endMonth" IS NULL OR ("endMonth" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' AND "endMonth" >= "startMonth")))
);
CREATE INDEX "ProfessionalExperience_profileId_idx" ON "ProfessionalExperience"("profileId");
ALTER TABLE "ProfessionalExperience" ADD CONSTRAINT "ProfessionalExperience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
