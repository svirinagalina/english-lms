-- AlterTable
ALTER TABLE "Textbook" ADD COLUMN "driveFileId" TEXT,
ADD COLUMN "driveSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TextbookAudio" ADD COLUMN "driveFileId" TEXT,
ADD COLUMN "driveSyncedAt" TIMESTAMP(3);
