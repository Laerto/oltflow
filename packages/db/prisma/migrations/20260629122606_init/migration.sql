-- CreateTable
CREATE TABLE "Olt" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 23,
    "protocol" TEXT NOT NULL DEFAULT 'telnet',
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "location" TEXT,
    "vendor" TEXT NOT NULL DEFAULT 'zte',
    "model" TEXT,
    "slots" INTEGER[] DEFAULT ARRAY[4, 15, 17, 19, 20]::INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastSync" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Olt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Onu" (
    "id" SERIAL NOT NULL,
    "oltId" INTEGER NOT NULL,
    "ponPort" TEXT NOT NULL,
    "serial" TEXT,
    "name" TEXT,
    "type" TEXT,
    "state" TEXT,
    "distance" TEXT,
    "onlineDuration" TEXT,
    "vlan" TEXT,
    "pppoeUser" TEXT,
    "lineProfile" TEXT,
    "serviceProfile" TEXT,
    "lastSeen" TIMESTAMP(3),

    CONSTRAINT "Onu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" BIGSERIAL NOT NULL,
    "onuId" INTEGER NOT NULL,
    "oltRx" DOUBLE PRECISION,
    "onuRx" DOUBLE PRECISION,
    "oltTx" DOUBLE PRECISION,
    "onuTx" DOUBLE PRECISION,
    "attenUp" DOUBLE PRECISION,
    "attenDown" DOUBLE PRECISION,
    "signalLevel" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordH" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "oltId" INTEGER,
    "ponPort" TEXT,
    "payload" JSONB,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "oltId" INTEGER,
    "ponPort" TEXT,
    "payload" JSONB,
    "output" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Olt_ip_key" ON "Olt"("ip");

-- CreateIndex
CREATE INDEX "Onu_serial_idx" ON "Onu"("serial");

-- CreateIndex
CREATE INDEX "Onu_state_idx" ON "Onu"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Onu_oltId_ponPort_key" ON "Onu"("oltId", "ponPort");

-- CreateIndex
CREATE INDEX "Signal_onuId_recordedAt_idx" ON "Signal"("onuId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Onu" ADD CONSTRAINT "Onu_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_onuId_fkey" FOREIGN KEY ("onuId") REFERENCES "Onu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "Olt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
