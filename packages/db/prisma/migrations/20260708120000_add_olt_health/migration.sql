-- CreateTable
CREATE TABLE "OltHealth" (
    "id" BIGSERIAL NOT NULL,
    "oltId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "card" TEXT NOT NULL,
    "cpu" DOUBLE PRECISION NOT NULL,
    "temp" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OltHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OltHealth_oltId_recordedAt_idx" ON "OltHealth"("oltId", "recordedAt");

-- CreateIndex
CREATE INDEX "OltHealth_oltId_slot_recordedAt_idx" ON "OltHealth"("oltId", "slot", "recordedAt");

-- AddForeignKey
ALTER TABLE "OltHealth" ADD CONSTRAINT "OltHealth_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
