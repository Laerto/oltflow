-- Phase 5: backup targets + run history.

CREATE TABLE "BackupTarget" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configEnc" TEXT NOT NULL,
    "schedule" TEXT,
    "retention" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupRun" (
    "id" SERIAL NOT NULL,
    "targetId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "path" TEXT,
    "sizeBytes" BIGINT,
    "sha256" TEXT,
    "manifest" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "log" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupRun_status_startedAt_idx" ON "BackupRun"("status", "startedAt");
CREATE INDEX "BackupRun_targetId_startedAt_idx" ON "BackupRun"("targetId", "startedAt");

ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "BackupTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a default local target (config is unencrypted placeholder — first save via admin encrypts).
-- We encrypt empty local path at runtime; seed with a pre-encrypted blob is hard without the key.
-- Seed notification rules for backup events.
INSERT INTO "NotificationRule" ("name", "eventType", "severityMin", "enabled", "scopeAll", "oltIds", "channels", "behavior")
SELECT v.name, v."eventType", v."severityMin", true, true, ARRAY[]::INTEGER[], '[{"type":"telegram"}]'::jsonb, 'every'
FROM (VALUES
  ('Backup completed → Telegram', 'backup.completed', 'info', 'every'),
  ('Backup failed → Telegram', 'backup.failed', 'critical', 'every')
) AS v(name, "eventType", "severityMin", behavior)
WHERE NOT EXISTS (SELECT 1 FROM "NotificationRule" r WHERE r.name = v.name);
