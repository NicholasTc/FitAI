-- CreateTable
CREATE TABLE "DailyHealthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sleepMinutes" INTEGER,
    "sleepEfficiency" DOUBLE PRECISION,
    "sleepDeepMin" INTEGER,
    "sleepRemMin" INTEGER,
    "sleepLightMin" INTEGER,
    "restingHr" DOUBLE PRECISION,
    "hrv" DOUBLE PRECISION,
    "steps" INTEGER,
    "activeMinutes" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "energyLevel" INTEGER NOT NULL,
    "stressLevel" INTEGER NOT NULL,
    "sleepQuality" INTEGER NOT NULL,
    "motivation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyHealthSnapshot_userId_idx" ON "DailyHealthSnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyHealthSnapshot_userId_date_key" ON "DailyHealthSnapshot"("userId", "date");

-- CreateIndex
CREATE INDEX "CheckIn_userId_idx" ON "CheckIn"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_userId_date_key" ON "CheckIn"("userId", "date");
