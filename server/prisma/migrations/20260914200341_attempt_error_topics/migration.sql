-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "errorTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];

