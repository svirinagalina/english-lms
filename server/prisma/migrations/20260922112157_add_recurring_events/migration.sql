-- AlterTable
ALTER TABLE "UserCalendarEvent" ADD COLUMN     "recurrence" TEXT,
ADD COLUMN     "recurrenceEndDate" TIMESTAMP(3);
