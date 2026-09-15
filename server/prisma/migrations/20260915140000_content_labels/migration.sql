-- A content item can be meant for several networks and formats at once.
ALTER TABLE "ContentItem" ADD COLUMN "networks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ContentItem" ADD COLUMN "formats" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "ContentItem" SET "networks" = ARRAY["network"] WHERE "network" IS NOT NULL AND "network" <> '';
UPDATE "ContentItem" SET "formats" = ARRAY["format"] WHERE "format" IS NOT NULL AND "format" <> '';

ALTER TABLE "ContentItem" DROP COLUMN "network";
ALTER TABLE "ContentItem" DROP COLUMN "format";
