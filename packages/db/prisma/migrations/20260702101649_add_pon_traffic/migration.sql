-- CreateTable
CREATE TABLE "PonTraffic" (
    "id" BIGSERIAL NOT NULL,
    "oltId" INTEGER NOT NULL,
    "ponPort" TEXT NOT NULL,
    "downBps" DOUBLE PRECISION NOT NULL,
    "upBps" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PonTraffic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PonTraffic_oltId_recordedAt_idx" ON "PonTraffic"("oltId", "recordedAt");

-- CreateIndex
CREATE INDEX "PonTraffic_oltId_ponPort_recordedAt_idx" ON "PonTraffic"("oltId", "ponPort", "recordedAt");

-- AddForeignKey
ALTER TABLE "PonTraffic" ADD CONSTRAINT "PonTraffic_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
