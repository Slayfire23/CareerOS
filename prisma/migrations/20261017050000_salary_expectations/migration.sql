ALTER TABLE "CareerProfile"
ADD COLUMN "salaryMinCents" INTEGER,
ADD COLUMN "salaryMaxCents" INTEGER,
ADD COLUMN "salaryCurrency" VARCHAR(3),
ADD COLUMN "salaryPeriod" VARCHAR(5),
ADD CONSTRAINT "CareerProfile_salary_check" CHECK (
 ("salaryMinCents" IS NULL OR "salaryMinCents" BETWEEN 0 AND 999999999) AND
 ("salaryMaxCents" IS NULL OR "salaryMaxCents" BETWEEN 0 AND 999999999) AND
 ("salaryMinCents" IS NULL OR "salaryMaxCents" IS NULL OR "salaryMinCents" <= "salaryMaxCents") AND
 (("salaryMinCents" IS NULL AND "salaryMaxCents" IS NULL AND "salaryCurrency" IS NULL AND "salaryPeriod" IS NULL) OR
 (("salaryMinCents" IS NOT NULL OR "salaryMaxCents" IS NOT NULL) AND "salaryCurrency" IS NOT NULL AND "salaryCurrency" IN ('USD','CAD','EUR','GBP') AND "salaryPeriod" IS NOT NULL AND "salaryPeriod" IN ('hour','month','year')))
);
