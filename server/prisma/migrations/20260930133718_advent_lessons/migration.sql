-- CreateTable
CREATE TABLE "AdventLesson" (
    "id" TEXT NOT NULL,
    "adventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "teacherId" TEXT NOT NULL,
    "studentAdventId" TEXT,
    "studentName" TEXT,
    "studentTelegram" TEXT,
    "studentEmail" TEXT,
    "calendarEventId" TEXT,
    "callId" TEXT,
    "classroomId" TEXT,
    "teacherJoinedAt" TIMESTAMP(3),
    "teacherLeftAt" TIMESTAMP(3),
    "studentJoinedAt" TIMESTAMP(3),
    "studentLeftAt" TIMESTAMP(3),
    "startedSentAt" TIMESTAMP(3),
    "finishedSentAt" TIMESTAMP(3),
    "outcome" TEXT,
    "reportSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdventLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdventEvent" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdventEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdventLesson_adventId_key" ON "AdventLesson"("adventId");

-- CreateIndex
CREATE UNIQUE INDEX "AdventLesson_callId_key" ON "AdventLesson"("callId");

-- CreateIndex
CREATE INDEX "AdventLesson_teacherId_startsAt_idx" ON "AdventLesson"("teacherId", "startsAt");
