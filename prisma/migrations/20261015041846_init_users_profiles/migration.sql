-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "supabaseAuthId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "headline" VARCHAR(200),
    "careerGoals" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerProfile_userId_key" ON "CareerProfile"("userId");

-- AddForeignKey
ALTER TABLE "CareerProfile" ADD CONSTRAINT "CareerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
