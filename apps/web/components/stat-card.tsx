"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  href,
  icon: Icon,
  label,
  value,
  sub,
  gradient,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
  sub?: string;
  gradient: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className={`relative flex h-full flex-col justify-center overflow-hidden border-0 bg-gradient-to-br ${gradient} px-4 py-3 text-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20`}>
        <Icon className="absolute right-3 top-1/2 h-12 w-12 -translate-y-1/2 opacity-20" />
        <div className="relative z-10 text-2xl font-bold leading-none tracking-tight">{value}</div>
        <div className="relative z-10 mt-1 text-sm font-medium opacity-90">{label}</div>
        {/* Reserve the sub line even when empty so every card is the same height */}
        <div className="relative z-10 mt-1 min-h-[1rem] text-xs opacity-70">{sub ?? ""}</div>
      </Card>
    </Link>
  );
}
