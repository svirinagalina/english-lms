-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "runs" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "classroomId" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_classroomId_key" ON "Document"("classroomId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

