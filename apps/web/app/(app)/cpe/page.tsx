"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, Radio, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface CpeRow {
  id: number;
  deviceId: string;
  serial: string | null;
  modelName: string | null;
  softwareVersion: string | null;
  wanIp: string | null;
  wanMode: string | null;
  lastInform: string | null;
  lanHostCount: number;
  onuId: number | null;
  onuName: string | null;
  oltName: string | null;
  ponPort: string | null;
}

export default function CpeFleetPage() {
  const [devices, setDevices] = useState<CpeRow[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    neverInformed: number;
    pendingProvision: number;
    firmware: { version: string; count: number }[];
  } | null>(null);
  const [q, setQ] = useState("");
  const [neverInformed, setNeverInformed] = useState(false);
  const [firmware, setFirmware] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [matchTotal, setMatchTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // First page whenever a filter changes; also refresh the fleet stat cards.
  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        api.cpeList({
          q: q || undefined,
          neverInformed: neverInformed || undefined,
          firmware: firmware || undefined,
        }),
        api.cpeStats(),
      ]);
      setDevices(list.devices as unknown as CpeRow[]);
      setMatchTotal(list.total);
      setNextOffset(list.nextOffset);
      setStats(st);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, [q, neverInformed, firmware]);

  async function loadMore() {
    if (nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const list = await api.cpeList({
        q: q || undefined,
        neverInformed: neverInformed || undefined,
        firmware: firmware || undefined,
        offset: nextOffset,
      });
      setDevices((prev) => [...prev, ...(list.devices as unknown as CpeRow[])]);
      setMatchTotal(list.total);
      setNextOffset(list.nextOffset);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Radio className="h-5 w-5 text-primary" /> CPE (GenieACS)
        </h1>
        <p className="text-xs text-muted-foreground">
          Mirror i ACS — pa thirrje live për çdo rresht. Rifreskohet nga worker-i.
        </p>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground">CPE në mirror</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground">Pa inform 48h</div>
            <div className="text-2xl font-bold text-amber-600">{stats.neverInformed}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground">Pret ACS (pas provizion)</div>
            <div className="text-2xl font-bold text-blue-600">{stats.pendingProvision}</div>
          </Card>
        </div>
      )}

      {stats && stats.firmware.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <Cpu className="h-3.5 w-3.5" /> Firmware distribution
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={!firmware ? "default" : "secondary"}
              className="h-7 text-[10px]"
              onClick={() => setFirmware("")}
            >
              Të gjitha
            </Button>
            {stats.firmware.map((f) => (
              <Button
                key={f.version}
                size="sm"
                variant={firmware === f.version ? "default" : "secondary"}
                className="h-7 text-[10px]"
                onClick={() => setFirmware(f.version === "(unknown)" ? "" : f.version)}
              >
                {f.version} · {f.count}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Serial, model, IP, firmware…"
          />
        </div>
        <Button
          size="sm"
          variant={neverInformed ? "default" : "secondary"}
          onClick={() => setNeverInformed((v) => !v)}
        >
          Pa inform 48h
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Serial</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Firmware</th>
                <th className="px-3 py-2">WAN</th>
                <th className="px-3 py-2">Last inform</th>
                <th className="px-3 py-2">ONU / OLT</th>
                <th className="px-3 py-2">LAN</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-mono text-[11px]">{d.serial || "—"}</td>
                  <td className="px-3 py-1.5">{d.modelName || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px]">{d.softwareVersion || "—"}</td>
                  <td className="px-3 py-1.5 font-mono">
                    {d.wanIp || "—"}
                    {d.wanMode && <span className="text-muted-foreground"> · {d.wanMode}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {d.lastInform ? new Date(d.lastInform).toLocaleString("sq-AL") : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {d.onuId ? (
                      <Link href={`/onus/${d.onuId}`} className="text-primary hover:underline">
                        {d.onuName || d.ponPort || d.onuId}
                        {d.oltName && <span className="text-muted-foreground"> · {d.oltName}</span>}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">unlinked</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline">{d.lanHostCount}</Badge>
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Asnjë CPE në mirror — prit acs-mirror ose kontrollo Integrime → GenieACS
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {devices.length > 0 && (
          <div className="flex flex-col items-center gap-2 border-t border-border/50 py-3">
            <span className="text-[11px] text-muted-foreground">
              {devices.length} / {matchTotal} CPE
            </span>
            {nextOffset != null && (
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Duke ngarkuar..." : "Ngarko më shumë"}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
