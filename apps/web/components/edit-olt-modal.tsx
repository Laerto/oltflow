"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, type OltSummary } from "@/lib/api";
import { Modal, Field, inputClass, Button, Alert } from "@/components/ui";
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
    <Modal open={open} onClose={onClose} title={`✏ Modifiko OLT — ${olt.name}`}>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Emri *">
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="IP Adresa *">
            <input required value={ip} onChange={(e) => setIp(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Password (lër bosh për ta ruajtur)">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Protokolli">
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as "telnet" | "ssh")} className={inputClass}>
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
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
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

        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anulo
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Duke ruajtur..." : "✔ Ruaj"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
