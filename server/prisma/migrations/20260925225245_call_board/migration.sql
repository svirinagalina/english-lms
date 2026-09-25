-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "boardId" TEXT;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE SET NULL ON UPDATE CASCADE;
