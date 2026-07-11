-- Phase 1 foundation: persisted alarms, DB-backed settings, sessions, denormalized
-- latest signal on Onu + search indexes for fleet-scale alarm ticks and keyset search.

-- AlterTable Onu: denormalized latest optical reading
ALTER TABLE "Onu" ADD COLUMN "lastOnuRx" DOUBLE PRECISION,
ADD COLUMN "lastSignalLevel" TEXT,
ADD COLUMN "lastSignalAt" TIMESTAMP(3);

-- CreateIndex Onu search / alarm columns
CREATE INDEX "Onu_name_idx" ON "Onu"("name");
CREATE INDEX "Onu_pppoeUser_idx" ON "Onu"("pppoeUser");
CREATE INDEX "Onu_mgmtIp_idx" ON "Onu"("mgmtIp");
CREATE INDEX "Onu_lastOnuRx_idx" ON "Onu"("lastOnuRx");
CREATE INDEX "Onu_lastSignalLevel_idx" ON "Onu"("lastSignalLevel");

-- Backfill lastOnuRx / lastSignalLevel / lastSignalAt from the latest Signal per ONU
UPDATE "Onu" o
SET
  "lastOnuRx" = s.rx,
  "lastSignalLevel" = s.lvl,
  "lastSignalAt" = s.at
FROM (
  SELECT DISTINCT ON ("onuId")
    "onuId",
    "onuRx" AS rx,
    "signalLevel" AS lvl,
    "recordedAt" AS at
  FROM "Signal"
  WHERE "onuRx" IS NOT NULL
  ORDER BY "onuId", "recordedAt" DESC
) s
WHERE o.id = s."onuId";

-- CreateTable Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Setting
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Alarm
CREATE TABLE "Alarm" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "oltId" INTEGER,
    "onuId" INTEGER,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "href" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackedById" INTEGER,
    "ackedAt" TIMESTAMP(3),
    "silencedUntil" TIMESTAMP(3),
    "detailJson" JSONB,

    CONSTRAINT "Alarm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Alarm_key_key" ON "Alarm"("key");
CREATE INDEX "Alarm_clearedAt_severity_idx" ON "Alarm"("clearedAt", "severity");
CREATE INDEX "Alarm_type_clearedAt_idx" ON "Alarm"("type", "clearedAt");
CREATE INDEX "Alarm_oltId_clearedAt_idx" ON "Alarm"("oltId", "clearedAt");
CREATE INDEX "Alarm_onuId_clearedAt_idx" ON "Alarm"("onuId", "clearedAt");
CREATE INDEX "Alarm_openedAt_idx" ON "Alarm"("openedAt");

ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_onuId_fkey" FOREIGN KEY ("onuId") REFERENCES "Onu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_ackedById_fkey" FOREIGN KEY ("ackedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
