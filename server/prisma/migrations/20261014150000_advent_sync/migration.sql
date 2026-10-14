-- Everything the platform tells Maxim's site goes through an outbox with retries.
ALTER TABLE "User" ADD COLUMN "adventPaidSeen" TEXT;

CREATE TABLE "AdventOutbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "body" JSONB,
    "lessonId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "failedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdventOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdventOutbox_doneAt_nextAt_idx" ON "AdventOutbox"("doneAt", "nextAt");
