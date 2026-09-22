-- CreateTable
CREATE TABLE "TextbookAudio" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "textbookId" TEXT NOT NULL,

    CONSTRAINT "TextbookAudio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TextbookAudio_textbookId_idx" ON "TextbookAudio"("textbookId");

-- AddForeignKey
ALTER TABLE "TextbookAudio" ADD CONSTRAINT "TextbookAudio_textbookId_fkey" FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
