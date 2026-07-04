"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { api, ApiError, pollJob } from "@/lib/api";
import { EPON_ONU_TYPES, DEFAULT_EPON_ONU_TYPE, DEFAULT_EPON_VLAN_ID } from "@oltflow/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * One-click EPON authorization. Mirrors a verified working ONU's config: bind the MAC on the
 * parent epon-olt (the worker picks the first free onu-id), then apply sla-profile +
 * switchport VLAN. Unlike GPON there's no PPPoE stanza here — the office runs F460-class ONUs
 * in bridge/hybrid mode (PPPoE lives on the customer router).
 */
export function EponProvisionModal({
  open,
  onClose,
  oltId,
  mac,
  ponPort,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  oltId: number;
  mac: string;
  ponPort: string;
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [onuType, setOnuType] = useState<string>(DEFAULT_EPON_ONU_TYPE);
  const [vlanId, setVlanId] = useState(String(DEFAULT_EPON_VLAN_ID));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Fut emrin e klientit.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.authorizeEpon({
        oltId,
        ponPort,
        onuMac: mac,
        onuType,
        onuName: name.trim(),
        vlanId: Number(vlanId) || DEFAULT_EPON_VLAN_ID,
      });
      setSuccess("Autorizimi u dërgua, duke pritur OLT-në...");
      const job = await pollJob(jobId);
      if (job.status === "done") {
        const out = job.output as { message?: string } | undefined;
        setSuccess(out?.message ?? "ONU-ja EPON u autorizua!");
        onDone?.();
        setTimeout(onClose, 1600);
      } else {
        setError(job.error ?? "Autorizimi dështoi.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={run}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Zap className="h-5 w-5 text-violet-500" /> Autorizo ONU EPON
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">MAC</span>
                <div className="font-mono font-semibold">{mac}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Porta</span>
                <div className="font-mono font-semibold">{ponPort.replace("epon-onu_", "").replace(/:\d+$/, "")}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="epon-name">Emri i klientit *</Label>
              <Input id="epon-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="AFRIM MOLLA K2" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="epon-type">Tipi i ONU-së</Label>
                <Select value={onuType} onValueChange={setOnuType}>
                  <SelectTrigger id="epon-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EPON_ONU_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="epon-vlan">VLAN</Label>
                <Input id="epon-vlan" value={vlanId} onChange={(e) => setVlanId(e.target.value)} inputMode="numeric" />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Bind me MAC në portën mëmë (ID e lirë zgjidhet automatikisht) + sla-profile 1Gbps
              dhe switchport VLAN tag — si një ONU EPON funksionale. Zgjidh tipin që përputhet me
              modelin fizik (kjo ONU u zbulua si ZTE-F661).
            </p>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Duke autorizuar..." : <><Zap className="mr-1 h-4 w-4" /> Autorizo</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
