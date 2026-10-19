-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "telegram" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
