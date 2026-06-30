"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Router, Plug, Settings2, Server, LogOut } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/onus", label: "ONU-të", icon: Router },
  { href: "/unconfigured", label: "Unconfigured", icon: Plug },
  { href: "/provision", label: "Provizionim", icon: Settings2 },
  { href: "/olts", label: "OLT-et", icon: Server },
];

export function AppSidebar({
  onNavigate,
  onLogout,
}: {
  onNavigate?: () => void;
  onLogout?: () => void;
}) {
  const pathname = usePathname();
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
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
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
