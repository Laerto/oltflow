"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { Shield, Check, X, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";

interface PermDef {
  id: string;
  label: string;
  description?: string | null;
  group: string;
}
interface Override {
  perm: string;
  allow: boolean;
}
interface PermUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  overrides: Override[];
}

type CellState = "role" | "grant" | "deny";

function cellState(roleHas: boolean, override?: Override): CellState {
  if (!override) return "role";
  return override.allow ? "grant" : "deny";
}

export default function AdminPermissionsPage() {
  const [catalogue, setCatalogue] = useState<PermDef[]>([]);
  const [groups, setGroups] = useState<{ id: string; label: string }[]>([]);
  const [roleMatrix, setRoleMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [users, setUsers] = useState<PermUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.adminPermissions();
      setCatalogue(data.catalogue);
      setGroups(data.groups);
      setRoleMatrix(data.roleMatrix);
      setUsers(data.users);
      if (!selectedUserId && data.users[0]) setSelectedUserId(String(data.users[0].id));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Gabim");
    }
  }, [selectedUserId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = users.find((u) => String(u.id) === selectedUserId);
  const overrideMap = new Map(selected?.overrides.map((o) => [o.perm, o]) ?? []);

  async function setOverride(perm: string, allow: boolean | null) {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.adminSetPermission({ userId: selected.id, perm, allow });
      setMsg(allow === null ? `Override u hoq për ${perm}` : allow ? `Grant: ${perm}` : `Deny: ${perm}`);
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(false);
    }
  }

  // Cycle: role default → grant → deny → role default
  function cycle(perm: string, roleHas: boolean) {
    const cur = cellState(roleHas, overrideMap.get(perm));
    if (cur === "role") setOverride(perm, roleHas ? false : true); // flip from default
    else if (cur === "grant") setOverride(perm, false);
    else setOverride(perm, null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Shield className="h-4 w-4 text-primary" /> Matrica e lejeve
        </h2>
        <p className="text-xs text-muted-foreground">
          Rreshtat = leje. Kolonat e roleve tregojnë default-in. Zgjidh një përdorues për grant/deny override.
        </p>
      </div>

      {msg && <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{msg}</div>}

      <Card className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Përdorues për override:</span>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="h-8 w-64 text-xs">
              <SelectValue placeholder="Zgjidh…" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.email} ({u.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <span className="text-[11px] text-muted-foreground">
              {selected.overrides.length} override · kliko qelizën e fundit për grant/deny
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <th className="py-2 pr-3">Leja</th>
                <th className="px-2 py-2 text-center">Admin</th>
                <th className="px-2 py-2 text-center">Support</th>
                <th className="px-2 py-2 text-center">Teknik</th>
                <th className="px-2 py-2 text-center">Viewer</th>
                <th className="px-2 py-2 text-center">Override</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.id}>
                  <tr className="bg-muted/40">
                    <td colSpan={6} className="px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </td>
                  </tr>
                  {catalogue
                    .filter((p) => p.group === g.id)
                    .map((p) => {
                      const roleHas = selected ? Boolean(roleMatrix[selected.role]?.[p.id]) : false;
                      const st = selected ? cellState(roleHas, overrideMap.get(p.id)) : "role";
                      return (
                        <tr key={p.id} className="border-b border-border/50">
                          <td className="py-1.5 pr-3">
                            <div className="font-medium">{p.label}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{p.id}</div>
                          </td>
                          {(["admin", "support", "technician", "viewer"] as const).map((role) => (
                            <td key={role} className="px-2 py-1.5 text-center">
                              {roleMatrix[role]?.[p.id] ? (
                                <Check className="mx-auto h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <X className="mx-auto h-3.5 w-3.5 text-slate-300" />
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-center">
                            {selected ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-7 min-w-[72px] text-[10px] ${
                                  st === "grant"
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                                    : st === "deny"
                                      ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
                                      : ""
                                }`}
                                disabled={busy}
                                onClick={() => cycle(p.id, roleHas)}
                                title="Kliko: grant → deny → default"
                              >
                                {st === "grant" ? (
                                  <>
                                    <Check className="mr-1 h-3 w-3" /> Grant
                                  </>
                                ) : st === "deny" ? (
                                  <>
                                    <X className="mr-1 h-3 w-3" /> Deny
                                  </>
                                ) : (
                                  <>
                                    <Minus className="mr-1 h-3 w-3" /> Role
                                  </>
                                )}
                              </Button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
