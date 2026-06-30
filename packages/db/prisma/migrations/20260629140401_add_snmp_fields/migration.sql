-- AlterTable
ALTER TABLE "Olt" ADD COLUMN     "snmpCommunity" TEXT DEFAULT 'public',
ADD COLUMN     "snmpPort" INTEGER NOT NULL DEFAULT 161,
ADD COLUMN     "snmpVersion" TEXT DEFAULT '2c';
