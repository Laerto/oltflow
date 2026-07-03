"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/** One labelled segment in a stat card's footer strip, e.g. `PwrFail: 0`. */
export interface StatFooterItem {
  label: string;
  value: number | string;
}

export function StatCard({
  href,
  icon: Icon,
  label,
  value,
  footer,
  gradient,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
  /** Breakdown shown in the bottom strip; spread across the width like the NOC view. */
  footer?: StatFooterItem[];
  gradient: string;
}) {
  // Extract shadow glow colors based on the gradient
  const shadowMap: Record<string, string> = {
    "from-blue-600 to-blue-800": "hover:shadow-blue-500/40",
    "from-emerald-600 to-emerald-800": "hover:shadow-emerald-500/40",
    "from-slate-700 to-slate-900": "hover:shadow-slate-500/40",
    "from-amber-600 to-amber-800": "hover:shadow-amber-500/40",
  };

  const shadow = shadowMap[gradient] || "hover:shadow-primary/40";

  // The white footer strip (SmartOLT style) tints its text with the card's own colour so
  // the breakdown reads clearly against the light band.
  const footerTextMap: Record<string, string> = {
    "from-blue-600 to-blue-800": "text-blue-700",
    "from-emerald-600 to-emerald-800": "text-emerald-700",
    "from-slate-700 to-slate-900": "text-slate-700",
    "from-amber-600 to-amber-800": "text-amber-600",
  };
  const footerText = footerTextMap[gradient] || "text-foreground";

  return (
    <Link href={href} className="block h-full outline-none ring-0 group">
      <Card className={`relative flex h-full flex-col overflow-hidden border-0 bg-gradient-to-br ${gradient} text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${shadow}`}>
        <div className="relative flex-1 px-5 py-4">
          <Icon className="absolute -right-2 top-1/2 h-20 w-20 -translate-y-1/2 opacity-15 transition-all duration-500 group-hover:scale-110 group-hover:opacity-25" />
          <div className="relative z-10 text-sm font-bold tracking-wide text-white/90 uppercase">{label}</div>
          <div className="relative z-10 mt-1 text-4xl font-extrabold leading-tight tracking-tight drop-shadow-md">{value}</div>
        </div>
        {footer && footer.length > 0 && (
          <div className={`relative z-10 flex items-center justify-between gap-2 bg-white px-5 py-2 text-xs font-semibold ${footerText}`}>
            {footer.map((f) => (
              <span key={f.label} className="whitespace-nowrap">
                {f.label}: <span className="font-bold">{f.value}</span>
              </span>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
