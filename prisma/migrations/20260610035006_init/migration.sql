-- CreateTable
CREATE TABLE "DailyHealthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sleepMinutes" INTEGER,
    "sleepEfficiency" REAL,
    "sleepDeepMin" INTEGER,
    "sleepRemMin" INTEGER,
    "sleepLightMin" INTEGER,
    "restingHr" REAL,
    "hrv" REAL,
    "steps" INTEGER,
    "activeMinutes" INTEGER,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "energyLevel" INTEGER NOT NULL,
    "stressLevel" INTEGER NOT NULL,
    "sleepQuality" INTEGER NOT NULL,
    "motivation" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DailyHealthSnapshot_userId_idx" ON "DailyHealthSnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyHealthSnapshot_userId_date_key" ON "DailyHealthSnapshot"("userId", "date");

-- CreateIndex
CREATE INDEX "CheckIn_userId_idx" ON "CheckIn"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_userId_date_key" ON "CheckIn"("userId", "date");
