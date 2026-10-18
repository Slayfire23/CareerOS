CREATE TABLE "ProjectAccomplishment" (
 "id" UUID NOT NULL, "profileId" UUID NOT NULL, "title" VARCHAR(100) NOT NULL,
 "description" VARCHAR(5000), "contribution" VARCHAR(5000), "results" VARCHAR(5000),
 "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "links" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 CONSTRAINT "ProjectAccomplishment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectAccomplishment_profileId_idx" ON "ProjectAccomplishment"("profileId");
ALTER TABLE "ProjectAccomplishment" ADD CONSTRAINT "ProjectAccomplishment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
