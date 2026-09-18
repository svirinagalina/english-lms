-- AlterTable
ALTER TABLE "VocabCard" ADD COLUMN     "audio" TEXT,
ADD COLUMN     "transcription" TEXT;

-- AlterTable
ALTER TABLE "VocabSet" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "VocabSet_ownerId_idx" ON "VocabSet"("ownerId");

-- AddForeignKey
ALTER TABLE "VocabSet" ADD CONSTRAINT "VocabSet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

