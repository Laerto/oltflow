"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface SessionRow {
  id: string;
  userId: number;
  email: string;
  name: string | null;
  role: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revoked: boolean;
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminSessions();
      setSessions(data.sessions);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  async function revokeOne(id: string) {
    if (!confirm("Revoko këtë sesion?")) return;
    setBusy(id);
    try {
      await api.adminRevokeSession(id);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(null);
    }
  }

  async function revokeAll(userId: number, email: string) {
    if (!confirm(`Revoko të gjitha sesionet për ${email}?`)) return;
    setBusy(`user-${userId}`);
    try {
      await api.adminRevokeUserSessions(userId);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MonitorSmartphone className="h-4 w-4 text-primary" /> Sesione aktive
        </h2>
        <p className="text-xs text-muted-foreground">{sessions.filter((s) => !s.revoked).length} sesione të hapura</p>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Përdorues</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">UA</th>
                <th className="px-3 py-2">Krijuar</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{s.email}</div>
                    <div className="text-[10px] text-muted-foreground">{s.role}</div>
                  </td>
                  <td className="px-3 py-1.5 font-mono">{s.ip ?? "—"}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-muted-foreground" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString("sq-AL")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {new Date(s.lastSeenAt).toLocaleString("sq-AL")}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className={s.revoked ? "border-rose-500/30 text-rose-600" : "border-emerald-500/30 text-emerald-600"}>
                      {s.revoked ? "revoked" : "active"}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      {!s.revoked && (
                        <>
                          <Button size="sm" variant="secondary" className="h-7 px-2" disabled={busy === s.id} onClick={() => revokeOne(s.id)}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            disabled={busy === `user-${s.userId}`}
                            onClick={() => revokeAll(s.userId, s.email)}
                          >
                            Të gjitha
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Asnjë sesion
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
