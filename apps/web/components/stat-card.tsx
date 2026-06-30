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
    <Link href={href}>
      <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${gradient} p-5 text-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20`}>
        <Icon className="absolute right-4 top-1/2 h-16 w-16 -translate-y-1/2 opacity-20" />
        <div className="relative z-10 text-3xl font-bold tracking-tight">{value}</div>
        <div className="relative z-10 mt-1 text-sm font-medium opacity-90">{label}</div>
        {sub && <div className="relative z-10 mt-1.5 text-xs opacity-70">{sub}</div>}
      </Card>
    </Link>
  );
}
