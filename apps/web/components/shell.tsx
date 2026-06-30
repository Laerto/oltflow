"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOlts } from "@/app/(app)/providers";
import { api, ApiError, pollJob } from "@/lib/api";
import { Modal, Field, inputClass, Button, Alert } from "@/components/ui";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/onus", label: "ONU-të" },
  { href: "/unconfigured", label: "Unconfigured" },
  { href: "/provision", label: "Provizionim" },
  { href: "/olts", label: "OLT-et" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { olts, currentOlt, setCurrentOltId, refresh } = useOlts();
  const [addOpen, setAddOpen] = useState(false);

  async function logout() {
    await api.logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 flex h-[54px] items-center gap-1 bg-slate-900 px-6">
        <Link href="/" className="mr-8 text-[17px] font-extrabold tracking-tight text-white">
          <span className="text-blue-400">neWave</span> OLT
        </Link>
        <div className="flex flex-1 gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                pathname === item.href ? "bg-white/10 text-blue-400" : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <button onClick={logout} className="text-[13px] text-slate-400 hover:text-white">
          Dilni →
        </button>
      </nav>

      <div className="flex h-10 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-6">
        <span className="flex-shrink-0 text-[11px] font-semibold text-slate-400">OLT:</span>
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
          {olts.length === 0 && <span className="text-xs text-slate-400">Asnjë OLT</span>}
          {olts.map((olt) => (
            <button
              key={olt.id}
              onClick={() => setCurrentOltId(olt.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                currentOlt?.id === olt.id
                  ? "border-blue-200 bg-blue-50 text-blue-700 font-semibold"
                  : "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${olt.status === "online" ? "bg-green-500" : olt.status === "offline" ? "bg-red-500" : "bg-slate-300"}`} />
              {olt.name}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} className="flex-shrink-0">
          + Shto OLT
        </Button>
      </div>

      <div className="mx-auto max-w-[1400px] px-5 py-6">{children}</div>

      <AddOltModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={refresh} />
    </div>
  );
}

function AddOltModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
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
    <Modal open={open} onClose={onClose} title="🔌 Shto OLT të ri">
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Emri *">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="BORSH" className={inputClass} />
          </Field>
          <Field label="IP Adresa *">
            <input required value={ip} onChange={(e) => setIp(e.target.value)} placeholder="172.33.55.50" className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Protokolli">
            <select
              value={protocol}
              onChange={(e) => {
                const p = e.target.value as "telnet" | "ssh";
                setProtocol(p);
                setPort((cur) => (cur === "23" || cur === "22" ? (p === "ssh" ? "22" : "23") : cur));
              }}
              className={inputClass}
            >
              <option value="telnet">Telnet</option>
              <option value="ssh">SSH</option>
            </select>
          </Field>
          <Field label="Port">
            <input value={port} onChange={(e) => setPort(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lokacioni">
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sarandë, Shqipëri" className={inputClass} />
          </Field>
          <Field label="Slot-et GPON (GTGH)">
            <input value={slots} onChange={(e) => setSlots(e.target.value)} placeholder="4,15,17,19,20" className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slot-et EPON (ETTO) — opsionale">
            <input value={eponSlots} onChange={(e) => setEponSlots(e.target.value)} placeholder="9,14" className={inputClass} />
          </Field>
        </div>
        <div className="mb-2 text-[11px] text-slate-400">
          Numrat e slot-eve ku janë instaluar kartat GPON/EPON në këtë OLT (jo çdo OLT i ka të njëjtët) — kontrollo me{" "}
          <code className="rounded bg-slate-100 px-1">show card</code> në CLI nëse nuk je i sigurt. Lëre bosh fushën EPON nëse OLT nuk ka karta EPON.
        </div>

        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anulo
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Duke shtuar..." : "✔ Shto OLT"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function parseSlots(value: string): number[] {
  return value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
