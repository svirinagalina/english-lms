-- CreateTable
CREATE TABLE "ToeflWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "item" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "text" TEXT,
    "audioPath" TEXT,
    "aiScore" DOUBLE PRECISION,
    "aiFeedback" JSONB,
    "teacherScore" DOUBLE PRECISION,
    "teacherComment" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToeflWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToeflResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "band" DOUBLE PRECISION,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToeflResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToeflWork_userId_createdAt_idx" ON "ToeflWork"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ToeflWork_blockId_idx" ON "ToeflWork"("blockId");

-- CreateIndex
CREATE INDEX "ToeflResult_userId_createdAt_idx" ON "ToeflResult"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ToeflWork" ADD CONSTRAINT "ToeflWork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeflResult" ADD CONSTRAINT "ToeflResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
