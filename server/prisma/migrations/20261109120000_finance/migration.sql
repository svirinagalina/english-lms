-- CreateTable
CREATE TABLE "FinanceIncome" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "studentName" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "lessons" INTEGER NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "amountOriginal" INTEGER,
    "tax" TEXT NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "teacherPerLesson" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpense" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ads',
    "note" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceIncome_sourceId_key" ON "FinanceIncome"("sourceId");
CREATE INDEX "FinanceIncome_schoolId_paidAt_idx" ON "FinanceIncome"("schoolId", "paidAt");
CREATE INDEX "FinanceExpense_schoolId_spentAt_idx" ON "FinanceExpense"("schoolId", "spentAt");

-- The first three (Galina, 2026-10-30): one «Ментор» package each at the
-- site's price, 18 990 ₽; Igor paid in roubles (НПД 4%), Pavel and Kristina in
-- euros (Spain, 20%); the teacher 1 000 ₽ a lesson. Only where they exist
-- (production), nothing elsewhere.
INSERT INTO "FinanceIncome" ("id", "schoolId", "studentId", "studentName", "paidAt", "lessons", "amountRub", "currency", "tax", "taxRate", "teacherPerLesson", "source", "sourceId", "note")
SELECT 'seed_' || u."id", u."schoolId", u."id", u."name", v.paid::timestamp, 9, 1899000, v.cur, v.tax, v.rate, 100000, 'seed', 'seed:' || u."id", 'Пакет «Ментор» по цене сайта'
FROM (VALUES
    ('cmuv6xd8b003bp201jpxpyxso', '2026-10-08 09:00', 'RUB', 'npd', 4.0),
    ('cmv6fjatt01bcoh01t9wsxtok', '2026-10-13 09:00', 'EUR', 'es', 20.0),
    ('cmvqnkt4y0008pa01bjbda6in', '2026-10-27 13:00', 'EUR', 'es', 20.0)
) AS v(id, paid, cur, tax, rate)
JOIN "User" u ON u."id" = v.id AND u."schoolId" IS NOT NULL;
