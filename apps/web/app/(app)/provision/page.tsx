"use client";

import { useState } from "react";
import { useOlts } from "../providers";
import { api, pollJob, ApiError } from "@/lib/api";
import { Card, Field, inputClass, Button, Alert, Empty } from "@/components/ui";
import { ONU_TYPES, TCONT_PROFILES, DEFAULT_VLAN_ID, DEFAULT_ONU_TYPE, DEFAULT_TCONT_PROFILE } from "@oltflow/core";

export default function ProvisionPage() {
  const { currentOlt } = useOlts();

  if (!currentOlt) {
    return (
      <Card>
        <Empty icon="🔌">Zgjidh ose shto një OLT.</Empty>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 text-xl font-bold text-slate-900">⚡ Provizionim ONU</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AuthorizeForm oltId={currentOlt.id} />
        <PppoeForm oltId={currentOlt.id} />
        <div className="lg:col-span-2">
          <BothForm oltId={currentOlt.id} />
        </div>
      </div>
    </div>
  );
}

function AuthorizeForm({ oltId }: { oltId: number }) {
  const [sn, setSn] = useState("");
  const [pon, setPon] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(DEFAULT_ONU_TYPE);
  const [tcont, setTcont] = useState<string>(DEFAULT_TCONT_PROFILE);
  const [vlan, setVlan] = useState(String(DEFAULT_VLAN_ID));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!sn || !pon) {
      setError("Plotëso SN dhe PON Port!");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.provision({
        oltId,
        onuSerial: sn,
        ponPort: pon,
        onuName: name || "ONU_AUTO",
        onuType: type,
        tcontProfile: tcont,
        trafficProfile: "SMARTOLT-1G-DOWN",
        vlanId: Number(vlan) || DEFAULT_VLAN_ID,
      });
      const job = await pollJob(jobId, { timeoutMs: 45000 });
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "U autorizua");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title={<>📡 Autorizim ONU</>}>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serial Number *">
            <input value={sn} onChange={(e) => setSn(e.target.value)} placeholder="ZTEGC174690E" className={inputClass} />
          </Field>
          <Field label="PON Port *">
            <input value={pon} onChange={(e) => setPon(e.target.value)} placeholder="gpon-onu_1/15/1:1" className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Emri ONU">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="KLIENTI EMRI" className={inputClass} />
          </Field>
          <Field label="Tipi ONU">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {ONU_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="TCONT Profile">
            <select value={tcont} onChange={(e) => setTcont(e.target.value)} className={inputClass}>
              {TCONT_PROFILES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="VLAN ID">
            <input value={vlan} onChange={(e) => setVlan(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={loading}>
            {loading ? "Duke autorizuar..." : "✔ Autorizo"}
          </Button>
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}
      </div>
    </Card>
  );
}

function PppoeForm({ oltId }: { oltId: number }) {
  const [pon, setPon] = useState("");
  const [vlan, setVlan] = useState(String(DEFAULT_VLAN_ID));
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!pon || !user || !pass) {
      setError("Plotëso të gjitha fushat!");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.pppoe({ oltId, ponPort: pon, pppoeUsername: user, pppoePassword: pass, vlanId: Number(vlan) || DEFAULT_VLAN_ID });
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "PPPoE u konfigurua");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title={<>🔐 PPPoE via OMCI</>}>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="PON Port *">
            <input value={pon} onChange={(e) => setPon(e.target.value)} placeholder="gpon-onu_1/15/15:1" className={inputClass} />
          </Field>
          <Field label="VLAN ID">
            <input value={vlan} onChange={(e) => setVlan(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username ISP *">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@isp.al" className={inputClass} />
          </Field>
          <Field label="Password ISP *">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" className={inputClass} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button variant="success" onClick={submit} disabled={loading}>
            {loading ? "Duke dërguar..." : "📤 Dërgo PPPoE"}
          </Button>
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}
      </div>
    </Card>
  );
}

function BothForm({ oltId }: { oltId: number }) {
  const [sn, setSn] = useState("");
  const [pon, setPon] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(DEFAULT_ONU_TYPE);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!sn || !pon || !user || !pass) {
      setError("Plotëso të gjitha fushat!");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.authorizePppoe({
        oltId,
        onuSerial: sn,
        ponPort: pon,
        onuName: name || "ONU_AUTO",
        onuType: type,
        tcontProfile: DEFAULT_TCONT_PROFILE,
        trafficProfile: "SMARTOLT-1G-DOWN",
        vlanId: DEFAULT_VLAN_ID,
        pppoeUsername: user,
        pppoePassword: pass,
      });
      const job = await pollJob(jobId, { timeoutMs: 45000 });
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "U krye me sukses");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title={<>⚡ Autorizim + PPPoE Bashkë</>}>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Serial Number *">
            <input value={sn} onChange={(e) => setSn(e.target.value)} placeholder="ZTEGC174690E" className={inputClass} />
          </Field>
          <Field label="PON Port *">
            <input value={pon} onChange={(e) => setPon(e.target.value)} placeholder="gpon-onu_1/15/1:1" className={inputClass} />
          </Field>
          <Field label="Emri ONU">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="KLIENTI" className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipi ONU">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {ONU_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Username ISP *">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@isp.al" className={inputClass} />
          </Field>
          <Field label="Password ISP *">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" className={inputClass} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={loading} className="bg-gradient-to-r from-blue-600 to-green-600 text-white">
            {loading ? "Duke procesuar..." : "⚡ Autorizo + PPPoE"}
          </Button>
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}
      </div>
    </Card>
  );
}
