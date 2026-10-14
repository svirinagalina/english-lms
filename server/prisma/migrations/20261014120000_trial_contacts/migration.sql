-- Trial students who didn't buy, kept as contacts after their account is removed (a month after the trial).
CREATE TABLE "TrialContact" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "telegram" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "schoolBotChatId" TEXT,
    "source" TEXT NOT NULL,
    "adventStudentId" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL,
    "lessonAt" TIMESTAMP(3) NOT NULL,
    "teacherName" TEXT,
    "outcome" TEXT,
    "level" TEXT,
    "utm" JSONB,
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrialContact_schoolId_createdAt_idx" ON "TrialContact"("schoolId", "createdAt");
