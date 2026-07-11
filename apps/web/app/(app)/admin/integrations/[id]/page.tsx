"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Zap, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsappLinkPanel } from "@/components/whatsapp-link-panel";
import { api, ApiError } from "@/lib/api";

const FIELDS: Record<string, { key: string; label: string; secret?: boolean; type?: string }[]> = {
  telegram: [
    { key: "botToken", label: "Bot token", secret: true },
    { key: "defaultChatId", label: "Default chat ID" },
  ],
  smtp: [
    { key: "host", label: "Host" },
    { key: "port", label: "Port", type: "number" },
    { key: "user", label: "User" },
    { key: "pass", label: "App password", secret: true },
    { key: "from", label: "From address" },
  ],
  webhook: [
    { key: "url", label: "Webhook URL" },
    { key: "secret", label: "HMAC secret", secret: true },
  ],
  whatsapp: [
    { key: "defaultRecipient", label: "Numër marrësi (parazgjedhur, opsional)" },
    { key: "phoneNumberId", label: "Meta phone number ID (opsional)" },
    { key: "accessToken", label: "Meta access token (opsional)", secret: true },
    { key: "templateAlarm", label: "Meta alarm template (opsional)" },
  ],
  genieacs: [
    { key: "nbiUrl", label: "NBI URL" },
    { key: "acsUrl", label: "ACS URL (for ONUs)" },
    { key: "username", label: "Username" },
    { key: "password", label: "Password", secret: true },
  ],
  radius: [{ key: "databaseUrl", label: "MySQL URL (RO)", secret: true }],
  winbox: [{ key: "port", label: "Port", type: "number" }],
};

export default function IntegrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgChats, setTgChats] = useState<{ id: string; title: string; type: string }[] | null>(null);

  async function loadTelegramChats() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.telegramChats();
      setTgChats(r.chats);
      if (r.detail) setMsg({ kind: r.chats.length ? "ok" : "err", text: r.detail });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await api.adminIntegration(id);
      setEnabled(data.enabled);
      setStatus(data.status);
      setStatusDetail(data.statusDetail);
      const c: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.config ?? {})) {
        if (k.endsWith("Set")) continue;
        c[k] = v == null ? "" : String(v);
      }
      setConfig(c);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { ...config };
      if (payload.port !== undefined) payload.port = Number(payload.port) || 587;
      await api.adminSaveIntegration(id, { enabled, config: payload });
      setMsg({ kind: "ok", text: "U ruajt" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(false);
    }
  }

  async function test(sendTest = false) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.adminTestIntegration(id, {
        sendTest,
        to: config.from || undefined,
      });
      setMsg({ kind: r.ok ? "ok" : "err", text: r.detail || (r.ok ? "OK" : "Failed") });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(false);
    }
  }

  function applyGmailPreset() {
    setConfig((c) => ({
      ...c,
      host: "smtp.gmail.com",
      port: "587",
      secure: "false",
    }));
    setMsg({
      kind: "ok",
      text: "Gmail: shto adresën në 'User' dhe një App Password (jo fjalëkalimin normal).",
    });
  }

  const fields = FIELDS[id] ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <button
        type="button"
        onClick={() => router.push("/admin/integrations")}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Integrime
      </button>

      <div>
        <h2 className="text-base font-semibold capitalize">{id}</h2>
        <p className="text-xs text-muted-foreground">
          Status: {status ?? "—"} {statusDetail ? `· ${statusDetail}` : ""}
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-rose-500/40 bg-rose-500/10 text-rose-600"
          }`}
        >
          {msg.text}
        </div>
      )}

      {id === "whatsapp" && <WhatsappLinkPanel />}

      <Card className="space-y-4 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-primary" />
          Enabled
        </label>

        {id === "smtp" && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">Gmail</span>
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={applyGmailPreset}>
                Plotëso Gmail
              </Button>
            </div>
            Host <code>smtp.gmail.com</code> · port <code>587</code> (STARTTLS). Përdor një{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              App Password
            </a>{" "}
            (kërkon 2FA në llogari) — jo fjalëkalimin normal.
          </div>
        )}

        {fields.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <Input
              className="mt-1 h-8 font-mono text-xs"
              type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
              value={config[f.key] ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              placeholder={f.secret ? "••••••••" : ""}
            />
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="mr-1 h-3.5 w-3.5" /> Ruaj
          </Button>
          <Button size="sm" variant="secondary" onClick={() => test(false)} disabled={busy}>
            <Zap className="mr-1 h-3.5 w-3.5" /> Test
          </Button>
          {(id === "telegram" || id === "smtp") && (
            <Button size="sm" variant="outline" onClick={() => test(true)} disabled={busy}>
              Test + dërgo
            </Button>
          )}
        </div>
      </Card>

      {id === "telegram" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Gjej chat ID</div>
            <Button size="sm" variant="secondary" onClick={loadTelegramChats} disabled={busy}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Merr chat-et
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ruaj token-in më sipër, dërgo një mesazh botit (ose shtoje në grup), pastaj kliko
            &ldquo;Merr chat-et&rdquo; dhe zgjidh një chat për ta vendosur si marrës parazgjedhur.
          </p>
          {tgChats && tgChats.length > 0 && (
            <div className="flex flex-col gap-1">
              {tgChats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setConfig((cfg) => ({ ...cfg, defaultChatId: c.id }))}
                  className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted/50"
                >
                  <span className="truncate">
                    {c.title} <span className="text-muted-foreground">· {c.type}</span>
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{c.id}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Rregullat e alarmeve menaxhohen te{" "}
            <Link href="/admin/integrations/rules" className="text-primary underline">
              Rregullat e njoftimeve
            </Link>
            .
          </p>
        </Card>
      )}
    </div>
  );
}
