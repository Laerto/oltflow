"use client";

import { Server, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type OltSummary } from "@/lib/api";
import { ALL_OLTS_ID } from "@/app/(app)/providers";

export function OltSelector({
  olts,
  current,
  allOlts,
  onChange,
}: {
  olts: OltSummary[];
  current: OltSummary | null;
  allOlts: boolean;
  onChange: (id: number) => void;
}) {
  const value = allOlts ? String(ALL_OLTS_ID) : current?.id ? String(current.id) : undefined;
  return (
    <Select value={value} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-[180px] gap-2 text-xs lg:w-[220px]">
        {allOlts ? <Layers className="h-3.5 w-3.5 text-primary" /> : <Server className="h-3.5 w-3.5 text-muted-foreground" />}
        <SelectValue placeholder="Zgjidh OLT" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={String(ALL_OLTS_ID)} className="text-xs">
          <span className="flex items-center gap-2 font-semibold">
            <Layers className="h-3.5 w-3.5 text-primary" /> Të gjitha OLT-të
          </span>
        </SelectItem>
        <SelectSeparator />
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
