-- Trial lessons booked on the platform: teachers' free windows, and where a booking came from.
ALTER TABLE "AdventLesson" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'advent';
ALTER TABLE "AdventLesson" ADD COLUMN "utm" JSONB;

CREATE TABLE "TrialWindow" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "recurrence" TEXT,
    "recurrenceEndDate" TIMESTAMP(3),
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialWindow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrialWindow_teacherId_idx" ON "TrialWindow"("teacherId");
ALTER TABLE "TrialWindow" ADD CONSTRAINT "TrialWindow_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
