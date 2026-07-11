"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

interface Rule {
  id: number;
  name: string;
  eventType: string;
  severityMin: string | null;
  enabled: boolean;
  behavior: string;
  channels: { type: string }[];
  quietStart: string | null;
  quietEnd: string | null;
}

export default function NotificationRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [meta, setMeta] = useState<{ eventTypes: string[]; channels: string[]; behaviors: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("onu.offline");

  const load = useCallback(async () => {
    try {
      const data = await api.adminNotifyRules();
      setRules(data.rules as unknown as Rule[]);
      setMeta(data.meta);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(r: Rule) {
    try {
      await api.adminUpdateNotifyRule(r.id, { enabled: !r.enabled });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }

  async function create() {
    try {
      await api.adminCreateNotifyRule({
        name: name || `Rule ${eventType}`,
        eventType,
        channels: [{ type: "telegram" }],
        behavior: "once_until_clear",
        enabled: true,
        scopeAll: true,
      });
      setShowNew(false);
      setName("");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }

  async function remove(id: number) {
    if (!confirm("Fshi rregullin?")) return;
    try {
      await api.adminDeleteNotifyRule(id);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bell className="h-4 w-4 text-primary" /> Rregullat e njoftimeve
          </h2>
          <p className="text-xs text-muted-foreground">Event × severity × channel × behavior. Seeded me rregullat Telegram të v2.</p>
        </div>
        <Button size="sm" onClick={() => setShowNew((v) => !v)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Rregull i ri
        </Button>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      {showNew && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <div>
            <div className="text-[10px] text-muted-foreground">Emri</div>
            <Input className="h-8 w-48 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Event</div>
            <select className="h-8 rounded-md border border-input bg-transparent px-2 text-xs" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {(meta?.eventTypes ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={create}>
            Krijo
          </Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Emri</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Kanale</th>
              <th className="px-3 py-2">Behavior</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-border/50">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.eventType}</td>
                <td className="px-3 py-2">
                  {(Array.isArray(r.channels) ? r.channels : []).map((c, i) => (
                    <Badge key={i} variant="outline" className="mr-1 text-[10px]">
                      {c.type}
                    </Badge>
                  ))}
                </td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.behavior}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={r.enabled ? "border-emerald-500/30 text-emerald-600" : "text-muted-foreground"}>
                    {r.enabled ? "on" : "off"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => toggle(r)}>
                      {r.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => remove(r.id)}>
                      Fshi
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
