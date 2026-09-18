-- CreateTable
CREATE TABLE "LessonSummary" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "words" JSONB NOT NULL DEFAULT '[]',
    "mistakeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "withAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonSummary_sessionId_key" ON "LessonSummary"("sessionId");

-- CreateIndex
CREATE INDEX "LessonSummary_classroomId_createdAt_idx" ON "LessonSummary"("classroomId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonSummary_studentId_idx" ON "LessonSummary"("studentId");

-- AddForeignKey
ALTER TABLE "LessonSummary" ADD CONSTRAINT "LessonSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

