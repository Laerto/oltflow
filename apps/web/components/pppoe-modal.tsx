"use client";

import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
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
import { DEFAULT_VLAN_ID } from "@oltflow/core";

export function PppoeModal({
  open,
  onClose,
  oltId,
  ponPort,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  oltId: number;
  ponPort: string;
  onDone?: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [vlanId, setVlanId] = useState(String(DEFAULT_VLAN_ID));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.pppoe({
        oltId,
        ponPort,
        pppoeUsername: username,
        pppoePassword: password,
        vlanId: Number(vlanId) || DEFAULT_VLAN_ID,
      });
      setSuccess("Duke dërguar...");
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "PPPoE u konfigurua");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
        setUsername("");
        setPassword("");
      }, 1500);
    } catch (err) {
      setSuccess(null);
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
            <Lock className="h-5 w-5 text-primary" /> Ndrysho PPPoE
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {ponPort.replace("gpon-onu_", "")}
            </span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Username ISP *</Label>
              <Input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@isp.al" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Password ISP *</Label>
              <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">VLAN ID</Label>
            <Input value={vlanId} onChange={(e) => setVlanId(e.target.value)} />
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
              {loading ? "Duke dërguar..." : "Dërgo PPPoE"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
