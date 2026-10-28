-- More tabs of a Writing or homework document; the document itself is tab 1.
CREATE TABLE "DocTab" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "runs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocTab_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocTab_key_idx" ON "DocTab"("key");
