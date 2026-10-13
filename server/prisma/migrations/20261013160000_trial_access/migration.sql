-- AlterTable
ALTER TABLE "AdventLesson" ADD COLUMN     "studentWaitingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trialAccessUntil" TIMESTAMP(3);

