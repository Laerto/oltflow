"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  Loader2,
  Lock,
  Pencil,
  Power,
  RefreshCw,
  Satellite,
  Wifi,
} from "lucide-react";
import { api, ApiError, pollJob, type OnuRow, type WifiDevice } from "@/lib/api";
import { stateBadgeColor } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PppoeModal } from "@/components/pppoe-modal";
import { WifiModal } from "@/components/wifi-modal";
import { ReplaceOnuModal } from "@/components/replace-onu-modal";
import { isEponPort, onuConnectionKind } from "@oltflow/core";

type OnuDetail = OnuRow & { oltId: number; oltName: string };

interface LiveExtras {
  history?: { authTime: string; offlineTime: string; cause: string }[];
  pppoePass?: string;
}

export default function OnuDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const onuId = Number(params.id);

  const [onu, setOnu] = useState<OnuDetail | null>(null);
  const [live, setLive] = useState<LiveExtras | null>(null);
  const [wifi, setWifi] = useState<WifiDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pppoeOpen, setPppoeOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootMsg, setRebootMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.onu(onuId);
      setOnu(data);
      if (data.serial) {
        const { devices } = await api.wifiInfo(onuId);
        setWifi(devices[0] ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onuId]);

  async function doRefresh() {
    setRefreshing(true);
    try {
      const { jobId } = await api.refreshOnu(onuId);
      const job = await pollJob(jobId);
      if (job.status === "done") {
        const output = job.output as LiveExtras;
        setLive(output);
        await load();
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function doReboot() {
    if (!wifi?.deviceId) return;
    if (!confirm("Të riniset ONU/router-i i klientit? Lidhja do ndërpritet për pak minuta.")) return;
    setRebooting(true);
    setRebootMsg(null);
    try {
      const { jobId } = await api.rebootOnu(onuId, wifi.deviceId);
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setRebootMsg({ kind: "ok", text: (job.output as { message?: string })?.message ?? "Riniset..." });
    } catch (err) {
      setRebootMsg({ kind: "err", text: err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur" });
    } finally {
      setRebooting(false);
    }
  }

  if (loading && !onu) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!onu) return <Card><div className="p-6 text-sm text-slate-500">ONU nuk u gjet.</div></Card>;

  const hasSignal = onu.onuRx !== null;
  const epon = isEponPort(onu.ponPort);
  const connectionKind = onuConnectionKind(onu.type);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500">
            <button onClick={() => router.push("/onus")} className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">
              <ChevronLeft className="h-3 w-3" /> Kthehu
            </button>
            <span>ONU-të &gt; {onu.ponPort}</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{onu.name || onu.ponPort}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {onu.ponPort} · {onu.type || "–"} · SN: {onu.serial || "N/A"}
            {epon && <> · <Badge variant="secondary">EPON</Badge></>}
            {connectionKind === "bridge" && <> · <Badge variant="secondary">Bridge</Badge></>}
            {connectionKind === "route" && <> · <Badge variant="secondary">Route</Badge></>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={doRefresh} disabled={refreshing || epon} title={epon ? "Rifreskimi CLI nuk është ende i implementuar për EPON" : undefined}>
            {refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Rifresko nga OLT
          </Button>
          <Button variant="default" onClick={() => setPppoeOpen(true)} disabled={epon} title={epon ? "PPPoE nuk është i mbështetur për EPON ende" : undefined}>
            <Lock className="h-4 w-4" /> Ndrysho PPPoE
          </Button>
          <Button variant="secondary" onClick={() => setReplaceOpen(true)} disabled={epon} title={epon ? "Zëvendësimi nuk është i mbështetur për EPON ende" : undefined}>
            <RefreshCw className="h-4 w-4" /> Zëvendëso ONU
          </Button>
          <Button variant="destructive" onClick={doReboot} disabled={rebooting || !wifi?.deviceId} title={!wifi?.deviceId ? "Nuk ka TR-069 për këtë ONU" : undefined}>
            {rebooting ? <Spinner /> : <Power className="h-4 w-4" />} Riniso ONU
          </Button>
        </div>
      </div>

      {rebootMsg && <Alert variant={rebootMsg.kind === "err" ? "destructive" : "default"}>{rebootMsg.text}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={<><ClipboardList className="inline h-4 w-4" /> Informacioni ONU <Badge variant={stateBadgeColor(onu.state)}>● {onu.state === "working" ? "Online" : "Offline"}</Badge></>}>
          <div className="px-4">
            <InfoRow label="OLT" value={onu.oltName} />
            <InfoRow label="OLT Interface" value={<span className="font-mono">{onu.ponPort}</span>} />
            <InfoRow label="Emri" value={<strong>{onu.name || "N/A"}</strong>} />
            <InfoRow label="Tipi ONU" value={<Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600">{onu.type || "N/A"}</Badge>} />
            <InfoRow label="Serial Number" value={<span className="font-mono">{onu.serial || "N/A"}</span>} />
            <InfoRow label="ONU Distance" value={onu.distance || "N/A"} />
            <InfoRow label="Online Duration" value={<span className="text-green-600">{onu.onlineDuration || "N/A"}</span>} />
            <InfoRow label="Line Profile" value={<Badge>{onu.lineProfile || "N/A"}</Badge>} />
            <InfoRow label="Service Profile" value={<Badge>{onu.serviceProfile || "N/A"}</Badge>} />
            <InfoRow label="VLAN" value={<Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600">{onu.vlan || "N/A"}</Badge>} />
          </div>
        </SectionCard>

        <div className="flex flex-col gap-3.5">
          <SectionCard title={<><Activity className="inline h-4 w-4" /> Sinjali Optik</>}>
            <div className="p-4">
              {hasSignal ? (
                <>
                  <div className="mb-2.5 grid grid-cols-4 gap-2">
                    <SigBox label="ONU RX dBm" value={onu.onuRx} color={signalColor(onu.onuRx)} />
                    <SigBox label="ONU TX dBm" value={onu.onuTx} color="text-green-600" />
                    <SigBox label="OLT RX dBm" value={onu.oltRx} color="text-green-600" />
                    <SigBox label="OLT TX dBm" value={onu.oltTx} color="text-green-600" />
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <div className="flex-1 rounded-md bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">Att UP</span>
                      <br />
                      <b>{onu.attenUp} dB</b>
                    </div>
                    <div className="flex-1 rounded-md bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">Att DOWN</span>
                      <br />
                      <b>{onu.attenDown} dB</b>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">Sinjali nuk disponohet — kliko &ldquo;Rifresko nga OLT&rdquo;</div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={<><Lock className="inline h-4 w-4" /> WAN / PPPoE</>}
            action={!epon ? <Button variant="default" className="px-2 py-1 text-[11px]" onClick={() => setPppoeOpen(true)}><Pencil className="h-3 w-3" /> Ndrysho</Button> : undefined}
          >
            <div className="px-4">
              <InfoRow label="WAN Mode" value={onu.pppoeUser ? "PPPoE" : "Profile (OMCI)"} />
              <InfoRow label="PPPoE User" value={onu.pppoeUser ? <span className="font-mono text-blue-600">{onu.pppoeUser}</span> : "–"} />
              <InfoRow label="PPPoE Pass" value={live?.pppoePass ? <span className="font-mono">{live.pppoePass}</span> : <span className="text-slate-400">rifresko për ta parë</span>} />
            </div>
          </SectionCard>
        </div>
      </div>

      {live?.history && (
        <SectionCard title={<><CalendarDays className="inline h-4 w-4" /> Historia e Lidhjes <span className="text-[11px] font-normal text-slate-400">{live.history.length} ngjarje</span></>} className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase text-slate-500">
                  <th className="px-3.5 py-2">#</th>
                  <th className="px-3.5 py-2">Auth Time</th>
                  <th className="px-3.5 py-2">Offline Time</th>
                  <th className="px-3.5 py-2">Cause</th>
                </tr>
              </thead>
              <tbody>
                {live.history.map((h, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3.5 py-2">{i + 1}</td>
                    <td className="px-3.5 py-2 font-mono text-xs">{h.authTime}</td>
                    <td className="px-3.5 py-2 font-mono text-xs">{h.offlineTime}</td>
                    <td className="px-3.5 py-2">
                      <Badge
                        variant={h.cause === "LOS" ? "destructive" : h.cause === "-" ? "default" : "outline"}
                        className={h.cause === "LOS" || h.cause === "-" ? undefined : "border-amber-500/30 bg-amber-500/10 text-amber-600"}
                      >
                        {h.cause}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={<><Wifi className="inline h-4 w-4" /> WiFi (TR-069)</>}
        className="mt-4"
        action={wifi ? <Button variant="default" className="px-2 py-1 text-[11px]" onClick={() => setWifiOpen(true)}><Pencil className="h-3 w-3" /> Modifiko WiFi</Button> : undefined}
      >
        <div className="p-4">
          {!onu.serial ? (
            <div className="text-xs text-slate-400">Nuk ka TR-069</div>
          ) : !wifi ? (
            <div className="text-xs text-slate-400">WiFi nuk disponohet</div>
          ) : (
            <div className="flex gap-3">
              <WifiBand label="2.4 GHz" band={wifi.wlan2g} />
              <WifiBand label="5 GHz" band={wifi.wlan5g} />
            </div>
          )}
        </div>
      </SectionCard>

      <PppoeModal open={pppoeOpen} onClose={() => setPppoeOpen(false)} oltId={onu.oltId} ponPort={onu.ponPort} onDone={load} />
      <ReplaceOnuModal
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        onuId={onu.id}
        ponPort={onu.ponPort}
        currentSerial={onu.serial}
        currentType={onu.type}
        onDone={load}
      />
      {wifi && (
        <WifiModal
          open={wifiOpen}
          onClose={() => setWifiOpen(false)}
          onuId={onu.id}
          deviceId={wifi.deviceId}
          initialSsid2g={wifi.wlan2g?.ssid}
          initialSsid5g={wifi.wlan5g?.ssid}
          onDone={load}
        />
      )}
    </div>
  );
}

function Spinner({ size, className }: { size?: "sm" | "default" | "lg"; className?: string }) {
  const sizeClass =
    size === "lg" ? "h-8 w-8" : size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return <Loader2 className={cn(sizeClass, "animate-spin", className)} />;
}

function SectionCard({
  title,
  action,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("py-4", className)}>
      <div className="flex items-start justify-between gap-4 px-4 pb-3">
        <div className="font-semibold leading-none">{title}</div>
        {action ? <div>{action}</div> : null}
      </div>
      <div>{children}</div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center border-b border-slate-100 py-2 text-[13px] last:border-0">
      <span className="w-[150px] flex-shrink-0 text-xs text-slate-500">{label}</span>
      <span className="flex-1 font-medium">{value}</span>
    </div>
  );
}

function SigBox({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex-1 rounded-lg bg-slate-50 p-3 text-center">
      <div className={`font-mono text-base font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function WifiBand({ label, band }: { label: string; band?: { ssid: string; password: string; enabled: boolean } }) {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><Satellite className="inline h-3 w-3" /> {label}</div>
      <InfoRowSm label="SSID" value={<strong>{band?.ssid || "N/A"}</strong>} />
      <InfoRowSm label="Password" value={band?.password ? <span className="font-mono">{band.password}</span> : "N/A"} />
      <InfoRowSm label="Status" value={<Badge variant={band?.enabled ? "default" : "destructive"}>{band?.enabled ? "Aktiv" : "Off"}</Badge>} />
    </div>
  );
}

function InfoRowSm({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center py-1 text-xs">
      <span className="w-20 flex-shrink-0 text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function signalColor(rx: number | null): string {
  if (rx === null) return "text-slate-400";
  if (rx >= -25) return "text-green-600";
  if (rx >= -27) return "text-amber-600";
  return "text-red-600";
}
