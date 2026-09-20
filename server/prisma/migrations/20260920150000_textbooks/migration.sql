-- CreateTable
CREATE TABLE "Textbook" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "pages" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Textbook_schoolId_idx" ON "Textbook"("schoolId");

-- AddForeignKey
ALTER TABLE "Textbook" ADD CONSTRAINT "Textbook_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
