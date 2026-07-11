"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface Win {
  id: number;
  name: string;
  oltId: number | null;
  oltName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  active: boolean;
}

export default function MaintenancePage() {
  const [windows, setWindows] = useState<Win[]>([]);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminMaintenance();
      setWindows(data.windows);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    try {
      await api.adminCreateMaintenance({
        name: name || "Maintenance",
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason || undefined,
      });
      setName("");
      setReason("");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }

  async function remove(id: number) {
    if (!confirm("Fshi dritaren?")) return;
    try {
      await api.adminDeleteMaintenance(id);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Wrench className="h-4 w-4 text-primary" /> Maintenance windows
        </h2>
        <p className="text-xs text-muted-foreground">Gjatë dritares, njoftimet dhe alarme të reja shtypen (fleet-wide ose per OLT).</p>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">Emri</Label>
          <Input className="mt-1 h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Upgrade C320" />
        </div>
        <div>
          <Label className="text-xs">Fillon</Label>
          <Input className="mt-1 h-8 text-xs" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Mbaron</Label>
          <Input className="mt-1 h-8 text-xs" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button size="sm" className="w-full" onClick={create} disabled={!startsAt || !endsAt}>
            Krijo
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Arsyeja</Label>
          <Input className="mt-1 h-8 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Emri</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Fillon</th>
              <th className="px-3 py-2">Mbaron</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={w.id} className="border-t border-border/50">
                <td className="px-3 py-2 font-medium">{w.name}</td>
                <td className="px-3 py-2">{w.oltName ?? "Të gjitha OLT"}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(w.startsAt).toLocaleString("sq-AL")}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(w.endsAt).toLocaleString("sq-AL")}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={w.active ? "border-amber-500/30 text-amber-600" : ""}>
                    {w.active ? "ACTIVE" : "scheduled/past"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => remove(w.id)}>
                    Fshi
                  </Button>
                </td>
              </tr>
            ))}
            {windows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Asnjë dritare
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
