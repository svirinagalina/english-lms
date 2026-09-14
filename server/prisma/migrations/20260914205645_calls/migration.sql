-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "hostId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classroomId" TEXT,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Call_token_key" ON "Call"("token");

-- CreateIndex
CREATE INDEX "Call_hostId_createdAt_idx" ON "Call"("hostId", "createdAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

