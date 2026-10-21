-- Students kept only for counting lessons held outside the platform.
ALTER TABLE "User" ADD COLUMN "offline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
