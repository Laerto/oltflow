-- CreateIndex
CREATE INDEX "Onu_oltId_state_idx" ON "Onu"("oltId", "state");

-- CreateIndex
CREATE INDEX "Signal_signalLevel_recordedAt_idx" ON "Signal"("signalLevel", "recordedAt");
