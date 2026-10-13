-- The school's Telegram bot: who connected which chat, and what the bot has announced.
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramName" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "telegramPaidSeen" TEXT;

ALTER TABLE "AdventLesson" ADD COLUMN "teacherConfirmedAt" TIMESTAMP(3);
ALTER TABLE "AdventLesson" ADD COLUMN "botStartsAt" TIMESTAMP(3);
ALTER TABLE "AdventLesson" ADD COLUMN "botTeacherId" TEXT;
