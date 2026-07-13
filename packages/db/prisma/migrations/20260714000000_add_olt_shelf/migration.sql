-- Chassis / shelf snapshot: `show card` inventory + uplink optical DDM, refreshed by the sync.
ALTER TABLE "Olt" ADD COLUMN "shelf" JSONB;
