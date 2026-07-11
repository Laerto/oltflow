-- Phase 3: Integrations hub + notification rule engine + maintenance windows.

CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configEnc" TEXT,
    "status" TEXT,
    "statusDetail" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" INTEGER,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severityMin" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scopeAll" BOOLEAN NOT NULL DEFAULT true,
    "oltIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "channels" JSONB NOT NULL,
    "behavior" TEXT NOT NULL DEFAULT 'once_until_clear',
    "quietStart" TEXT,
    "quietEnd" TEXT,
    "escalateAfterMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationRule_eventType_enabled_idx" ON "NotificationRule"("eventType", "enabled");

CREATE TABLE "NotificationLog" (
    "id" BIGSERIAL NOT NULL,
    "ruleId" INTEGER,
    "eventType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "target" TEXT,
    "detail" JSONB,
    "alarmKey" TEXT,
    "oltId" INTEGER,
    "onuId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");
CREATE INDEX "NotificationLog_eventType_createdAt_idx" ON "NotificationLog"("eventType", "createdAt");
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");
CREATE INDEX "NotificationLog_alarmKey_createdAt_idx" ON "NotificationLog"("alarmKey", "createdAt");

CREATE TABLE "MaintenanceWindow" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "oltId" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceWindow_startsAt_endsAt_idx" ON "MaintenanceWindow"("startsAt", "endsAt");
CREATE INDEX "MaintenanceWindow_oltId_startsAt_idx" ON "MaintenanceWindow"("oltId", "startsAt");

ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default Telegram rules matching v2 alarm behaviour (idempotent by name).
INSERT INTO "NotificationRule" ("name", "eventType", "severityMin", "enabled", "scopeAll", "oltIds", "channels", "behavior")
SELECT v.name, v."eventType", v."severityMin", true, true, ARRAY[]::INTEGER[], '[{"type":"telegram"}]'::jsonb, v.behavior
FROM (VALUES
  ('ONU Offline → Telegram', 'onu.offline', 'critical', 'once_until_clear'),
  ('Sinjal i dobët → Telegram', 'onu.signal.warning', 'warning', 'once_until_clear'),
  ('Sinjal në rrezik (daily) → Telegram', 'onu.signal.danger', 'critical', 'daily'),
  ('Skadencë ≤7 ditë → Telegram', 'onu.expiry', NULL, 'once_until_clear'),
  ('OLT pa lidhje → Telegram', 'olt.unreachable', 'critical', 'once_until_clear'),
  ('PON outage → Telegram', 'pon.outage', 'warning', 'once_until_clear')
) AS v(name, "eventType", "severityMin", behavior)
WHERE NOT EXISTS (SELECT 1 FROM "NotificationRule" r WHERE r.name = v.name);

-- Placeholder Integration rows (disabled until configured).
INSERT INTO "Integration" ("id", "enabled", "status") VALUES
  ('telegram', false, 'unconfigured'),
  ('whatsapp', false, 'unconfigured'),
  ('smtp', false, 'unconfigured'),
  ('webhook', false, 'unconfigured'),
  ('genieacs', false, 'unconfigured'),
  ('radius', false, 'unconfigured'),
  ('winbox', true, 'ok')
ON CONFLICT ("id") DO NOTHING;
