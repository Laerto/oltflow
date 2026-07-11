"use client";

import { useCallback, useEffect, useState } from "react";
import {
  HardDrive,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Terminal,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface Target {
  id: number;
  kind: string;
  name: string;
  schedule: string | null;
  retention: { keepLast?: number } | null;
  enabled: boolean;
  lastRunAt: string | null;
  config: Record<string, unknown>;
}

interface Run {
  id: number;
  targetName: string | null;
  targetKind: string | null;
  status: string;
  path: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  log: string | null;
  verifiedAt: string | null;
}

function fmtSize(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function AdminBackupPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [restoreCmd, setRestoreCmd] = useState("");

  // New target form
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"local" | "ssh">("local");
  const [name, setName] = useState("Local backups");
  const [path, setPath] = useState("");
  const [schedule, setSchedule] = useState("daily:03:00");
  const [keepLast, setKeepLast] = useState("7");
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshRemote, setSshRemote] = useState("/backups/oltflow");
  const [sshKey, setSshKey] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([api.adminBackupTargets(), api.adminBackupRuns()]);
      setTargets(t.targets as unknown as Target[]);
      setRuns(r.runs as unknown as Run[]);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  async function createTarget() {
    setBusy(true);
    setMsg(null);
    try {
      const config =
        kind === "local"
          ? { path: path || "local" }
          : {
              host: sshHost,
              port: Number(sshPort) || 22,
              user: sshUser,
              remotePath: sshRemote,
              privateKey: sshKey || undefined,
            };
      await api.adminCreateBackupTarget({
        kind,
        name,
        config,
        schedule: schedule || null,
        retention: { keepLast: Number(keepLast) || 7 },
        enabled: true,
      });
      setShowForm(false);
      setMsg("Target u krijua");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  async function backupNow(targetId?: number) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.adminStartBackup(targetId);
      setMsg(`Backup u nis (run #${r.runId})`);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: number) {
    setBusy(true);
    try {
      await api.adminVerifyBackup(id);
      setMsg(`Verify u nis për run #${id}`);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  async function openRun(r: Run) {
    setSelectedRun(r);
    try {
      const d = await api.adminBackupRun(r.id);
      setRestoreCmd(d.restoreCommand);
      setSelectedRun(d.run as unknown as Run);
    } catch {
      setRestoreCmd(`./scripts/restore.sh /var/lib/oltflow/backups/${r.path ?? "<path>"}`);
    }
  }

  async function removeTarget(id: number) {
    if (!confirm("Fshi target-in?")) return;
    await api.adminDeleteBackupTarget(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <HardDrive className="h-4 w-4 text-primary" /> Backup & migrim
          </h2>
          <p className="text-xs text-muted-foreground">
            pg_dump + config archive. Restore është CLI-only (shiko komandën më poshtë).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Rifresko
          </Button>
          <Button size="sm" onClick={() => backupNow()} disabled={busy}>
            <Play className="mr-1 h-3.5 w-3.5" /> Backup tani
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Target
          </Button>
        </div>
      </div>

      {err && <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{err}</div>}
      {msg && <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">{msg}</div>}

      {showForm && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Emri</Label>
              <Input className="mt-1 h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Lloji</Label>
              <select
                className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                value={kind}
                onChange={(e) => setKind(e.target.value as "local" | "ssh")}
              >
                <option value="local">Local volume</option>
                <option value="ssh">SSH / SCP</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Schedule (UTC)</Label>
              <Input
                className="mt-1 h-8 font-mono text-xs"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="daily:03:00 ose weekly:sun:03:00 ose bosh"
              />
            </div>
            <div>
              <Label className="text-xs">Mbaj N të fundit</Label>
              <Input className="mt-1 h-8 text-xs" value={keepLast} onChange={(e) => setKeepLast(e.target.value)} />
            </div>
            {kind === "local" ? (
              <div className="sm:col-span-2">
                <Label className="text-xs">Nënfolder (nën BACKUP_DIR)</Label>
                <Input className="mt-1 h-8 font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value)} placeholder="local" />
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Host</Label>
                  <Input className="mt-1 h-8 text-xs" value={sshHost} onChange={(e) => setSshHost(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">User</Label>
                  <Input className="mt-1 h-8 text-xs" value={sshUser} onChange={(e) => setSshUser(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Port</Label>
                  <Input className="mt-1 h-8 text-xs" value={sshPort} onChange={(e) => setSshPort(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Remote path</Label>
                  <Input className="mt-1 h-8 font-mono text-xs" value={sshRemote} onChange={(e) => setSshRemote(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Private key (PEM)</Label>
                  <textarea
                    className="mt-1 h-24 w-full rounded-md border border-input bg-transparent p-2 font-mono text-[10px]"
                    value={sshKey}
                    onChange={(e) => setSshKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  />
                </div>
              </>
            )}
          </div>
          <Button size="sm" onClick={createTarget} disabled={busy}>
            Ruaj target
          </Button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Targets
          </div>
          <div className="divide-y divide-border/60">
            {targets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t.kind} · {t.schedule || "manual"} · keep {t.retention?.keepLast ?? "?"}
                    {t.lastRunAt ? ` · last ${new Date(t.lastRunAt).toLocaleString("sq-AL")}` : ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" className="h-7 px-2" disabled={busy} onClick={() => backupNow(t.id)}>
                    <Play className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => removeTarget(t.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {targets.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Asnjë target — backup tani shkruan në BACKUP_DIR default.
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Historiku
          </div>
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border/60">
            {runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openRun(r)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    #{r.id} {r.targetName ?? "default"}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {new Date(r.startedAt).toLocaleString("sq-AL")} · {fmtSize(r.sizeBytes)}
                    {r.path ? ` · ${r.path}` : ""}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    r.status === "success" || r.status === "verified"
                      ? "border-emerald-500/30 text-emerald-600"
                      : r.status === "failed"
                        ? "border-rose-500/30 text-rose-600"
                        : r.status === "running"
                          ? "border-blue-500/30 text-blue-600"
                          : ""
                  }
                >
                  {r.status}
                </Badge>
              </button>
            ))}
            {runs.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Asnjë backup ende</div>
            )}
          </div>
        </Card>
      </div>

      {selectedRun && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Run #{selectedRun.id} · {selectedRun.status}
            </h3>
            <div className="flex gap-2">
              {(selectedRun.status === "success" || selectedRun.status === "verified") && (
                <Button size="sm" variant="secondary" onClick={() => verify(selectedRun.id)} disabled={busy}>
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Verify
                </Button>
              )}
            </div>
          </div>
          {selectedRun.sha256 && (
            <div className="font-mono text-[10px] text-muted-foreground">sha256: {selectedRun.sha256}</div>
          )}
          {selectedRun.error && <div className="text-xs text-rose-600">{selectedRun.error}</div>}
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
              <Terminal className="h-3 w-3" /> Restore (CLI only)
            </div>
            <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
              {restoreCmd || `./scripts/restore.sh /var/lib/oltflow/backups/${selectedRun.path}`}
            </pre>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Restore është qëllimisht jashtë UI (destruktiv). Shiko docs/BACKUP.md.
            </p>
          </div>
          {selectedRun.log && (
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[10px] leading-relaxed">
              {selectedRun.log}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
