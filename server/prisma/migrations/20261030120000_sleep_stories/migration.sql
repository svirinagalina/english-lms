-- CreateTable
CREATE TABLE "SleepStory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 2,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "SleepStory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleepStory_schoolId_idx" ON "SleepStory"("schoolId");

-- AddForeignKey
ALTER TABLE "SleepStory" ADD CONSTRAINT "SleepStory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
