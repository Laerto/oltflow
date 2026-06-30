"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { api, ApiError, type OltSummary } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseSlots } from "@/components/shell";

export function EditOltModal({
  open,
  onClose,
  olt,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  olt: OltSummary;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(olt.name);
  const [ip, setIp] = useState(olt.ip);
  const [username, setUsername] = useState(olt.username);
  const [password, setPassword] = useState("");
  const [protocol, setProtocol] = useState<"telnet" | "ssh">(olt.protocol === "ssh" ? "ssh" : "telnet");
  const [port, setPort] = useState(String(olt.port));
  const [location, setLocation] = useState(olt.location ?? "");
  const [slots, setSlots] = useState(olt.slots.join(","));
  const [eponSlots, setEponSlots] = useState(olt.eponSlots.join(","));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.updateOlt(olt.id, {
        name,
        ip,
        username,
        ...(password ? { password } : {}),
        protocol,
        port: Number(port) || olt.port,
        location,
        slots: parseSlots(slots),
        eponSlots: parseSlots(eponSlots),
      });
      setSuccess("U ruajt — sinkronizimi i ardhshëm do përdorë slot-et e reja (deri në 60s).");
      await onSaved();
      setTimeout(() => {
        onClose();
        setSuccess(null);
        setPassword("");
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Pencil className="h-5 w-5 text-primary" /> Modifiko OLT — {olt.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Emri *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">IP Adresa *</Label>
              <Input required value={ip} onChange={(e) => setIp(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Password (lër bosh për ta ruajtur)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Protokolli</Label>
              <Select value={protocol} onValueChange={(v) => setProtocol(v as "telnet" | "ssh")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telnet">Telnet</SelectItem>
                  <SelectItem value="ssh">SSH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Port</Label>
              <Input value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Lokacioni</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Slot-et GPON (GTGH)</Label>
              <Input value={slots} onChange={(e) => setSlots(e.target.value)} placeholder="4,15,17,19,20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Slot-et EPON (ETTO) — opsionale</Label>
              <Input value={eponSlots} onChange={(e) => setEponSlots(e.target.value)} placeholder="9,14" />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Anulo
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Duke ruajtur..." : "Ruaj"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
