"use client";

import { Server } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type OltSummary } from "@/lib/api";

export function OltSelector({
  olts,
  current,
  onChange,
}: {
  olts: OltSummary[];
  current: OltSummary | null;
  onChange: (id: number) => void;
}) {
  return (
    <Select value={current?.id ? String(current.id) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-[132px] min-w-0 gap-2 text-xs sm:w-[180px] lg:w-[220px]">
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="Zgjidh OLT" />
      </SelectTrigger>
      <SelectContent>
        {olts.map((olt) => (
          <SelectItem key={olt.id} value={String(olt.id)} className="text-xs">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${olt.status === "online" ? "bg-emerald-500" : olt.status === "offline" ? "bg-rose-500" : "bg-muted-foreground"}`} />
              {olt.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
