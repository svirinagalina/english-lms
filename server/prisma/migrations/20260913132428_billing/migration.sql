-- AlterTable
ALTER TABLE "School" ADD COLUMN     "paymentDetails" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "paidUntil" TIMESTAMP(3),
ADD COLUMN     "paymentLink" TEXT,
ADD COLUMN     "priceAmount" INTEGER,
ADD COLUMN     "priceCurrency" TEXT NOT NULL DEFAULT 'RUB';
