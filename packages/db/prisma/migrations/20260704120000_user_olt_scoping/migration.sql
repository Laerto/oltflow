-- CreateTable
CREATE TABLE "_UserOlts" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserOlts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_UserOlts_B_index" ON "_UserOlts"("B");

-- AddForeignKey
ALTER TABLE "_UserOlts" ADD CONSTRAINT "_UserOlts_A_fkey" FOREIGN KEY ("A") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserOlts" ADD CONSTRAINT "_UserOlts_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
