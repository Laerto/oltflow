"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Server, Plus, MapPin } from "lucide-react";
import { useOlts, useMe } from "@/app/(app)/providers";
import { api, ApiError, pollJob } from "@/lib/api";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { OltSelector } from "./olt-selector";

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { olts, currentOlt, allOlts, setCurrentOltId, refresh } = useOlts();
  const me = useMe();
  const [addOpen, setAddOpen] = useState(false);

  async function logout() {
    await api.logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col lg:flex">
        <AppSidebar onLogout={logout} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card/80 px-3 backdrop-blur sm:gap-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <MobileNav onLogout={logout} />
            <span className="text-sm font-semibold lg:hidden">OLTFlow</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <OltSelector olts={olts} current={currentOlt} allOlts={allOlts} onChange={setCurrentOltId} />
            {can.admin(me?.role) && (
              <Button size="sm" className="shrink-0" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Shto OLT</span>
              </Button>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-clip p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
      <AddOltModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={refresh} />
    </div>
  );
}

function AddOltModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [username, setUsername] = useState("zte");
  const [password, setPassword] = useState("");
  const [enablePassword, setEnablePassword] = useState("");
  const [protocol, setProtocol] = useState<"telnet" | "ssh">("telnet");
  const [port, setPort] = useState("23");
  const [location, setLocation] = useState("");
  const [slots, setSlots] = useState("4,15,17,19,20");
  const [eponSlots, setEponSlots] = useState("");
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.createOlt({
        name,
        ip,
        username,
        password,
        enablePassword: enablePassword || undefined,
        protocol,
        port: Number(port) || (protocol === "ssh" ? 22 : 23),
        location,
        slots: parseSlots(slots),
        eponSlots: parseSlots(eponSlots),
        snmpCommunity: snmpCommunity.trim() || "public",
        latitude: lat.trim() ? Number(lat) : null,
        longitude: lng.trim() ? Number(lng) : null,
      });
      setSuccess("OLT u shtua, duke testuar lidhjen...");
      await onCreated();
      pollJob(jobId).then((job) => {
        if (job.status === "done") setSuccess(`OLT "${name}" u shtua! Lidhja u verifikua.`);
        else setSuccess(`OLT "${name}" u shtua, por lidhja dështoi: ${job.error}`);
        onCreated();
      });
      setTimeout(() => {
        onClose();
        setName("");
        setIp("");
        setPassword("");
        setEnablePassword("");
        setSuccess(null);
      }, 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Server className="h-5 w-5 text-primary" /> Shto OLT të ri
            </DialogTitle>
            <DialogDescription>Plotësoni të dhënat për të shtuar një OLT të ri në sistem.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Emri *</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="BORSH"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip">IP Adresa *</Label>
                <Input
                  id="ip"
                  required
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="172.33.55.50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="enablePassword">Enable / Privileged password (opsionale)</Label>
              <Input id="enablePassword" type="password" value={enablePassword} onChange={(e) => setEnablePassword(e.target.value)} placeholder="vetëm nëse OLT kërkon 'enable' password" />
              <p className="text-[11px] text-muted-foreground">
                Disa OLT (p.sh. C320 me SSH) hyjnë në modalitet user (<code className="rounded bg-muted px-1">&gt;</code>) dhe kërkojnë <code className="rounded bg-muted px-1">enable</code> + këtë password. Lëre bosh nëse është njësoj me password-in e hyrjes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="protocol">Protokolli</Label>
                <Select
                  value={protocol}
                  onValueChange={(v) => {
                    const p = v as "telnet" | "ssh";
                    setProtocol(p);
                    setPort((cur) => (cur === "23" || cur === "22" ? (p === "ssh" ? "22" : "23") : cur));
                  }}
                >
                  <SelectTrigger id="protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="telnet">Telnet</SelectItem>
                    <SelectItem value="ssh">SSH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="location">Lokacioni</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Sarandë, Shqipëri"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slots">Slot-et GPON (GTGH)</Label>
                <Input
                  id="slots"
                  value={slots}
                  onChange={(e) => setSlots(e.target.value)}
                  placeholder="4,15,17,19,20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eponSlots">Slot-et EPON (ETTO) — opsionale</Label>
                <Input
                  id="eponSlots"
                  value={eponSlots}
                  onChange={(e) => setEponSlots(e.target.value)}
                  placeholder="9,14"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snmpCommunity">SNMP Community</Label>
                <Input
                  id="snmpCommunity"
                  value={snmpCommunity}
                  onChange={(e) => setSnmpCommunity(e.target.value)}
                  placeholder="public"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Vendndodhja (harta) — opsionale</Label>
              <div className="flex gap-2">
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat (40.0587)" />
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="lng (19.9819)" />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); },
                      () => setError("S'u mor vendndodhja — lejo GPS-in."),
                    )
                  }
                  title="Përdor vendndodhjen time"
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Numrat e slot-eve ku janë instaluar kartat GPON/EPON në këtë OLT (jo çdo OLT i ka të njëjtët) — kontrollo me{" "}
              <code className="rounded bg-muted px-1">show card</code> në CLI nëse nuk je i sigurt. Lëre bosh fushën EPON nëse OLT nuk ka karta EPON.
            </p>

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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anulo
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Duke shtuar..." : "Shto OLT"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function parseSlots(value: string): number[] {
  return value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
