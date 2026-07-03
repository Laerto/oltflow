"use client";

import { useState } from "react";
import { AppWindow, Pencil, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Access helper for the Mikrotik behind a bridge ONU. These routers expose only Winbox
 * (8291) — SSH/API/WebFig are disabled — so the primary action is a ONE-CLICK `winbox://`
 * launch (`winboxUrl`, built server-side with the shared creds) that opens Winbox already
 * logged in. Requires the small per-PC handler in tools/winbox-handler/. When the handler
 * or creds are absent the button still works as a COPY-IP fallback (paste into Winbox
 * "Connect To", port 8291).
 */
export function WinboxButton({
  onuId,
  mgmtIp,
  winboxUrl,
  mac,
  onSaved,
}: {
  onuId: number;
  mgmtIp: string | null;
  winboxUrl?: string | null;
  mac?: string | null;
  onSaved?: (ip: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState(mgmtIp ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyIp(value: string, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.setOnuMgmtIp(onuId, ip.trim());
      onSaved?.(res.mgmtIp);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gabim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {mgmtIp ? (
        <span className="inline-flex items-center gap-1">
          {winboxUrl ? (
            // One-click: open Winbox already logged in (via the winbox:// PC handler).
            <a
              href={winboxUrl}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary hover:bg-primary/20"
              title={`Hap Winbox — kyçje automatike te ${mgmtIp}`}
            >
              <AppWindow className="h-3.5 w-3.5" /> {mgmtIp}
            </a>
          ) : (
            // No handler/creds → fall back to copy IP for pasting into Winbox "Connect To".
            <button
              onClick={(e) => copyIp(mgmtIp, e)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary hover:bg-primary/20"
              title="Kopjo IP-në për Winbox (Connect To)"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {mgmtIp}
            </button>
          )}
          {/* Copy IP — always available as a fallback if the one-click handler isn't installed */}
          <button onClick={(e) => copyIp(mgmtIp, e)} className="text-muted-foreground hover:text-foreground" title="Kopjo IP-në">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setIp(mgmtIp); setOpen(true); }} className="text-muted-foreground hover:text-foreground" title="Ndrysho IP-në">
            <Pencil className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          onClick={() => { setIp(""); setOpen(true); }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          title="Cakto IP-në e Mikrotik-ut"
        >
          <AppWindow className="h-3.5 w-3.5" /> Mikrotik
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <AppWindow className="h-5 w-5 text-primary" /> Mikrotik / Winbox
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {mac && (
              <p className="text-xs text-muted-foreground">
                MAC pas ONU-së: <span className="font-mono text-foreground">{mac}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">IP e Mikrotik-ut</Label>
              <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="p.sh. 10.0.199.28" className="font-mono" />
            </div>
            {error && (
              <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            )}
            {ip.trim() && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <a href={`winbox://${ip.trim()}`} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary" title="Hap Winbox te kjo IP (kërkon handler-in winbox://)">
                  <AppWindow className="h-3.5 w-3.5" /> Hap Winbox
                </a>
                <button onClick={() => copyIp(ip.trim())} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-muted-foreground hover:text-foreground">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "U kopjua" : `Kopjo ${ip.trim()}`}
                </button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Ruaje IP-në për kyçje me një klik (auto-login) nga lista. Kërkon handler-in <code>winbox://</code> të instaluar në PC (shih <code>tools/winbox-handler</code>). Përndryshe <strong>kopjo IP-në</strong> dhe ngjite te &ldquo;Connect To&rdquo; në Winbox (porta 8291).
            </p>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Mbyll</Button>
              <Button type="button" onClick={save} disabled={saving}>{saving ? "Duke ruajtur..." : "Ruaj IP-në"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
