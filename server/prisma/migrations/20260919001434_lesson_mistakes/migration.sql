-- AlterTable
ALTER TABLE "VocabCard" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "LessonMistake" (
    "id" TEXT NOT NULL,
    "said" TEXT NOT NULL,
    "correct" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "practicedCorrect" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "boardId" TEXT,
    "elementId" TEXT,

    CONSTRAINT "LessonMistake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonMistake_studentId_createdAt_idx" ON "LessonMistake"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonMistake_classroomId_idx" ON "LessonMistake"("classroomId");

-- AddForeignKey
ALTER TABLE "LessonMistake" ADD CONSTRAINT "LessonMistake_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonMistake" ADD CONSTRAINT "LessonMistake_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

