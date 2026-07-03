"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Router, Plug, Settings2, Server, LogOut, Users, ShieldCheck } from "lucide-react";
import { useOlts, useMe } from "@/app/(app)/providers";
import { api } from "@/lib/api";
import { roleRank, ROLE_LABELS, type Role } from "@/lib/permissions";

// minTier: 1=view (all), 2=operate (support+admin), 3=admin. Items above the user's tier are hidden.
const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, minTier: 1 },
  { href: "/onus", label: "ONU-të", icon: Router, minTier: 1 },
  { href: "/unconfigured", label: "Unconfigured", icon: Plug, minTier: 1 },
  { href: "/provision", label: "Provizionim", icon: Settings2, minTier: 2 },
  { href: "/olts", label: "OLT-et", icon: Server, minTier: 1 },
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
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Server className="h-5 w-5" />
        </div>
        <span className="text-lg font-extrabold tracking-tight">
          <span className="text-primary">OLT</span>Flow
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.filter((item) => rank >= item.minTier).map((item) => {
          const active = pathname === item.href;
          const badge = item.href === "/unconfigured" && waiting > 0 ? waiting : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {badge !== null && (
                <span className="grid min-w-5 place-items-center rounded-full bg-warning px-1.5 text-[11px] font-bold text-black">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        {me && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">{me.name || me.email}</div>
              <div className="text-[10px] text-muted-foreground">{ROLE_LABELS[me.role as Role] ?? me.role}</div>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Dilni
        </button>
      </div>
    </div>
  );
}
