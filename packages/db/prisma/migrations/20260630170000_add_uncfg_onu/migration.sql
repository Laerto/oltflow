-- CreateTable
CREATE TABLE "UncfgOnu" (
    "id" SERIAL NOT NULL,
    "oltId" INTEGER NOT NULL,
    "ponPort" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "state" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UncfgOnu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UncfgOnu_oltId_idx" ON "UncfgOnu"("oltId");

-- CreateIndex
CREATE UNIQUE INDEX "UncfgOnu_oltId_serial_key" ON "UncfgOnu"("oltId", "serial");

-- AddForeignKey
ALTER TABLE "UncfgOnu" ADD CONSTRAINT "UncfgOnu_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
