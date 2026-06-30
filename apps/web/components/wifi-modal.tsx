"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Modal, Field, inputClass, Button, Alert } from "@/components/ui";

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
    <Modal open={open} onClose={onClose} title={<>📶 Modifiko WiFi</>}>
      <form onSubmit={onSubmit}>
        <Alert kind="load">Dërgohet via TR-069 — efekt pas 1-2 min</Alert>
        <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">📡 WiFi 2.4 GHz</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SSID 2.4G">
            <input value={ssid2g} onChange={(e) => setSsid2g(e.target.value)} placeholder="NeWave-Klienti" className={inputClass} />
          </Field>
          <Field label="Password 2.4G">
            <input type="password" value={pass2g} onChange={(e) => setPass2g(e.target.value)} placeholder="••••••••" className={inputClass} />
          </Field>
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">📡 WiFi 5 GHz</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SSID 5G">
            <input value={ssid5g} onChange={(e) => setSsid5g(e.target.value)} placeholder="NeWave-Klienti-5G" className={inputClass} />
          </Field>
          <Field label="Password 5G">
            <input type="password" value={pass5g} onChange={(e) => setPass5g(e.target.value)} placeholder="••••••••" className={inputClass} />
          </Field>
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anulo
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Duke dërguar..." : "📶 Apliko"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
