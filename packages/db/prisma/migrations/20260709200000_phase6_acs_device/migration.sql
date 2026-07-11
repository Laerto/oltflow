-- Phase 6: GenieACS CPE mirror (AcsDevice).

CREATE TABLE "AcsDevice" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "serial" TEXT,
    "onuId" INTEGER,
    "productClass" TEXT,
    "modelName" TEXT,
    "hardwareVersion" TEXT,
    "softwareVersion" TEXT,
    "wanIp" TEXT,
    "wanMode" TEXT,
    "uptimeSec" INTEGER,
    "ssid2g" TEXT,
    "ssid5g" TEXT,
    "wifiEnabled2g" BOOLEAN,
    "wifiEnabled5g" BOOLEAN,
    "lanHosts" JSONB,
    "lastInform" TIMESTAMP(3),
    "lastBootstrap" TIMESTAMP(3),
    "registered" BOOLEAN NOT NULL DEFAULT true,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedBy" TIMESTAMP(3),

    CONSTRAINT "AcsDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcsDevice_deviceId_key" ON "AcsDevice"("deviceId");
CREATE UNIQUE INDEX "AcsDevice_onuId_key" ON "AcsDevice"("onuId");
CREATE INDEX "AcsDevice_serial_idx" ON "AcsDevice"("serial");
CREATE INDEX "AcsDevice_softwareVersion_idx" ON "AcsDevice"("softwareVersion");
CREATE INDEX "AcsDevice_lastInform_idx" ON "AcsDevice"("lastInform");
CREATE INDEX "AcsDevice_mirroredAt_idx" ON "AcsDevice"("mirroredAt");
CREATE INDEX "AcsDevice_wanIp_idx" ON "AcsDevice"("wanIp");

ALTER TABLE "AcsDevice" ADD CONSTRAINT "AcsDevice_onuId_fkey" FOREIGN KEY ("onuId") REFERENCES "Onu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Setting for mirror interval (default 15 min)
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('acs.mirror_interval_ms', '900000'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('acs.provision_check_min', '15'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Alert when provisioned ONU never informs ACS
INSERT INTO "NotificationRule" ("name", "eventType", "severityMin", "enabled", "scopeAll", "oltIds", "channels", "behavior")
SELECT 'ACS registration missing → Telegram', 'acs.not_registered', 'warning', true, true, ARRAY[]::INTEGER[], '[{"type":"telegram"}]'::jsonb, 'once_until_clear'
WHERE NOT EXISTS (SELECT 1 FROM "NotificationRule" r WHERE r.name = 'ACS registration missing → Telegram');
