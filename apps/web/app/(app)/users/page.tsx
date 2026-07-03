"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import { api, ApiError, type UserRow } from "@/lib/api";
import { useMe } from "@/app/(app)/providers";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES: Role[] = ["admin", "support", "viewer"];
const roleBadge: Record<string, string> = {
  admin: "border-rose-500/30 bg-rose-500/10 text-rose-600",
  support: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  viewer: "border-slate-400/30 bg-slate-400/10 text-slate-500",
};

export default function UsersPage() {
  const me = useMe();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // New-user form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("support");

  const load = useCallback(async () => {
    try {
      const { users } = await api.listUsers();
      setUsers(users);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim gjatë ngarkimit" });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0); // defer out of the effect body
    return () => clearTimeout(t);
  }, [load]);

  async function createUser() {
    setBusy(true);
    setMsg(null);
    try {
      await api.createUser({ email: email.trim(), name: name.trim() || undefined, password, role });
      setEmail(""); setName(""); setPassword(""); setRole("support");
      setMsg({ kind: "ok", text: "Përdoruesi u krijua" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: UserRow, newRole: string) {
    try {
      await api.updateUser(u.id, { role: newRole });
      setMsg({ kind: "ok", text: `Roli i ${u.email} → ${newRole}` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    }
  }

  async function resetPassword(u: UserRow) {
    const pw = window.prompt(`Fjalëkalim i ri për ${u.email} (min 6 karaktere):`);
    if (!pw) return;
    try {
      await api.updateUser(u.id, { password: pw });
      setMsg({ kind: "ok", text: `Fjalëkalimi i ${u.email} u ndryshua` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    }
  }

  async function removeUser(u: UserRow) {
    if (!window.confirm(`Të fshihet përdoruesi ${u.email}?`)) return;
    try {
      await api.deleteUser(u.id);
      setMsg({ kind: "ok", text: `${u.email} u fshi` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    }
  }

  const canSubmit = /\S+@\S+\.\S+/.test(email) && password.length >= 6 && !busy;

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <Users className="h-5 w-5 text-primary" /> Përdoruesit
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Menaxho hyrjet dhe rolet e ekipit — vetëm admin.</p>
      </div>

      {msg && <Alert variant={msg.kind === "err" ? "destructive" : "default"} className="mb-4">{msg.text}</Alert>}

      {/* Create */}
      <Card className="mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4 text-primary" /> Shto përdorues</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><Label className="text-xs">Email *</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="perdorues@kompania.al" /></div>
          <div><Label className="text-xs">Emri</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emër Mbiemër" /></div>
          <div><Label className="text-xs">Fjalëkalim *</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 karaktere" /></div>
          <div>
            <Label className="text-xs">Roli</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={createUser} disabled={!canSubmit} className="w-full">{busy ? "Duke ruajtur…" : "Krijo"}</Button></div>
        </div>
      </Card>

      {/* List */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-[10px] font-bold uppercase text-muted-foreground">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Emri</th>
                <th className="px-4 py-2">Roli</th>
                <th className="px-4 py-2">Krijuar</th>
                <th className="px-4 py-2 text-right">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = me?.id === u.id;
                return (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">
                      {u.email} {self && <span className="text-[10px] text-muted-foreground">(ju)</span>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{u.name || "–"}</td>
                    <td className="px-4 py-2">
                      <Select value={u.role} onValueChange={(v) => changeRole(u, v)} disabled={self}>
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${roleBadge[u.role] ?? ""}`}>{ROLE_LABELS[u.role as Role] ?? u.role}</span>
                        </SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("sq-AL")}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="secondary" className="px-2 py-1 text-[11px]" onClick={() => resetPassword(u)} title="Reset password">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive" className="px-2 py-1 text-[11px]" onClick={() => removeUser(u)} disabled={self} title={self ? "Nuk mund të fshish vetveten" : "Fshi"}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground"><ShieldCheck className="mx-auto mb-1 h-5 w-5" />Asnjë përdorues</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
