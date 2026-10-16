CREATE TABLE "HomeworkDoc" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Homework',
    "runs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "classroomId" TEXT NOT NULL,

    CONSTRAINT "HomeworkDoc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomeworkDoc_classroomId_idx" ON "HomeworkDoc"("classroomId");

ALTER TABLE "HomeworkDoc" ADD CONSTRAINT "HomeworkDoc_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
