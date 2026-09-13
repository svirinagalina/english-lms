-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('TRANSLATE', 'FILL_BLANK', 'CHOICE', 'WORD_ORDER', 'MATCHING');

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theory" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "type" "ExerciseType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabSet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "VocabSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabCard" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "example" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "setId" TEXT NOT NULL,

    CONSTRAINT "VocabCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardReview" (
    "id" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastResult" BOOLEAN,
    "cardId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "CardReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unit_schoolId_idx" ON "Unit"("schoolId");

-- CreateIndex
CREATE INDEX "Exercise_unitId_idx" ON "Exercise"("unitId");

-- CreateIndex
CREATE INDEX "Attempt_studentId_createdAt_idx" ON "Attempt"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_exerciseId_idx" ON "Attempt"("exerciseId");

-- CreateIndex
CREATE INDEX "VocabSet_schoolId_idx" ON "VocabSet"("schoolId");

-- CreateIndex
CREATE INDEX "VocabCard_setId_idx" ON "VocabCard"("setId");

-- CreateIndex
CREATE INDEX "CardReview_studentId_dueAt_idx" ON "CardReview"("studentId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardReview_cardId_studentId_key" ON "CardReview"("cardId", "studentId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabSet" ADD CONSTRAINT "VocabSet_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabCard" ADD CONSTRAINT "VocabCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "VocabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "VocabCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
