"use client";

import { useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
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
import { ONU_TYPES } from "@oltflow/core";

export function ReplaceOnuModal({
  open,
  onClose,
  onuId,
  ponPort,
  currentSerial,
  currentType,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onuId: number;
  ponPort: string;
  currentSerial: string | null;
  currentType: string | null;
  onDone?: () => void;
}) {
  const [onuSerial, setOnuSerial] = useState("");
  const [onuType, setOnuType] = useState<string>(currentType ?? "F660");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !confirm(
        `Të zëvendësohet ONU në portin ${ponPort.replace("gpon-onu_", "")}?\nSN i vjetër: ${currentSerial || "–"}\nSN i ri: ${onuSerial}\n\nProfili/VLAN/PPPoE ekzistues mbeten të pandryshuara.`
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.replaceOnu(onuId, { onuSerial, onuType });
      setSuccess("Duke rilidhur ONU-në në OLT...");
      const job = await pollJob(jobId, { timeoutMs: 60000 });
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "ONU u zëvendësua");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
        setOnuSerial("");
      }, 1800);
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
            <RefreshCw className="h-5 w-5 text-primary" /> Zëvendëso ONU (SN i ri)
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            Përdore kur klientit i ndërrohet vetë pajisja (ONU/router). Porti, VLAN-i,
            profili dhe kredencialet PPPoE mbeten të njëjta — ndryshohet vetëm serial
            number-i (dhe tipi, nëse pajisja e re është model tjetër).
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Porti</Label>
            <Input disabled value={ponPort.replace("gpon-onu_", "")} className="bg-muted text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">SN aktual</Label>
            <Input disabled value={currentSerial || "–"} className="bg-muted text-muted-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">SN i ri *</Label>
              <Input required value={onuSerial} onChange={(e) => setOnuSerial(e.target.value)} placeholder="ZTEGCxxxxxxx" />
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
              {loading ? "Duke procesuar..." : "Zëvendëso"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
