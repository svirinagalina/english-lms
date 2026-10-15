-- After payment a trial student is invited by email and gets the welcome guide (afterPayment.js).
ALTER TABLE "User" ADD COLUMN "inviteEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "welcomedAt" TIMESTAMP(3);
-- Everyone already registered counts as welcomed: the guide goes only to those who register from now on.
UPDATE "User" SET "welcomedAt" = CURRENT_TIMESTAMP WHERE "role" = 'STUDENT' AND "viaLink" = false;
