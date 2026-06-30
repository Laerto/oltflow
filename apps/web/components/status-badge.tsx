"use client";

import { Wifi, WifiOff, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { stateBadgeColor, stateLabel } from "@/lib/ui-helpers";

export function StatusBadge({ state }: { state: string | null | undefined }) {
  const color = stateBadgeColor(state);
  const label = stateLabel(state);
  const icon = state === "working" ? <Wifi className="h-3 w-3" /> : state ? <WifiOff className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />;
  return (
    <Badge variant={color} className="gap-1">
      {icon} {label}
    </Badge>
  );
}
