-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'LESSON';

-- CreateTable
CREATE TABLE "TrialReport" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "callId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "teacherLevel" TEXT,
    "comments" TEXT,
    "generated" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialReport_classroomId_idx" ON "TrialReport"("classroomId");

-- CreateIndex
CREATE INDEX "TrialReport_studentId_idx" ON "TrialReport"("studentId");

-- AddForeignKey
ALTER TABLE "TrialReport" ADD CONSTRAINT "TrialReport_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

