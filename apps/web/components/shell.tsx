"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Server, Plus } from "lucide-react";
import { useOlts } from "@/app/(app)/providers";
import { api, ApiError, pollJob } from "@/lib/api";
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
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { OltSelector } from "./olt-selector";

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { olts, currentOlt, setCurrentOltId, refresh } = useOlts();
  const [addOpen, setAddOpen] = useState(false);

  async function logout() {
    await api.logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <AppSidebar onLogout={logout} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <MobileNav onLogout={logout} />
            <span className="text-sm font-semibold lg:hidden">OLTFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <OltSelector olts={olts} current={currentOlt} onChange={setCurrentOltId} />
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Shto OLT
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
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
  const [protocol, setProtocol] = useState<"telnet" | "ssh">("telnet");
  const [port, setPort] = useState("23");
  const [location, setLocation] = useState("");
  const [slots, setSlots] = useState("4,15,17,19,20");
  const [eponSlots, setEponSlots] = useState("");
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
        protocol,
        port: Number(port) || (protocol === "ssh" ? 22 : 23),
        location,
        slots: parseSlots(slots),
        eponSlots: parseSlots(eponSlots),
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
            <DialogTitle className="flex items-center gap-2">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="protocol">Protokolli</Label>
                <select
                  id="protocol"
                  value={protocol}
                  onChange={(e) => {
                    const p = e.target.value as "telnet" | "ssh";
                    setProtocol(p);
                    setPort((cur) => (cur === "23" || cur === "22" ? (p === "ssh" ? "22" : "23") : cur));
                  }}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="telnet">Telnet</option>
                  <option value="ssh">SSH</option>
                </select>
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
            </div>

            <p className="text-[11px] text-muted-foreground">
              Numrat e slot-eve ku janë instaluar kartat GPON/EPON në këtë OLT (jo çdo OLT i ka të njëjtët) — kontrollo me{" "}
              <code className="rounded bg-muted px-1">show card</code> në CLI nëse nuk je i sigurt. Lëre bosh fushën EPON nëse OLT nuk ka karta EPON.
            </p>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                {success}
              </div>
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
