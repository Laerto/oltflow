"use client";

import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatPonPort } from "@oltflow/core";

export function DeleteOnuDialog({
  open,
  onClose,
  onuId,
  ponPort,
  name,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onuId: number;
  ponPort: string;
  name?: string | null;
  onDone?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.deleteOnu(onuId);
      setSuccess("Duke fshirë...");
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "ONU u fshi");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 1200);
    } catch (err) {
      setSuccess(null);
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Fshi ONU-në
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Je i sigurt që do ta fshish këtë ONU? Ky veprim e heq konfigurimin nga OLT-ja dhe nuk
          mund të zhbëhet.
        </p>
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          <span className="font-medium text-foreground">{name || "ONU"}</span>{" "}
          <span className="font-mono text-xs text-muted-foreground">{formatPonPort(ponPort)}</span>
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
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Anulo
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            <Trash2 className="mr-1 h-4 w-4" /> {loading ? "Duke fshirë..." : "Po, fshije"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
