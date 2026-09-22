/*
  Warnings:

  - You are about to drop the column `studentId` on the `UserCalendarEvent` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserCalendarEvent" DROP CONSTRAINT "UserCalendarEvent_studentId_fkey";

-- DropIndex
DROP INDEX "UserCalendarEvent_studentId_idx";

-- AlterTable
ALTER TABLE "UserCalendarEvent" DROP COLUMN "studentId",
ADD COLUMN     "studentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
