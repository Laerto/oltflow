"use client";

import { useState } from "react";
import { useOlts } from "../providers";
import { api, pollJob, ApiError, type UncfgOnu } from "@/lib/api";
import { Card, Empty, Spinner, Badge, Button, Alert } from "@/components/ui";
import { ProvisionModal } from "@/components/provision-modal";
import { PppoeModal } from "@/components/pppoe-modal";

export default function UnconfiguredPage() {
  const { currentOlt } = useOlts();
  const [onus, setOnus] = useState<UncfgOnu[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<UncfgOnu | null>(null);
  const [pppoeTarget, setPppoeTarget] = useState<string | null>(null);

  async function scan() {
    if (!currentOlt) return;
    setLoading(true);
    setError(null);
    try {
      const { jobId } = await api.scanUnconfigured(currentOlt.id);
      const job = await pollJob(jobId, { timeoutMs: 30000 });
      if (job.status === "failed") throw new Error(job.error ?? "Skanimi dështoi");
      const output = job.output as { onus: UncfgOnu[] };
      setOnus(output.onus ?? []);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

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
          <div className="text-xl font-bold text-slate-900">⏳ Waiting Authorization</div>
          <div className="mt-0.5 text-xs text-slate-500">ONU të paautorizuara — {currentOlt.name}</div>
        </div>
        <Button onClick={scan} disabled={loading}>
          {loading ? <Spinner /> : "🔍"} Skano
        </Button>
      </div>

      {error && <Alert kind="err">{error}</Alert>}

      <Card className="mt-3">
        {onus.length === 0 ? (
          <Empty icon="⏳">Kliko &ldquo;Skano&rdquo;</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase text-slate-500">
                  <th className="px-3.5 py-2.5">Serial Number</th>
                  <th className="px-3.5 py-2.5">PON Port</th>
                  <th className="px-3.5 py-2.5">Detected</th>
                  <th className="px-3.5 py-2.5">Veprime</th>
                </tr>
              </thead>
              <tbody>
                {onus.map((o) => (
                  <tr key={o.ponPort} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3.5 py-2.5 font-mono text-xs">{o.serial}</td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500">{o.ponPort.replace("gpon-onu_", "")}</td>
                    <td className="px-3.5 py-2.5">
                      <Badge color="amber">⏳ {o.state}</Badge>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1.5">
                        <Button className="px-2 py-1 text-[11px]" onClick={() => setTarget(o)}>
                          ⚡ Autorizo
                        </Button>
                        <Button variant="success" className="px-2 py-1 text-[11px]" onClick={() => setPppoeTarget(o.ponPort)}>
                          🔐 PPPoE
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

      {target && (
        <ProvisionModal
          open
          onClose={() => setTarget(null)}
          oltId={currentOlt.id}
          serial={target.serial}
          ponPort={target.ponPort}
          onDone={scan}
        />
      )}
      {pppoeTarget && <PppoeModal open oltId={currentOlt.id} ponPort={pppoeTarget} onClose={() => setPppoeTarget(null)} />}
    </div>
  );
}
