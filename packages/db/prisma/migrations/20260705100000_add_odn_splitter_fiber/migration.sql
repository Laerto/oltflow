-- AlterTable
ALTER TABLE "Onu" ADD COLUMN     "splitterId" INTEGER;

-- CreateTable
CREATE TABLE "Splitter" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ratio" TEXT NOT NULL DEFAULT '1:8',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "oltId" INTEGER,
    "ponPort" TEXT,
    "parentSplitterId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Splitter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiberSegment" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'distribution',
    "path" JSONB NOT NULL,
    "oltId" INTEGER,
    "cores" INTEGER,
    "lengthM" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiberSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Splitter_oltId_idx" ON "Splitter"("oltId");

-- CreateIndex
CREATE INDEX "FiberSegment_oltId_idx" ON "FiberSegment"("oltId");

-- AddForeignKey
ALTER TABLE "Splitter" ADD CONSTRAINT "Splitter_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Splitter" ADD CONSTRAINT "Splitter_parentSplitterId_fkey" FOREIGN KEY ("parentSplitterId") REFERENCES "Splitter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberSegment" ADD CONSTRAINT "FiberSegment_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Onu" ADD CONSTRAINT "Onu_splitterId_fkey" FOREIGN KEY ("splitterId") REFERENCES "Splitter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
