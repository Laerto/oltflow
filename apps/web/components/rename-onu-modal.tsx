"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Fix a registration typo — pushes a new display name to the ONU on the OLT. */
export function RenameOnuModal({
  open,
  onClose,
  onuId,
  currentName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onuId: number;
  currentName: string | null;
  onDone?: () => void;
}) {
  const [name, setName] = useState(currentName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Emri s'mund të jetë bosh.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.renameOnu(onuId, trimmed);
      setSuccess("Duke dërguar te OLT-ja…");
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess("Emri u ndryshua.");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Pencil className="h-5 w-5 text-primary" /> Edito emrin e ONU-së
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Emri i klientit</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="EMRI MBIEMRI" autoFocus maxLength={48} />
            <p className="text-[11px] text-muted-foreground">Ndryshohet direkt në OLT (komanda <code>name</code>).</p>
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
              {loading ? "Duke ruajtur…" : "Ruaj"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
