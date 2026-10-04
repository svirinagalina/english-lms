-- AlterTable
ALTER TABLE "User" ADD COLUMN     "plan" TEXT,
ADD COLUMN     "planSource" TEXT,
ADD COLUMN     "planUntil" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;
