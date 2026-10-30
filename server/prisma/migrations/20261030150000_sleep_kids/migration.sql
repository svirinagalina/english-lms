-- AlterTable
ALTER TABLE "SleepStory" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'sleep',
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
