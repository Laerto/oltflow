"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Modal, Field, inputClass, Button, Alert } from "@/components/ui";
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
    <Modal open={open} onClose={onClose} title={<>🔐 Ndrysho PPPoE <span className="text-xs font-normal text-slate-400">{ponPort.replace("gpon-onu_", "")}</span></>}>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username ISP *">
            <input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@isp.al" className={inputClass} />
          </Field>
          <Field label="Password ISP *">
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
          </Field>
        </div>
        <Field label="VLAN ID">
          <input value={vlanId} onChange={(e) => setVlanId(e.target.value)} className={inputClass} />
        </Field>
        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anulo
          </Button>
          <Button type="submit" variant="success" disabled={loading}>
            {loading ? "Duke dërguar..." : "📤 Dërgo PPPoE"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
