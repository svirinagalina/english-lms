-- AlterTable
ALTER TABLE "TrialReport" ADD COLUMN     "focusTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
