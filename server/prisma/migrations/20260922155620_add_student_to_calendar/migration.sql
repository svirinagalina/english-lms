-- AlterTable
ALTER TABLE "UserCalendarEvent" ADD COLUMN     "studentId" TEXT;

-- CreateIndex
CREATE INDEX "UserCalendarEvent_studentId_idx" ON "UserCalendarEvent"("studentId");

-- AddForeignKey
ALTER TABLE "UserCalendarEvent" ADD CONSTRAINT "UserCalendarEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
