"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

interface SettingRow {
  key: string;
  label: string;
  group: string;
  type: "number" | "string" | "boolean";
  value: unknown;
  updatedAt: string | null;
}

const GROUP_LABEL: Record<string, string> = {
  signal: "Thresholds sinjali",
  sync: "Intervale sync",
  retain: "Retention",
  app: "Aplikacioni",
  acs: "GenieACS",
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminSettings();
      setSettings(data.settings);
      const d: Record<string, string> = {};
      for (const s of data.settings) {
        if (s.type === "boolean") d[s.key] = s.value === true || s.value === "true" ? "true" : "false";
        else d[s.key] = String(s.value ?? "");
      }
      setDraft(d);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: string) {
    setBusy(key);
    try {
      const meta = settings.find((s) => s.key === key);
      const raw = draft[key];
      let value: unknown = raw;
      if (meta?.type === "number") value = Number(raw);
      else if (meta?.type === "boolean") value = raw === "true" || raw === "1";
      await api.adminSetSetting(key, value);
      setMsg({ kind: "ok", text: `U ruajt: ${key}` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(null);
    }
  }

  const groups = [...new Set(settings.map((s) => s.group))];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Settings className="h-4 w-4 text-primary" /> Cilësimet e sistemit
        </h2>
        <p className="text-xs text-muted-foreground">
          Ndryshimet hot-reload-ohen në worker (cache ~15s). Nuk nevojitet restart.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            msg.kind === "err" ? "border-rose-500/40 bg-rose-500/10 text-rose-600" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {groups.map((g) => (
        <Card key={g} className="p-4">
          <h3 className="mb-3 text-sm font-semibold">{GROUP_LABEL[g] ?? g}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {settings
              .filter((s) => s.group === g)
              .map((s) => (
                <div key={s.key} className="rounded-lg border border-border p-3">
                  <Label className="text-xs">{s.label}</Label>
                  <div className="mt-1 flex gap-2">
                    {s.type === "boolean" ? (
                      <label className="flex h-8 flex-1 items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={draft[s.key] === "true" || draft[s.key] === "1"}
                          onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.checked ? "true" : "false" }))}
                        />
                        {draft[s.key] === "true" || draft[s.key] === "1" ? "Aktiv" : "Joaktiv"}
                      </label>
                    ) : (
                      <Input
                        className="h-8 font-mono text-xs"
                        type={s.type === "number" ? "number" : "text"}
                        value={draft[s.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                      />
                    )}
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={busy === s.key || String(s.value) === draft[s.key]}
                      onClick={() => save(s.key)}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">{s.key}</div>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
