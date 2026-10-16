ALTER TABLE "Course" ADD COLUMN "priceRub" INTEGER, ADD COLUMN "accessDays" INTEGER;

CREATE TABLE "CourseAccess" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseAccess_courseId_userId_key" ON "CourseAccess"("courseId", "userId");
CREATE INDEX "CourseAccess_userId_idx" ON "CourseAccess"("userId");
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseOrder" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "messenger" TEXT,
    "note" TEXT,
    "rub" INTEGER NOT NULL,
    "amountCents" INTEGER,
    "currency" TEXT,
    "stripeSessionId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    CONSTRAINT "CourseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseOrder_stripeSessionId_key" ON "CourseOrder"("stripeSessionId");
CREATE INDEX "CourseOrder_courseId_status_idx" ON "CourseOrder"("courseId", "status");
ALTER TABLE "CourseOrder" ADD CONSTRAINT "CourseOrder_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
