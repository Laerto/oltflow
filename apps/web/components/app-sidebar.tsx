"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Router, Plug, Settings2, Server, LogOut, Users, ShieldCheck, Wrench, Map as MapIcon } from "lucide-react";
import { useOlts, useMe } from "@/app/(app)/providers";
import { api } from "@/lib/api";
import { roleRank, ROLE_LABELS, type Role } from "@/lib/permissions";

// minTier: 1=view (all), 2=operate (support+admin), 3=admin. Items above the user's tier are hidden.
const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, minTier: 1 },
  { href: "/onus", label: "ONU", icon: Router, minTier: 1 },
  { href: "/map", label: "Harta", icon: MapIcon, minTier: 1 },
  { href: "/tickets", label: "Defektet", icon: Wrench, minTier: 1 },
  { href: "/unconfigured", label: "Unconfigured", icon: Plug, minTier: 1 },
  { href: "/provision", label: "Provizionim", icon: Settings2, minTier: 2 },
  { href: "/olts", label: "OLT", icon: Server, minTier: 1 },
  { href: "/users", label: "Përdoruesit", icon: Users, minTier: 3 },
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
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300">
      <div className="flex h-16 items-center gap-3 px-4 border-b border-white/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
          <Server className="h-[18px] w-[18px]" />
        </div>
        <div className="flex flex-col">
          <span className="text-[17px] font-extrabold tracking-tight leading-tight text-white">
            <span className="text-blue-400">OLT</span>Flow
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Enterprise NOC</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2.5 py-4">
        {NAV.filter((item) => rank >= item.minTier).map((item) => {
          const active = pathname === item.href;
          const badge = item.href === "/unconfigured" && waiting > 0 ? waiting : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200 ${
                active
                  ? "bg-blue-500/10 text-white"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-400" />
              )}
              <item.icon
                className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                  active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                }`}
              />
              <span className="flex-1">{item.label}</span>
              {badge !== null && (
                <span className="grid min-w-5 place-items-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-950">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/5 p-2.5">
        {me && (
          <div className="mb-1.5 flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-400" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-100">{me.name || me.email}</div>
              <div className="text-[10px] text-slate-500">{ROLE_LABELS[me.role as Role] ?? me.role}</div>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-[18px] w-[18px]" /> Dilni
        </button>
      </div>
    </div>
  );
}
