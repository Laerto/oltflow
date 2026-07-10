"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  Globe,
  Loader2,
  Lock,
  Pencil,
  Power,
  RefreshCw,
  Satellite,
  Trash2,
  Wifi,
  Wrench,
  MapPin,
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
import { DeleteOnuDialog } from "@/components/delete-onu-dialog";
import { PingButton } from "@/components/ping-button";
import { OnuLivePanel } from "@/components/onu-live-panel";
import { TicketModal } from "@/components/ticket-modal";
import { useMe } from "@/app/(app)/providers";
import { can } from "@/lib/permissions";
import { isEponPort, onuConnectionKind, classifySignal } from "@oltflow/core";

type OnuDetail = OnuRow & { oltId: number; oltName: string };

interface LiveExtras {
  history?: { authTime: string; offlineTime: string; cause: string }[];
  pppoePass?: string;
}

export default function OnuDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const onuId = Number(params.id);
  const me = useMe();
  const operate = can.operate(me?.role);
  const admin = can.admin(me?.role);

  const [onu, setOnu] = useState<OnuDetail | null>(null);
  const [live, setLive] = useState<LiveExtras | null>(null);
  const [wifi, setWifi] = useState<WifiDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pppoeOpen, setPppoeOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [wanBusy, setWanBusy] = useState(false);
  const [rebootMsg, setRebootMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.onu(onuId);
      setOnu(data);
      if (data.serial) {
        const { devices } = await api.wifiInfo(onuId);
        setWifi(devices[0] ?? null);
      }
      return data;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Auto-pull fresh signal + outage history (Historia e Lidhjes) from the OLT on open,
    // so the office sees the connection/LOS log without an extra click. Skip for EPON — the
    // CLI refresh path is GPON-only, so firing it would just log a failed job on every open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then((data) => {
      if (data && !isEponPort(data.ponPort)) void doRefresh();
    });
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

  function setMyLocation() {
    if (!navigator.geolocation) {
      setRebootMsg({ kind: "err", text: "Shfletuesi s'e mbështet GPS-in." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await api.setOnuLocation(onuId, +p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6));
          setRebootMsg({ kind: "ok", text: `Vendndodhja u ruajt (${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}).` });
        } catch {
          setRebootMsg({ kind: "err", text: "Ruajtja e vendndodhjes dështoi." });
        }
      },
      () => setRebootMsg({ kind: "err", text: "S'u mor GPS-i — lejo vendndodhjen në shfletues." })
    );
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

  async function doWanAccess() {
    setWanBusy(true);
    setRebootMsg(null);
    try {
      const { jobId } = await api.enableWanAccess(onuId);
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setRebootMsg({ kind: "ok", text: (job.output as { message?: string })?.message ?? "Aksesi WAN u aktivizua" });
    } catch (err) {
      setRebootMsg({ kind: "err", text: err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur" });
    } finally {
      setWanBusy(false);
    }
  }

  if (loading && !onu) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!onu) return <Card><div className="p-6 text-sm text-muted-foreground">ONU nuk u gjet.</div></Card>;

  const hasSignal = onu.onuRx !== null;
  const epon = isEponPort(onu.ponPort);
  const connectionKind = onuConnectionKind(onu.type);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => router.push("/onus")} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-muted">
              <ChevronLeft className="h-3 w-3" /> Kthehu
            </button>
            <span>ONU-të &gt; {onu.ponPort}</span>
          </div>
          <div className="text-xl font-bold text-foreground">{onu.name || onu.ponPort}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {onu.ponPort} · {onu.type || "–"} · SN: {onu.serial || "N/A"}
            {epon && <> · <Badge variant="secondary">EPON</Badge></>}
            {connectionKind === "bridge" && <> · <Badge variant="secondary">Bridge</Badge></>}
            {connectionKind === "route" && <> · <Badge variant="secondary">Route</Badge></>}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 [&>button]:h-auto [&>button]:min-h-9 [&>button]:justify-center [&>button]:text-xs sm:flex sm:w-auto sm:flex-wrap sm:[&>button]:text-sm">
          {operate && (
            <Button variant="secondary" onClick={() => setTicketOpen(true)} className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10">
              <Wrench className="h-4 w-4" /> Hap tiket
            </Button>
          )}
          {operate && (
            <Button variant="secondary" onClick={setMyLocation} title="Ruaj vendndodhjen GPS të kësaj ONU-je (për hartën)">
              <MapPin className="h-4 w-4" /> <span className="hidden sm:inline">Vendndodhja</span>
            </Button>
          )}
          <Button variant="secondary" onClick={doRefresh} disabled={refreshing || epon} title={epon ? "Rifreskimi CLI nuk është ende i implementuar për EPON" : undefined}>
            {refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Rifresko nga OLT
          </Button>
          {operate && (
            <Button variant="default" onClick={() => setPppoeOpen(true)} disabled={epon} title={epon ? "PPPoE nuk është i mbështetur për EPON ende" : undefined}>
              <Lock className="h-4 w-4" /> Ndrysho PPPoE
            </Button>
          )}
          {admin && (
            <Button variant="secondary" onClick={() => setReplaceOpen(true)} disabled={epon} title={epon ? "Zëvendësimi nuk është i mbështetur për EPON ende" : undefined}>
              <RefreshCw className="h-4 w-4" /> Zëvendëso ONU
            </Button>
          )}
          {operate && (
            <Button variant="secondary" onClick={doWanAccess} disabled={wanBusy || epon} title={epon ? "Nuk mbështetet për EPON" : "Hap aksesin WAN te paneli i ONU-së"}>
              {wanBusy ? <Spinner /> : <Globe className="h-4 w-4" />} Akses WAN
            </Button>
          )}
          {operate && (
            <Button variant="destructive" onClick={doReboot} disabled={rebooting || !wifi?.deviceId} title={!wifi?.deviceId ? "Nuk ka TR-069 për këtë ONU" : undefined}>
              {rebooting ? <Spinner /> : <Power className="h-4 w-4" />} Reboot ONU
            </Button>
          )}
          {admin && !epon && (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)} title="Fshi këtë ONU nga OLT-i">
              <Trash2 className="h-4 w-4" /> Fshi ONU
            </Button>
          )}
        </div>
      </div>

      {rebootMsg && <Alert variant={rebootMsg.kind === "err" ? "destructive" : "default"}>{rebootMsg.text}</Alert>}

      {operate && (classifySignal(onu.onuRx) === "warning" || classifySignal(onu.onuRx) === "critical") && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-500">
            <Wrench className="h-4 w-4 shrink-0" />
            <span>Sinjal i dobët (<b>{onu.onuRx} dBm</b>) — mund të hapësh një tiket riparimi për teknikun.</span>
          </div>
          <Button size="sm" className="shrink-0 bg-amber-500 text-white hover:bg-amber-600" onClick={() => setTicketOpen(true)}>
            <Wrench className="mr-1 h-4 w-4" /> Hap tiket
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={<><ClipboardList className="inline h-4 w-4" /> Informacioni ONU <Badge variant={stateBadgeColor(onu.state)}>● {onu.state === "working" ? "Online" : "Offline"}</Badge></>}>
          <div className="px-4">
            <InfoRow label="OLT" value={onu.oltName} />
            <InfoRow label="OLT Interface" value={<span className="font-mono">{onu.ponPort}</span>} />
            <InfoRow label="Emri" value={<strong>{onu.name || "N/A"}</strong>} />
            <InfoRow label="Tipi ONU" value={<Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600">{onu.type || "N/A"}</Badge>} />
            <InfoRow label="Serial Number" value={<span className="font-mono">{onu.serial || "N/A"}</span>} />
            <InfoRow label="ONU Distance" value={onu.distance || "N/A"} />
            <InfoRow label="Online Duration" value={<span className="text-emerald-600">{onu.onlineDuration || "N/A"}</span>} />
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
                  <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <SigBox label="ONU RX dBm" value={onu.onuRx} color={signalColor(onu.onuRx)} />
                    <SigBox label="ONU TX dBm" value={onu.onuTx} color="text-emerald-600" />
                    <SigBox label="OLT RX dBm" value={onu.oltRx} color="text-emerald-600" />
                    <SigBox label="OLT TX dBm" value={onu.oltTx} color="text-emerald-600" />
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <div className="flex-1 rounded-md bg-muted px-3 py-2">
                      <span className="text-muted-foreground">Att UP</span>
                      <br />
                      <b>{onu.attenUp} dB</b>
                    </div>
                    <div className="flex-1 rounded-md bg-muted px-3 py-2">
                      <span className="text-muted-foreground">Att DOWN</span>
                      <br />
                      <b>{onu.attenDown} dB</b>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Sinjali nuk disponohet — kliko &ldquo;Rifresko nga OLT&rdquo;</div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={<><Lock className="inline h-4 w-4" /> WAN / PPPoE</>}
            action={operate && !epon ? <Button variant="default" className="px-2 py-1 text-[11px]" onClick={() => setPppoeOpen(true)}><Pencil className="h-3 w-3" /> Ndrysho</Button> : undefined}
          >
            <div className="px-4">
              <InfoRow
                label="WAN IP"
                value={
                  onu.wanIp ? (
                    <span className="flex items-center gap-2">
                      <a href={`http://${onu.wanIp}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">
                        {onu.wanIp} ↗
                      </a>
                      <PingButton ip={onu.wanIp} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )
                }
              />
              <InfoRow label="WAN Mode" value={onu.pppoeUser ? "PPPoE" : "Profile (OMCI)"} />
              <InfoRow label="PPPoE User" value={onu.pppoeUser ? <span className="font-mono text-blue-600">{onu.pppoeUser}</span> : "–"} />
              <InfoRow label="PPPoE Pass" value={live?.pppoePass ? <span className="font-mono">{live.pppoePass}</span> : <span className="text-muted-foreground">rifresko për ta parë</span>} />
            </div>
          </SectionCard>
        </div>
      </div>

      {!epon && (
        <OnuLivePanel
          onuId={onu.id}
          onuType={onu.type}
          state={onu.state}
          onuRx={onu.onuRx}
          lastCause={live?.history?.[live.history.length - 1]?.cause}
        />
      )}

      {live?.history && (
        <SectionCard title={<><CalendarDays className="inline h-4 w-4" /> Historia e Lidhjes <span className="text-[11px] font-normal text-muted-foreground">{live.history.length} ngjarje</span></>} className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-[10px] font-bold uppercase text-muted-foreground">
                  <th className="px-3.5 py-2">#</th>
                  <th className="px-3.5 py-2">Auth Time</th>
                  <th className="px-3.5 py-2">Offline Time</th>
                  <th className="px-3.5 py-2">Cause</th>
                </tr>
              </thead>
              <tbody>
                {live.history.map((h, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
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
            <div className="text-xs text-muted-foreground">Nuk ka TR-069</div>
          ) : !wifi ? (
            <div className="text-xs text-muted-foreground">WiFi nuk disponohet</div>
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
      {deleteOpen && (
        <DeleteOnuDialog
          open
          onuId={onu.id}
          ponPort={onu.ponPort}
          name={onu.name}
          onClose={() => setDeleteOpen(false)}
          onDone={() => router.push("/onus")}
        />
      )}
      <TicketModal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        onuId={onu.id}
        onuName={onu.name}
        ponPort={onu.ponPort}
        onuRx={onu.onuRx}
        canAssign={operate}
        onCreated={() => setRebootMsg({ kind: "ok", text: "Tiketi u hap." })}
      />
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
    <div className="flex items-center border-b border-border/50 py-2 text-[13px] last:border-0">
      <span className="w-28 flex-shrink-0 text-xs text-muted-foreground sm:w-[150px]">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
    </div>
  );
}

function SigBox({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex-1 rounded-lg bg-muted p-3 text-center">
      <div className={`font-mono text-base font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function WifiBand({ label, band }: { label: string; band?: { ssid: string; password: string; enabled: boolean } }) {
  return (
    <div className="flex-1 rounded-lg border border-border p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Satellite className="inline h-3 w-3" /> {label}</div>
      <InfoRowSm label="SSID" value={<strong>{band?.ssid || "N/A"}</strong>} />
      <InfoRowSm label="Password" value={band?.password ? <span className="font-mono">{band.password}</span> : "N/A"} />
      <InfoRowSm label="Status" value={<Badge variant={band?.enabled ? "default" : "destructive"}>{band?.enabled ? "Aktiv" : "Off"}</Badge>} />
    </div>
  );
}

function InfoRowSm({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center py-1 text-xs">
      <span className="w-20 flex-shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function signalColor(rx: number | null): string {
  const b = classifySignal(rx);
  return b === "good" ? "text-emerald-600" : b === "warning" ? "text-amber-600" : b === "critical" ? "text-rose-600" : "text-muted-foreground";
}
