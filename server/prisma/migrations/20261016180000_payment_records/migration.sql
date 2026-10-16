CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lessons" INTEGER,
    "amountCents" INTEGER,
    "currency" TEXT,
    "card" TEXT,
    "note" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentRecord_studentId_createdAt_idx" ON "PaymentRecord"("studentId", "createdAt");
