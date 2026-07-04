"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABELS, classifySignal, type TicketCategory } from "@oltflow/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Opens a fault ticket for an ONU. Pre-fills category/title from the signal when it's weak,
 * so the common case (bad signal) is one field. Office (canAssign) can assign a technician
 * on open, which fires the Telegram "ring". */
export function TicketModal({
  open,
  onClose,
  onuId,
  onuName,
  ponPort,
  onuRx,
  canAssign,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onuId: number;
  onuName: string | null;
  ponPort: string;
  onuRx: number | null;
  canAssign: boolean;
  onCreated?: () => void;
}) {
  const band = classifySignal(onuRx);
  const lowSignal = band === "warning" || band === "critical";

  const [category, setCategory] = useState<TicketCategory>(lowSignal ? "signal_high" : "other");
  const [title, setTitle] = useState(lowSignal && onuRx != null ? `Sinjal i dobët (${onuRx} dBm)` : "");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("none");
  const [technicians, setTechnicians] = useState<{ id: number; name: string | null; email: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && canAssign) api.listTechnicians().then((r) => setTechnicians(r.technicians)).catch(() => {});
  }, [open, canAssign]);

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Shkruaj një titull.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.createTicket({
        onuId,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        assignedToId: assignedToId !== "none" ? Number(assignedToId) : undefined,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Wrench className="h-5 w-5 text-amber-500" /> Hap tiket defekti
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="text-xs text-muted-foreground">
              ONU: <span className="font-semibold text-foreground">{onuName || ponPort}</span>
              {onuRx != null && <> · Sinjal: <span className={lowSignal ? "font-semibold text-rose-600" : ""}>{onuRx} dBm</span></>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategoria</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{TICKET_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canAssign && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Cakto teknik</Label>
                  <Select value={assignedToId} onValueChange={setAssignedToId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— pa caktim —</SelectItem>
                      {technicians.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name || t.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Titulli *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Përshkrim i shkurtër i defektit" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Detaje (opsionale)</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Çfarë raportoi klienti, ç'u vu re..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {canAssign && technicians.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Asnjë teknik ende — shto një përdorues me rol &ldquo;Teknik&rdquo; te Përdoruesit.</p>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
            <Button type="submit" disabled={loading}>{loading ? "Duke hapur…" : <><Wrench className="mr-1 h-4 w-4" /> Hap tiket</>}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
