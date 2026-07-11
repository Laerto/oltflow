"use client";

import { useCallback, useEffect, useState } from "react";
import { Smartphone, Unlink, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

const STATUS_META: Record<string, { text: string; tone: string; dot: string }> = {
  disconnected: { text: "I shkëputur", tone: "text-muted-foreground", dot: "bg-slate-400" },
  connecting: { text: "Duke u lidhur…", tone: "text-amber-600", dot: "bg-amber-500" },
  qr: { text: "Skano kodin QR", tone: "text-blue-600", dot: "bg-blue-500" },
  connected: { text: "I lidhur", tone: "text-emerald-600", dot: "bg-emerald-500" },
};

/**
 * WhatsApp (Baileys) device linking. The worker owns the socket; this panel polls
 * status/QR from Redis via the API and sends link/unlink control commands.
 */
export function WhatsappLinkPanel() {
  const [status, setStatus] = useState("disconnected");
  const [number, setNumber] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const poll = useCallback(async () => {
    try {
      const s = await api.waStatus();
      setStatus(s.status);
      setNumber(s.number);
      setQr(s.qr);
      if (s.error) setErr(s.error);
    } catch {
      /* transient — keep last state */
    }
  }, []);

  useEffect(() => {
    void poll();
    // Poll fast while a QR is on screen (it rotates), slower otherwise.
    const id = setInterval(poll, status === "qr" ? 2500 : 4000);
    return () => clearInterval(id);
  }, [poll, status]);

  async function control(action: "link" | "unlink") {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.waControl(action);
      if (!r.workerListening) setErr("Worker-i nuk po dëgjon — sigurohu që worker-i është aktiv.");
      setTimeout(() => void poll(), 800);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  const meta = STATUS_META[status] ?? STATUS_META.disconnected;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="h-4 w-4 text-emerald-600" /> Lidh pajisjen (QR)
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {meta.text}
          {number && status === "connected" ? ` · +${number}` : ""}
        </span>
      </div>

      {status === "connected" ? (
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Numri +{number} është i lidhur dhe gati për dërgim.
          </div>
          <Button size="sm" variant="outline" onClick={() => control("unlink")} disabled={busy}>
            <Unlink className="mr-1 h-3.5 w-3.5" /> Shkëput pajisjen
          </Button>
        </div>
      ) : status === "qr" && qr ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="WhatsApp QR" className="h-64 w-64 rounded-lg bg-white p-2" />
          <p className="max-w-xs text-center text-[11px] text-muted-foreground">
            WhatsApp → Cilësimet → <strong>Pajisje të lidhura</strong> → Lidh një pajisje → skano këtë kod.
            Kodi rifreskohet automatikisht.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-muted-foreground">
            Lidh një numër WhatsApp duke skanuar një kod QR. Përdor një numër të dedikuar — ky është një
            protokoll jozyrtar dhe numri mund të bllokohet nga WhatsApp.
          </p>
          <Button size="sm" onClick={() => control("link")} disabled={busy}>
            {busy || status === "connecting" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Smartphone className="mr-1 h-3.5 w-3.5" />
            )}
            Lidh pajisjen
          </Button>
        </div>
      )}

      {err && <p className="mt-2 text-[11px] text-rose-600">{err}</p>}
    </div>
  );
}
