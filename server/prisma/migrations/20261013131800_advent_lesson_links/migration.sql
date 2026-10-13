-- AlterTable
ALTER TABLE "AdventLesson" ADD COLUMN     "studentToken" TEXT,
ADD COLUMN     "studentUserId" TEXT,
ADD COLUMN     "teacherNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "teacherToken" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "viaLink" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "AdventLesson_studentToken_key" ON "AdventLesson"("studentToken");

-- CreateIndex
CREATE UNIQUE INDEX "AdventLesson_teacherToken_key" ON "AdventLesson"("teacherToken");

