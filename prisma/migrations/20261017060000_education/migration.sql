CREATE TABLE "Education" (
 "id" UUID NOT NULL, "profileId" UUID NOT NULL,
 "qualification" VARCHAR(100) NOT NULL, "institution" VARCHAR(100) NOT NULL,
 "startMonth" VARCHAR(7) NOT NULL, "endMonth" VARCHAR(7), "fieldOfStudy" VARCHAR(100), "description" VARCHAR(5000),
 CONSTRAINT "Education_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Education_months_check" CHECK (
 "startMonth" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' AND
 ("endMonth" IS NULL OR ("endMonth" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' AND "endMonth" >= "startMonth")))
);
CREATE INDEX "Education_profileId_idx" ON "Education"("profileId");
ALTER TABLE "Education" ADD CONSTRAINT "Education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
