"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOlts } from "../providers";
import { api, ApiError, type OltSummary } from "@/lib/api";
import { Card, Badge, Button, Empty } from "@/components/ui";
import { EditOltModal } from "@/components/edit-olt-modal";

export default function OltsPage() {
  const { olts, refresh, setCurrentOltId } = useOlts();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<OltSummary | null>(null);

  async function remove(id: number, name: string) {
    if (!confirm(`Fshi OLT "${name}"? Kjo do fshijë gjithë ONU-të dhe historikun e sinjalit të lidhura.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await api.deleteOlt(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gabim i papritur");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 text-xl font-bold text-slate-900">🔌 Menaxhimi i OLT-eve</div>
      {error && <div className="mb-3 text-xs text-red-600">⚠ {error}</div>}
      <Card>
        {olts.length === 0 ? (
          <Empty icon="🔌">Asnjë OLT — kliko &ldquo;+ Shto OLT&rdquo; lart.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase text-slate-500">
                  <th className="px-3.5 py-2.5">#</th>
                  <th className="px-3.5 py-2.5">Emri</th>
                  <th className="px-3.5 py-2.5">IP</th>
                  <th className="px-3.5 py-2.5">Lokacioni</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5">ONU</th>
                  <th className="px-3.5 py-2.5">Last Sync</th>
                  <th className="px-3.5 py-2.5">Veprime</th>
                </tr>
              </thead>
              <tbody>
                {olts.map((o, i) => (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3.5 py-2.5">{i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold">{o.name}</td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-blue-600">{o.ip}</td>
                    <td className="px-3.5 py-2.5">{o.location || "–"}</td>
                    <td className="px-3.5 py-2.5">
                      <Badge color={o.status === "online" ? "green" : o.status === "offline" ? "red" : "gray"}>● {o.status}</Badge>
                    </td>
                    <td className="px-3.5 py-2.5">{o.total}</td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-500">{o.lastSync ? new Date(o.lastSync).toLocaleString("sq-AL") : "–"}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1.5">
                        <Button
                          className="px-2 py-1 text-[11px]"
                          onClick={() => {
                            setCurrentOltId(o.id);
                            router.push("/");
                          }}
                        >
                          Dashboard
                        </Button>
                        <Button variant="secondary" className="px-2 py-1 text-[11px]" onClick={() => setEditTarget(o)}>
                          ✏
                        </Button>
                        <Button variant="danger" className="px-2 py-1 text-[11px]" disabled={busyId === o.id} onClick={() => remove(o.id, o.name)}>
                          🗑
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editTarget && (
        <EditOltModal open onClose={() => setEditTarget(null)} olt={editTarget} onSaved={refresh} />
      )}
    </div>
  );
}
