-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "lessonId" TEXT NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Board_lessonId_key" ON "Board"("lessonId");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
