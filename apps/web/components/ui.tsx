"use client";

import { type ReactNode } from "react";

const BADGE_COLORS: Record<string, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Badge({ color = "gray", children }: { color?: keyof typeof BADGE_COLORS; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${BADGE_COLORS[color]}`}>
      {children}
    </span>
  );
}

export function stateBadgeColor(state: string | null | undefined): keyof typeof BADGE_COLORS {
  if (state === "working") return "green";
  if (!state) return "gray";
  return "red";
}

/** Display label for the raw ZTE CLI state — "working" reads as device jargon,
 * show it as "online" everywhere in the UI while keeping the underlying stored
 * value ("working") unchanged, since filters/queries match against that. */
export function stateLabel(state: string | null | undefined): string {
  if (state === "working") return "online";
  return state || "–";
}

export function SignalPill({ rx }: { rx: number | null | undefined }) {
  if (rx === null || rx === undefined) {
    return <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-400">N/A</span>;
  }
  const level = rx >= -25 ? "good" : rx >= -27 ? "warn" : "crit";
  const styles =
    level === "good"
      ? "bg-green-50 border-green-200 text-green-700"
      : level === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-red-50 border-red-200 text-red-700";
  const icon = level === "good" ? "🟢" : level === "warn" ? "🟡" : "🔴";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] font-semibold ${styles}`}>
      {icon} {rx} dBm
    </span>
  );
}

export function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "h-6 w-6 border-[3px]" : "h-3.5 w-3.5 border-2";
  return <span className={`inline-block ${cls} animate-spin rounded-full border-current border-t-transparent text-slate-400`} />;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">{title}</span>
          {action}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon = "📭", children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-slate-500">
      <div className="text-4xl">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

export function Alert({ kind, children }: { kind: "ok" | "err" | "load" | "warn"; children: ReactNode }) {
  const styles = {
    ok: "bg-green-50 border-green-200 text-green-700",
    err: "bg-red-50 border-red-200 text-red-700",
    load: "bg-blue-50 border-blue-200 text-blue-700",
    warn: "bg-amber-50 border-amber-200 text-amber-700",
  }[kind];
  const icon = { ok: "✓", err: "⚠", load: "", warn: "⚠" }[kind];
  return (
    <div className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${styles}`}>
      {kind === "load" ? <Spinner /> : icon}
      <span>{children}</span>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-5 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: { variant?: "primary" | "secondary" | "danger" | "success" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700",
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
