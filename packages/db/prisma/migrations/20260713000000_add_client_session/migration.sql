-- Track subscriber PPPoE/RADIUS session state on the ONU so support can see, and be alarmed, when
-- a client is down behind an online ONU (bridge Mikrotik / route PPPoE dropped).
ALTER TABLE "Onu" ADD COLUMN "radiusUser" TEXT;
ALTER TABLE "Onu" ADD COLUMN "pppoeOnline" BOOLEAN;
