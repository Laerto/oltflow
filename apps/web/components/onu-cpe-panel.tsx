"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, EthernetPort, Network, Pencil, Power, RefreshCw, Router, Wifi } from "lucide-react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WifiModal } from "@/components/wifi-modal";

interface LanHost {
  hostname: string | null;
  mac: string | null;
  ip: string | null;
  active: boolean;
}

interface LanPort {
  port: number;
  up: boolean;
  enabled: boolean;
  name: string | null;
}

export interface AcsMirror {
  deviceId: string;
  serial: string | null;
  productClass: string | null;
  modelName: string | null;
  hardwareVersion: string | null;
  softwareVersion: string | null;
  wanIp: string | null;
  wanMode: string | null;
  uptimeSec: number | null;
  ssid2g: string | null;
  ssid5g: string | null;
  wifiEnabled2g: boolean | null;
  wifiEnabled5g: boolean | null;
  lanHosts: LanHost[] | null;
  lanPorts: LanPort[] | null;
  lastInform: string | null;
  mirroredAt: string;
  expectedBy: string | null;
  pending?: boolean;
  registered: boolean;
}

function fmtUptime(sec: number | null): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function OnuCpePanel({
  onuId,
  canOperate,
}: {
  onuId: number;
  canOperate: boolean;
}) {
  const [acs, setAcs] = useState<AcsMirror | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [wifiOpen, setWifiOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.onuAcs(onuId);
      setAcs(r.acs);
    } catch {
      setAcs(null);
    }
  }, [onuId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const { jobId } = await api.onuAcsRefresh(onuId);
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      const out = job.output as { message?: string };
      setMsg(out?.message ?? "OK");
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError || e instanceof Error ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBand(band: "2g" | "5g", enable: boolean) {
    if (!acs?.deviceId || busy) return;
    const label = band === "2g" ? "2.4G" : "5G";
    if (!enable && !confirm(`Të fiket WiFi ${label} për klientin? Pajisjet do shkëputen nga kjo rrjet.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const { jobId } = await api.wifiUpdate({
        onuId,
        deviceId: acs.deviceId,
        [band === "2g" ? "enable2g" : "enable5g"]: enable,
      });
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setMsg(`WiFi ${label} u ${enable ? "ndez" : "fik"} via TR-069 — efekt pas 1-2 min`);
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError || e instanceof Error ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  async function factoryReset() {
    if (!acs?.deviceId || acs.pending) return;
    if (!confirm("Factory reset i CPE via TR-069? Klienti humbet WiFi/PPPoE config derisa të riprovizionojë.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const { jobId } = await api.onuAcsFactoryReset(onuId, acs.deviceId);
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setMsg((job.output as { message?: string })?.message ?? "Factory reset u dërgua");
    } catch (e) {
      setMsg(e instanceof ApiError || e instanceof Error ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  if (acs === undefined) {
    return <Card className="p-4 text-xs text-muted-foreground">Duke ngarkuar CPE mirror…</Card>;
  }

  if (!acs) {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Nuk ka të dhëna ACS për këtë ONU. Worker-i i bën mirror çdo ~15 min, ose rifresko tani.
          </p>
          <Button size="sm" variant="secondary" onClick={refresh} disabled={busy}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh from ACS
          </Button>
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      </Card>
    );
  }

  const hosts = (Array.isArray(acs.lanHosts) ? acs.lanHosts : []) as LanHost[];
  const ports = (Array.isArray(acs.lanPorts) ? acs.lanPorts : []) as LanPort[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Mirror: {new Date(acs.mirroredAt).toLocaleString("sq-AL")}
          {acs.lastInform && <> · last inform {new Date(acs.lastInform).toLocaleString("sq-AL")}</>}
          {acs.pending && (
            <Badge variant="outline" className="ml-2 border-amber-500/40 text-amber-600">
              pret ACS
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={refresh} disabled={busy}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh from ACS
          </Button>
          {canOperate && !acs.pending && (
            <Button size="sm" variant="destructive" onClick={factoryReset} disabled={busy}>
              <Power className="mr-1 h-3.5 w-3.5" /> Factory reset
            </Button>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Model" value={acs.modelName || acs.productClass || "—"} icon={Router} />
        <Mini label="Firmware" value={acs.softwareVersion || "—"} icon={Cpu} />
        <Mini label="WAN" value={acs.wanIp ? `${acs.wanIp}${acs.wanMode ? ` · ${acs.wanMode}` : ""}` : "—"} icon={Network} />
        <Mini label="Uptime" value={fmtUptime(acs.uptimeSec)} icon={Cpu} />
      </div>

      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Wifi className="h-3.5 w-3.5" /> WiFi
          </div>
          {canOperate && acs.deviceId && !acs.pending && (
            <Button size="sm" variant="default" onClick={() => setWifiOpen(true)} disabled={busy}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Modifiko SSID / Pass
            </Button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <WifiBand band="2g" ssid={acs.ssid2g} enabled={acs.wifiEnabled2g} canOperate={canOperate} busy={busy} onToggle={toggleBand} />
          <WifiBand band="5g" ssid={acs.ssid5g} enabled={acs.wifiEnabled5g} canOperate={canOperate} busy={busy} onToggle={toggleBand} />
        </div>
      </Card>

      <WifiModal
        open={wifiOpen}
        onClose={() => setWifiOpen(false)}
        onuId={onuId}
        deviceId={acs.deviceId}
        initialSsid2g={acs.ssid2g ?? undefined}
        initialSsid5g={acs.ssid5g ?? undefined}
        onDone={load}
      />

      <Card className="overflow-hidden">
        {ports.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-2">
            <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Network className="h-3.5 w-3.5" /> Portat LAN
            </span>
            {ports.map((p) => (
              <span
                key={p.port}
                title={p.up ? "Kabllo e lidhur" : p.enabled ? "Pa kabllo" : "E çaktivizuar"}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
                  p.up
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <EthernetPort className="h-3.5 w-3.5" />
                LAN{p.port}
                <span className={`h-1.5 w-1.5 rounded-full ${p.up ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm font-semibold">
          <Network className="h-4 w-4" /> Pajisjet e lidhura ({hosts.length})
        </div>
        {hosts.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">Asnjë pajisje në mirror — rifresko nga ACS.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Emri</th>
                <th className="px-4 py-2.5 font-semibold">MAC</th>
                <th className="px-4 py-2.5 font-semibold">IP</th>
                <th className="px-4 py-2.5 font-semibold">Statusi</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h, i) => (
                <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{h.hostname || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{h.mac || "—"}</td>
                  <td className="px-4 py-2.5 font-mono">{h.ip || "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={h.active ? "border-emerald-500/40 text-emerald-600" : "text-muted-foreground"}>
                      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${h.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                      {h.active ? "aktiv" : "joaktiv"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function WifiBand({
  band,
  ssid,
  enabled,
  canOperate,
  busy,
  onToggle,
}: {
  band: "2g" | "5g";
  ssid: string | null;
  enabled: boolean | null;
  canOperate: boolean;
  busy: boolean;
  onToggle: (band: "2g" | "5g", enable: boolean) => void;
}) {
  const label = band === "2g" ? "2.4 GHz" : "5 GHz";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="truncate font-medium" title={ssid || undefined}>{ssid || "—"}</div>
        {enabled != null && (
          <Badge variant="outline" className={`mt-0.5 ${enabled ? "border-emerald-500/30 text-emerald-600" : "border-red-500/30 text-red-600"}`}>
            {enabled ? "ndezur" : "fikur"}
          </Badge>
        )}
      </div>
      {canOperate && enabled != null && (
        <Button
          size="sm"
          variant={enabled ? "outline" : "default"}
          className="shrink-0"
          disabled={busy}
          onClick={() => onToggle(band, !enabled)}
          title={enabled ? `Fik WiFi ${label}` : `Ndiz WiFi ${label}`}
        >
          <Power className="mr-1 h-3.5 w-3.5" /> {enabled ? "Fik" : "Ndiz"}
        </Button>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </div>
    </Card>
  );
}
