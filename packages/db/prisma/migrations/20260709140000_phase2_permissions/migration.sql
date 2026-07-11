-- Phase 2: granular permission catalogue + per-user grant/deny overrides.

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "group" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPermission" (
    "userId" INTEGER NOT NULL,
    "perm" TEXT NOT NULL,
    "allow" BOOLEAN NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","perm")
);

CREATE INDEX "UserPermission_perm_idx" ON "UserPermission"("perm");

ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the permission catalogue (idempotent via ON CONFLICT DO NOTHING).
INSERT INTO "Permission" ("id", "label", "description", "group") VALUES
  ('onu.view', 'Shiko ONU', 'Lexim i inventarit dhe detajeve të ONU', 'onu'),
  ('onu.reboot', 'Riniso ONU', 'Restart / reboot i ONU', 'onu'),
  ('onu.provision', 'Provizionim ONU', 'Autorizim / EPON / authorize+PPPoE', 'onu'),
  ('onu.delete', 'Fshi ONU', 'Fshirje e ONU nga OLT', 'onu'),
  ('onu.wifi', 'WiFi (TR-069)', 'Ndryshim WiFi përmes GenieACS', 'onu'),
  ('onu.pppoe', 'PPPoE', 'Konfigurim kredencialesh PPPoE', 'onu'),
  ('olt.manage', 'Menaxho OLT', 'Shto/edito OLT, push-ACS, SNMP discover', 'olt'),
  ('olt.delete', 'Fshi OLT', 'Fshirje e OLT nga paneli', 'olt'),
  ('tickets.work', 'Punë me defekte', 'Merr / zgjidh ticket-e (teknik)', 'tickets'),
  ('tickets.manage', 'Menaxho defektet', 'Hap / cakto ticket-e (zyra)', 'tickets'),
  ('map.edit', 'Edito hartën', 'Splitter / fiber në hartë', 'map'),
  ('users.manage', 'Menaxho përdoruesit', 'CRUD përdoruesish dhe scope OLT', 'admin'),
  ('permissions.manage', 'Menaxho lejet', 'Matrica e lejeve dhe overrides', 'admin'),
  ('integrations.manage', 'Integrime', 'Telegram / ACS / RADIUS config', 'admin'),
  ('backup.run', 'Backup', 'Nis dhe shiko backup-e', 'admin'),
  ('audit.view', 'Audit log', 'Shiko dhe eksporton auditin', 'admin'),
  ('settings.manage', 'Cilësimet', 'Thresholds, intervale, retention', 'admin'),
  ('jobs.view', 'Jobs', 'Shiko radhën e punëve BullMQ', 'admin'),
  ('jobs.manage', 'Menaxho jobs', 'Retry / discard jobs', 'admin'),
  ('sessions.manage', 'Sesionet', 'Listo dhe revoko sesione', 'admin'),
  ('admin.access', 'Akses admin', 'Hyrje në seksionin /admin', 'admin')
ON CONFLICT ("id") DO NOTHING;
