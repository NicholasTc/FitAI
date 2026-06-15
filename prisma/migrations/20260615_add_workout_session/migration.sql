-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "typeLabel" TEXT NOT NULL,
    "typeRaw" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "source" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_date_idx" ON "WorkoutSession"("userId", "date");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "WorkoutSession_userId_startTime_key" ON "WorkoutSession"("userId", "startTime");
