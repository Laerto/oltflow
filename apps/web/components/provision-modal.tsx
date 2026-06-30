"use client";

import { useState } from "react";
import { Zap, Router } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ONU_TYPES, TCONT_PROFILES, DEFAULT_VLAN_ID, DEFAULT_ONU_TYPE, DEFAULT_TCONT_PROFILE } from "@oltflow/core";

export function ProvisionModal({
  open,
  onClose,
  oltId,
  serial,
  ponPort,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  oltId: number;
  serial: string;
  ponPort: string;
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [onuType, setOnuType] = useState<string>(DEFAULT_ONU_TYPE);
  const [tcontProfile, setTcontProfile] = useState<string>(DEFAULT_TCONT_PROFILE);
  const [vlanId, setVlanId] = useState(String(DEFAULT_VLAN_ID));
  const [pppoeUser, setPppoeUser] = useState("");
  const [pppoePass, setPppoePass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<"auth" | "both" | null>(null);

  async function run(mode: "auth" | "both", e: { preventDefault: () => void }) {
    e.preventDefault();
    if (mode === "both" && (!pppoeUser || !pppoePass)) {
      setError("Fut PPPoE username dhe password!");
      return;
    }
    setLoading(mode);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        oltId,
        onuSerial: serial,
        ponPort,
        onuName: name || "ONU_AUTO",
        onuType,
        tcontProfile,
        trafficProfile: "SMARTOLT-1G-DOWN",
        vlanId: Number(vlanId) || DEFAULT_VLAN_ID,
      };
      const { jobId } =
        mode === "auth"
          ? await api.provision(payload)
          : await api.authorizePppoe({ ...payload, pppoeUsername: pppoeUser, pppoePassword: pppoePass });
      setSuccess("Duke procesuar...");
      const job = await pollJob(jobId, { timeoutMs: 90000 });
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "U krye me sukses");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 1800);
    } catch (err) {
      setSuccess(null);
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Zap className="h-5 w-5 text-primary" /> Provizionim ONU
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => run("auth", e)} className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
            <Router className="mr-1 inline h-4 w-4" />
            <strong>SN:</strong> {serial} &nbsp;·&nbsp; <strong>Port:</strong> {ponPort.replace("gpon-onu_", "")}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Informacioni ONU</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Emri Klientit *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="KLIENTI EMRI MBIEMRI" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipi ONU</Label>
              <Select value={onuType} onValueChange={setOnuType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ONU_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">TCONT Profile</Label>
              <Select value={tcontProfile} onValueChange={setTcontProfile}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TCONT_PROFILES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">VLAN ID</Label>
              <Input value={vlanId} onChange={(e) => setVlanId(e.target.value)} />
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kredencialet PPPoE</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Username ISP</Label>
              <Input value={pppoeUser} onChange={(e) => setPppoeUser(e.target.value)} placeholder="user@isp.al" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Password ISP</Label>
              <Input type="password" value={pppoePass} onChange={(e) => setPppoePass(e.target.value)} placeholder="••••••••" />
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

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Anulo
            </Button>
            <Button type="submit" variant="outline" disabled={loading !== null}>
              {loading === "auth" ? "Duke autorizuar..." : "Vetëm Autorizo"}
            </Button>
            <Button type="button" onClick={(e) => run("both", e)} disabled={loading !== null} className="bg-gradient-to-r from-blue-600 to-green-600 text-white hover:opacity-90">
              {loading === "both" ? "Duke procesuar..." : "Autorizo + PPPoE"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
