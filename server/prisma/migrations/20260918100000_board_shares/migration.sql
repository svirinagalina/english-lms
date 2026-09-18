-- CreateTable
CREATE TABLE "_BoardShares" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BoardShares_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BoardShares_B_index" ON "_BoardShares"("B");

-- AddForeignKey
ALTER TABLE "_BoardShares" ADD CONSTRAINT "_BoardShares_A_fkey" FOREIGN KEY ("A") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BoardShares" ADD CONSTRAINT "_BoardShares_B_fkey" FOREIGN KEY ("B") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

