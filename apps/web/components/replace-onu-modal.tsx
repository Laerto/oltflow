"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, pollJob } from "@/lib/api";
import { Modal, Field, inputClass, Button, Alert } from "@/components/ui";
import { ONU_TYPES } from "@oltflow/core";

export function ReplaceOnuModal({
  open,
  onClose,
  onuId,
  ponPort,
  currentSerial,
  currentType,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onuId: number;
  ponPort: string;
  currentSerial: string | null;
  currentType: string | null;
  onDone?: () => void;
}) {
  const [onuSerial, setOnuSerial] = useState("");
  const [onuType, setOnuType] = useState<string>(currentType ?? "F660");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !confirm(
        `Të zëvendësohet ONU në portin ${ponPort.replace("gpon-onu_", "")}?\nSN i vjetër: ${currentSerial || "–"}\nSN i ri: ${onuSerial}\n\nProfili/VLAN/PPPoE ekzistues mbeten të pandryshuara.`
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { jobId } = await api.replaceOnu(onuId, { onuSerial, onuType });
      setSuccess("Duke rilidhur ONU-në në OLT...");
      const job = await pollJob(jobId, { timeoutMs: 60000 });
      if (job.status === "failed") throw new Error(job.error ?? "Dështoi");
      setSuccess((job.output as { message?: string })?.message ?? "ONU u zëvendësua");
      onDone?.();
      setTimeout(() => {
        onClose();
        setSuccess(null);
        setOnuSerial("");
      }, 1800);
    } catch (err) {
      setSuccess(null);
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<>🔁 Zëvendëso ONU (SN i ri)</>}>
      <form onSubmit={onSubmit}>
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          ⚠ Përdore kur klientit i ndërrohet vetë pajisja (ONU/router). Porti, VLAN-i,
          profili dhe kredencialet PPPoE mbeten të njëjta — ndryshohet vetëm serial
          number-i (dhe tipi, nëse pajisja e re është model tjetër).
        </div>

        <Field label="Porti">
          <input disabled value={ponPort.replace("gpon-onu_", "")} className={`${inputClass} bg-slate-50 text-slate-500`} />
        </Field>
        <Field label="SN aktual">
          <input disabled value={currentSerial || "–"} className={`${inputClass} bg-slate-50 text-slate-500`} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SN i ri *">
            <input required value={onuSerial} onChange={(e) => setOnuSerial(e.target.value)} placeholder="ZTEGCxxxxxxx" className={inputClass} />
          </Field>
          <Field label="Tipi ONU">
            <select value={onuType} onChange={(e) => setOnuType(e.target.value)} className={inputClass}>
              {ONU_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>

        {error && <Alert kind="err">{error}</Alert>}
        {success && <Alert kind="ok">{success}</Alert>}

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anulo
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Duke procesuar..." : "🔁 Zëvendëso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
