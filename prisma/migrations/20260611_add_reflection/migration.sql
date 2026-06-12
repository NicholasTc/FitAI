-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "accuracy" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reflection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reflection_userId_idx" ON "Reflection"("userId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Reflection_userId_date_key" ON "Reflection"("userId", "date");
