-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActivityDay" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 1,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityDay_pkey" PRIMARY KEY ("userId","day","section")
);

-- CreateIndex
CREATE INDEX "ActivityDay_userId_lastAt_idx" ON "ActivityDay"("userId", "lastAt");

-- AddForeignKey
ALTER TABLE "ActivityDay" ADD CONSTRAINT "ActivityDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
