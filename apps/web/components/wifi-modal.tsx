"use client";

import { useState, type FormEvent } from "react";
import { Wifi } from "lucide-react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function WifiModal({
  open,
  onClose,
  onuId,
  deviceId,
  initialSsid2g,
  initialSsid5g,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onuId: number;
  deviceId: string;
  initialSsid2g?: string;
  initialSsid5g?: string;
  onDone?: () => void;
}) {
  const [ssid2g, setSsid2g] = useState(initialSsid2g ?? "");
  const [pass2g, setPass2g] = useState("");
  const [ssid5g, setSsid5g] = useState(initialSsid5g ?? "");
  const [pass5g, setPass5g] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ssid2g && !pass2g && !ssid5g && !pass5g) {
      setError("Ndrysho të paktën një fushë!");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.wifiUpdate({
        onuId,
        deviceId,
        ssid2g: ssid2g || undefined,
        pass2g: pass2g || undefined,
        ssid5g: ssid5g || undefined,
        pass5g: pass5g || undefined,
      });
      setSuccess("Duke dërguar via TR-069...");
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "WiFi u dërgua");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
        setPass2g("");
        setPass5g("");
      }, 2000);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Wifi className="h-5 w-5 text-primary" /> Modifiko WiFi
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
            <AlertDescription>Dërgohet via TR-069 — efekt pas 1-2 min</AlertDescription>
          </Alert>

          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">WiFi 2.4 GHz</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">SSID 2.4G</Label>
              <Input value={ssid2g} onChange={(e) => setSsid2g(e.target.value)} placeholder="NeWave-Klienti" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Password 2.4G</Label>
              <Input type="password" value={pass2g} onChange={(e) => setPass2g(e.target.value)} placeholder="••••••••" />
            </div>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">WiFi 5 GHz</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">SSID 5G</Label>
              <Input value={ssid5g} onChange={(e) => setSsid5g(e.target.value)} placeholder="NeWave-Klienti-5G" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Password 5G</Label>
              <Input type="password" value={pass5g} onChange={(e) => setPass5g(e.target.value)} placeholder="••••••••" />
            </div>
          </div>

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

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Anulo
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Duke dërguar..." : "Apliko"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
