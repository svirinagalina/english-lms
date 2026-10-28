-- A tab's own name (Writing tabs); no row = "Tab N".
CREATE TABLE "DocTabName" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "DocTabName_pkey" PRIMARY KEY ("key")
);
