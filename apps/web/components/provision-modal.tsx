"use client";

import { useState } from "react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Modal, Field, inputClass, Button, Alert } from "@/components/ui";
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
    <Modal open={open} onClose={onClose} title={<>⚡ Provizionim ONU</>}>
      <form onSubmit={(e) => run("auth", e)}>
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-700">
          📡 <strong>SN:</strong> {serial} &nbsp;·&nbsp; <strong>Port:</strong> {ponPort.replace("gpon-onu_", "")}
        </div>

        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">📋 Informacioni ONU</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Emri Klientit *">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="KLIENTI EMRI MBIEMRI" className={inputClass} />
          </Field>
          <Field label="Tipi ONU">
            <select value={onuType} onChange={(e) => setOnuType(e.target.value)} className={inputClass}>
              {ONU_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="TCONT Profile">
            <select value={tcontProfile} onChange={(e) => setTcontProfile(e.target.value)} className={inputClass}>
              {TCONT_PROFILES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="VLAN ID">
            <input value={vlanId} onChange={(e) => setVlanId(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="my-3 h-px bg-slate-200" />

        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">🔐 Kredencialet PPPoE</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username ISP">
            <input value={pppoeUser} onChange={(e) => setPppoeUser(e.target.value)} placeholder="user@isp.al" className={inputClass} />
          </Field>
          <Field label="Password ISP">
            <input type="password" value={pppoePass} onChange={(e) => setPppoePass(e.target.value)} placeholder="••••••••" className={inputClass} />
          </Field>
        </div>

        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anulo
          </Button>
          <Button type="submit" variant="secondary" disabled={loading !== null}>
            {loading === "auth" ? "Duke autorizuar..." : "📡 Vetëm Autorizo"}
          </Button>
          <Button type="button" onClick={(e) => run("both", e)} disabled={loading !== null} className="bg-gradient-to-r from-blue-600 to-green-600 text-white hover:opacity-90">
            {loading === "both" ? "Duke procesuar..." : "⚡ Autorizo + PPPoE"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
