"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Trash2, KeyRound, ShieldCheck, Server, Check, Send } from "lucide-react";
import { api, ApiError, type UserRow, type OltSummary } from "@/lib/api";
import { useMe } from "@/app/(app)/providers";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROLES: Role[] = ["admin", "support", "technician", "viewer"];
const roleBadge: Record<string, string> = {
  admin: "border-rose-500/30 bg-rose-500/10 text-rose-600",
  support: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  technician: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  viewer: "border-slate-400/30 bg-slate-400/10 text-slate-500",
};

/** Toggleable OLT chips for scoping a support/viewer user. Empty selection = all OLTs. */
function OltPicker({ olts, selected, onToggle }: { olts: OltSummary[]; selected: Set<number>; onToggle: (id: number) => void }) {
  if (olts.length === 0) return <p className="text-[11px] text-muted-foreground">Asnjë OLT ende.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {olts.map((o) => {
        const on = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              on ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {on ? <Check className="h-3 w-3" /> : <Server className="h-3 w-3" />} {o.name}
          </button>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const me = useMe();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [olts, setOlts] = useState<OltSummary[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // New-user form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("support");
  const [newOltIds, setNewOltIds] = useState<Set<number>>(new Set());
  const [newTelegram, setNewTelegram] = useState("");

  // Per-user scope editor
  const [scopeUser, setScopeUser] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ users }, { olts }] = await Promise.all([api.listUsers(), api.listOlts()]);
      setUsers(users);
      setOlts(olts);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim gjatë ngarkimit" });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0); // defer out of the effect body
    return () => clearTimeout(t);
  }, [load]);

  function toggleNewOlt(id: number) {
    setNewOltIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createUser() {
    setBusy(true);
    setMsg(null);
    try {
      await api.createUser({
        email: email.trim(),
        name: name.trim() || undefined,
        password,
        role,
        oltIds: role === "admin" ? [] : [...newOltIds],
        telegramChatId: newTelegram.trim() || undefined,
      });
      setEmail(""); setName(""); setPassword(""); setRole("support"); setNewOltIds(new Set()); setNewTelegram("");
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

  async function editTelegram(u: UserRow) {
    const tg = window.prompt(`Telegram chat id për ${u.email} (bosh për ta hequr):`, u.telegramChatId ?? "");
    if (tg === null) return;
    try {
      await api.updateUser(u.id, { telegramChatId: tg.trim() });
      setMsg({ kind: "ok", text: `Telegram i ${u.email} u ruajt` });
      await load();
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
        <p className="mt-0.5 text-xs text-muted-foreground">Menaxho hyrjet, rolet dhe OLT-të e lejuara — vetëm admin.</p>
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

        {/* OLT scope — only meaningful for non-admins (admins always see all). */}
        {role !== "admin" && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <Label className="flex items-center gap-1.5 text-xs font-semibold">
              <Server className="h-3.5 w-3.5 text-primary" /> OLT-të e lejuara
              <span className="font-normal text-muted-foreground">— zgjidh zonat; bosh = të gjitha</span>
            </Label>
            <div className="mt-2"><OltPicker olts={olts} selected={newOltIds} onToggle={toggleNewOlt} /></div>
            {role === "technician" && (
              <div className="mt-3">
                <Label className="text-xs">Telegram chat id <span className="font-normal text-muted-foreground">— për njoftimet e tiketave (\"ring\")</span></Label>
                <Input value={newTelegram} onChange={(e) => setNewTelegram(e.target.value)} placeholder="p.sh. 123456789" className="mt-1 max-w-xs" />
              </div>
            )}
          </div>
        )}
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
                <th className="px-4 py-2">OLT-të</th>
                <th className="px-4 py-2">Krijuar</th>
                <th className="px-4 py-2 text-right">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = me?.id === u.id;
                const isAdmin = u.role === "admin";
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
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <span className="text-[11px] text-muted-foreground">Të gjitha (admin)</span>
                      ) : (
                        <button
                          onClick={() => setScopeUser(u)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                          title="Ndrysho OLT-të e lejuara"
                        >
                          <Server className="h-3.5 w-3.5" />
                          {u.olts.length === 0 ? "Të gjitha" : u.olts.length === 1 ? u.olts[0].name : `${u.olts.length} OLT`}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("sq-AL")}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="secondary" className="px-2 py-1 text-[11px]" onClick={() => editTelegram(u)} title={u.telegramChatId ? `Telegram: ${u.telegramChatId}` : "Cakto Telegram chat id (njoftime)"}>
                          <Send className={`h-3.5 w-3.5 ${u.telegramChatId ? "text-primary" : ""}`} />
                        </Button>
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
                <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground"><ShieldCheck className="mx-auto mb-1 h-5 w-5" />Asnjë përdorues</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {scopeUser && (
        <ScopeDialog
          user={scopeUser}
          olts={olts}
          onClose={() => setScopeUser(null)}
          onSaved={async (text) => { setScopeUser(null); setMsg({ kind: "ok", text }); await load(); }}
          onError={(text) => setMsg({ kind: "err", text })}
        />
      )}
    </div>
  );
}

function ScopeDialog({
  user,
  olts,
  onClose,
  onSaved,
  onError,
}: {
  user: UserRow;
  olts: OltSummary[];
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(user.olts.map((o) => o.id)));
  const [saving, setSaving] = useState(false);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateUser(user.id, { oltIds: [...selected] });
      await onSaved(selected.size === 0 ? `${user.email}: qasje në të gjitha OLT-të` : `${user.email}: ${selected.size} OLT`);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Server className="h-5 w-5 text-primary" /> OLT-të e lejuara
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{user.email} — zgjidh zonat ku ky përdorues mund të lexojë dhe punojë. Bosh = qasje në të gjitha.</p>
        <div className="my-4"><OltPicker olts={olts} selected={selected} onToggle={toggle} /></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Anulo</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Duke ruajtur…" : "Ruaj"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
