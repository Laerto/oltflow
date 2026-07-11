"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Router,
  Plug,
  Settings2,
  Server,
  LogOut,
  ShieldCheck,
  Wrench,
  Map as MapIcon,
  Shield,
  Radio,
} from "lucide-react";
import { useOlts, useMe } from "@/app/(app)/providers";
import { api } from "@/lib/api";
import { roleRank, ROLE_LABELS, type Role } from "@/lib/permissions";

// minTier: 1=view (all), 2=operate (support+admin), 3=admin. Items above the user's tier are hidden.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minTier: 1 },
  { href: "/onus", label: "ONU", icon: Router, minTier: 1 },
  { href: "/cpe", label: "CPE", icon: Radio, minTier: 1 },
  { href: "/map", label: "Harta", icon: MapIcon, minTier: 1 },
  { href: "/tickets", label: "Defektet", icon: Wrench, minTier: 1 },
  { href: "/unconfigured", label: "Unconfigured", icon: Plug, minTier: 1 },
  { href: "/provision", label: "Provizionim", icon: Settings2, minTier: 2 },
  { href: "/olts", label: "OLT", icon: Server, minTier: 1 },
  { href: "/admin", label: "Admin", icon: Shield, minTier: 3 },
];

export function AppSidebar({
  onNavigate,
  onLogout,
}: {
  onNavigate?: () => void;
  onLogout?: () => void;
}) {
  const pathname = usePathname();
  const { currentOlt } = useOlts();
  const me = useMe();
  const rank = roleRank(me?.role);
  const [waiting, setWaiting] = useState(0);

  const loadWaiting = useCallback(async () => {
    if (!currentOlt) return setWaiting(0);
    try {
      const { total } = await api.unconfigured(currentOlt.id);
      setWaiting(total);
    } catch {
      /* keep last */
    }
  }, [currentOlt]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWaiting();
    const id = setInterval(loadWaiting, 30_000);
    return () => clearInterval(id);
  }, [loadWaiting]);

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-300">
      {/* Brand */}
      <div className="relative flex h-[4.25rem] items-center gap-3 overflow-hidden border-b border-white/[0.06] px-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.18),transparent_55%)]" />
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/15">
          <Server className="h-[18px] w-[18px]" />
        </div>
        <div className="relative flex flex-col">
          <span className="text-[17px] font-extrabold tracking-tight leading-none text-white">
            <span className="text-blue-400">OLT</span>Flow
          </span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Enterprise NOC
          </span>
        </div>
      </div>

      {/* Nav section label */}
      <div className="px-4 pb-1 pt-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
          Navigation
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
        {NAV.filter((item) => rank >= item.minTier).map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard" || pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const badge = item.href === "/unconfigured" && waiting > 0 ? waiting : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-all duration-200 ${
                active
                  ? "bg-blue-500/15 text-white shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.7)]" />
              )}
              <item.icon
                className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                  active ? "text-blue-400" : "text-slate-600 group-hover:text-slate-400"
                }`}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {badge !== null && (
                <span className="grid min-w-5 place-items-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-slate-950 shadow-sm shadow-amber-400/30">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/[0.06] p-2.5">
        {me && (
          <div className="mb-1.5 flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 ring-1 ring-blue-400/20">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-100">
                {me.name || me.email}
              </div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {ROLE_LABELS[me.role as Role] ?? me.role}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-[17px] w-[17px]" />
          Dilni
        </button>
      </div>
    </div>
  );
}
