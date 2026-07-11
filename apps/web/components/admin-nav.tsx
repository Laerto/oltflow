"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Shield,
  ScrollText,
  ListTodo,
  Settings,
  FileText,
  MonitorSmartphone,
  ArrowLeft,
  Plug,
  HardDrive,
} from "lucide-react";

const ADMIN_NAV = [
  { href: "/admin", label: "Përmbledhje", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Përdoruesit", icon: Users },
  { href: "/admin/permissions", label: "Lejet", icon: Shield },
  { href: "/admin/integrations", label: "Integrime", icon: Plug },
  { href: "/admin/backup", label: "Backup", icon: HardDrive },
  { href: "/admin/sessions", label: "Sesionet", icon: MonitorSmartphone },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
  { href: "/admin/jobs", label: "Jobs", icon: ListTodo },
  { href: "/admin/logs", label: "Logjet", icon: FileText },
  { href: "/admin/settings", label: "Cilësimet", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
              <Shield className="h-3.5 w-3.5" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Control Plane
            </p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Admin
          </h1>
          <p className="max-w-xl text-xs text-muted-foreground">
            Menaxhim sistemi · leje · integrime · audit · backup · cilësime
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kthehu te NOC
        </Link>
      </div>

      {/* Tab nav */}
      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card/80 p-1.5 shadow-sm backdrop-blur">
        {ADMIN_NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-all ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className={`h-3.5 w-3.5 ${active ? "opacity-95" : "opacity-70"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
