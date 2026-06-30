"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useOlts } from "../providers";
import { api, type OnuRow } from "@/lib/api";
import { Card, Empty, Spinner, Badge, SignalPill, stateBadgeColor, stateLabel, Button } from "@/components/ui";
import { PppoeModal } from "@/components/pppoe-modal";
import { formatPonPort, isEponPort, onuConnectionKind } from "@oltflow/core";

type Filter = "online" | "offline" | "low-signal" | null;

const FILTER_LABELS: Record<Exclude<Filter, null>, string> = {
  online: "Online",
  offline: "Offline",
  "low-signal": "Sinjal i ulët",
};

function matchesFilter(o: OnuRow, filter: Filter): boolean {
  if (!filter) return true;
  if (filter === "online") return o.state === "working";
  if (filter === "offline") return o.state !== "working";
  if (filter === "low-signal") return o.onuRx !== null && o.onuRx !== undefined && o.onuRx < -25;
  return true;
}

export default function OnusPage() {
  const { currentOlt } = useOlts();
  const searchParams = useSearchParams();
  const filter = (searchParams.get("filter") as Filter) ?? null;
  const [onus, setOnus] = useState<OnuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pppoeTarget, setPppoeTarget] = useState<string | null>(null);

  async function load() {
    if (!currentOlt) return;
    setLoading(true);
    try {
      const { onus } = await api.onus(currentOlt.id);
      setOnus(onus);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOlt?.id]);

  const filtered = onus
    .filter((o) => matchesFilter(o, filter))
    .filter((o) => `${o.ponPort}${o.serial ?? ""}${o.name ?? ""}${o.type ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  if (!currentOlt) {
    return (
      <Card>
        <Empty icon="🔌">Zgjidh ose shto një OLT.</Empty>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold text-slate-900">ONU-të e Konfiguruara</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {currentOlt.name} · {onus.length} ONU gjithsej
            {filter && (
              <>
                {" · filtër: "}
                <span className="font-semibold text-slate-700">{FILTER_LABELS[filter]}</span>{" "}
                <Link href="/onus" className="text-blue-600 hover:underline">
                  (hiq)
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kërko SN, port, emër..."
            className="w-60 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-600"
          />
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner /> : "🔄"} Rifresko
          </Button>
        </div>
      </div>

      <Card>
        {loading && onus.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty>Asnjë ONU</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3.5 py-2.5">Port</th>
                  <th className="px-3.5 py-2.5">Serial</th>
                  <th className="px-3.5 py-2.5">Emri</th>
                  <th className="px-3.5 py-2.5">Tipi</th>
                  <th className="px-3.5 py-2.5">State</th>
                  <th className="px-3.5 py-2.5">Sinjali</th>
                  <th className="px-3.5 py-2.5">IP (WAN)</th>
                  <th className="px-3.5 py-2.5">Online</th>
                  <th className="px-3.5 py-2.5">Veprime</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-xs text-blue-600">
                      {formatPonPort(o.ponPort)} {isEponPort(o.ponPort) && <Badge color="gray">EPON</Badge>}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs">{o.serial || "–"}</td>
                    <td className="px-3.5 py-2.5 font-medium">{o.name || "–"}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge color="blue">{o.type || "–"}</Badge>
                        {onuConnectionKind(o.type) === "bridge" && <Badge color="gray">Bridge</Badge>}
                        {onuConnectionKind(o.type) === "route" && <Badge color="gray">Route</Badge>}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge color={stateBadgeColor(o.state)}>● {stateLabel(o.state)}</Badge>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <SignalPill rx={o.onuRx} />
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs">
                      {o.wanIp ? (
                        <a
                          href={`http://${o.wanIp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                          title="Hap panelin web të ONU-së"
                        >
                          {o.wanIp} ↗
                        </a>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-500">{o.onlineDuration || "–"}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1.5">
                        <Link href={`/onus/${o.id}`} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">
                          🔍 Detaje
                        </Link>
                        {!isEponPort(o.ponPort) && (
                          <Button variant="success" className="px-2 py-1 text-[11px]" onClick={() => setPppoeTarget(o.ponPort)}>
                            🔐 PPPoE
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pppoeTarget && (
        <PppoeModal open oltId={currentOlt.id} ponPort={pppoeTarget} onClose={() => setPppoeTarget(null)} onDone={load} />
      )}
    </div>
  );
}
