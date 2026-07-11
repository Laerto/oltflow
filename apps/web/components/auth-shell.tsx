import Link from "next/link";
import { Server } from "lucide-react";
import type { ReactNode } from "react";

/** Shared chrome for login / signup / forgot / reset — matches landing dark theme. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <Server className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-extrabold tracking-tight">
            <span className="text-blue-400">OLT</span>Flow
          </span>
        </Link>
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← Kreu
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            {children}
          </div>
          {footer && <div className="mt-4 text-center text-xs text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
