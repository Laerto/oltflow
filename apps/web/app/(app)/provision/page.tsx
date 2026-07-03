"use client";

import { useState } from "react";
import { Router, Lock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { useOlts } from "../providers";
import { api, pollJob, ApiError } from "@/lib/api";
import { ONU_TYPES, TCONT_PROFILES, DEFAULT_VLAN_ID, DEFAULT_ONU_TYPE, DEFAULT_TCONT_PROFILE } from "@oltflow/core";

export default function ProvisionPage() {
  const { currentOlt, allOlts } = useOlts();

  if (!currentOlt) {
    return (
      <Card>
        <EmptyState>{allOlts ? "Provizionimi bëhet për një OLT — zgjidh një OLT specifik lart." : "Zgjidh ose shto një OLT."}</EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Provizionim ONU</h1>
      </div>
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Router className="h-4 w-4 text-primary" /> Autorizim ONU
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Serial Number *</Label>
            <Input value={sn} onChange={(e) => setSn(e.target.value)} placeholder="ZTEGC174690E" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">PON Port *</Label>
            <Input value={pon} onChange={(e) => setPon(e.target.value)} placeholder="gpon-onu_1/15/1:1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Emri ONU</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KLIENTI EMRI" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipi ONU</Label>
            <Select value={type} onValueChange={setType}>
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
        <div className="grid grid-cols-2 gap-3 pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">TCONT Profile</Label>
            <Select value={tcont} onValueChange={setTcont}>
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
            <Input value={vlan} onChange={(e) => setVlan(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={loading}>
            {loading ? "Duke autorizuar..." : "Autorizo"}
          </Button>
        </div>
        {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert className="mt-3"><AlertDescription>{success}</AlertDescription></Alert>}
      </CardContent>
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4 text-primary" /> PPPoE via OMCI
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">PON Port *</Label>
            <Input value={pon} onChange={(e) => setPon(e.target.value)} placeholder="gpon-onu_1/15/15:1" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">VLAN ID</Label>
            <Input value={vlan} onChange={(e) => setVlan(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Username ISP *</Label>
            <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@isp.al" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Password ISP *</Label>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={submit} disabled={loading}>
            {loading ? "Duke dërguar..." : "Dërgo PPPoE"}
          </Button>
        </div>
        {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert className="mt-3"><AlertDescription>{success}</AlertDescription></Alert>}
      </CardContent>
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-primary" /> Autorizim + PPPoE Bashkë
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Serial Number *</Label>
            <Input value={sn} onChange={(e) => setSn(e.target.value)} placeholder="ZTEGC174690E" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">PON Port *</Label>
            <Input value={pon} onChange={(e) => setPon(e.target.value)} placeholder="gpon-onu_1/15/1:1" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Emri ONU</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KLIENTI" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipi ONU</Label>
            <Select value={type} onValueChange={setType}>
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
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Username ISP *</Label>
            <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@isp.al" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Password ISP *</Label>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={loading}>
            {loading ? "Duke procesuar..." : "Autorizo + PPPoE"}
          </Button>
        </div>
        {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert className="mt-3"><AlertDescription>{success}</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}
