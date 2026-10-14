-- Payments stay on the platform (Galina, 2026-10-14): Maxim's site is only the way in for trials.
ALTER TABLE "User" DROP COLUMN "adventPaidSeen";
DELETE FROM "AdventOutbox" WHERE "kind" = 'payment' AND "doneAt" IS NULL;
