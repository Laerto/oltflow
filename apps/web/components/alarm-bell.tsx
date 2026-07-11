"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type AlarmItem } from "@/lib/api";

const KIND_LABEL: Record<AlarmItem["kind"], string> = {
  olt_offline: "OLT",
  port_outage: "PORT",
  onu_signal: "ONU",
  onu_offline: "OFF",
  onu_expiry: "SKAD",
};

/** Header alarm centre: polls /api/alarms and flashes when something needs attention — the
 * office watches this on the PC all day, so it's more reliable than a phone push for them. */
export function AlarmBell() {
  const [items, setItems] = useState<AlarmItem[]>([]);
  const [critical, setCritical] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .alarms()
        .then((r) => {
          if (!alive) return;
          setItems(r.items);
          setCritical(r.counts.critical);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const count = items.length;
  const flash = critical > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={count ? `${count} alarme aktive` : "Asnjë alarm"}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className={`h-5 w-5 ${flash ? "animate-pulse text-rose-500 motion-reduce:animate-none" : ""}`} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
              {flash && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:hidden" />
              )}
              <span
                className={`relative inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${flash ? "bg-rose-500" : "bg-amber-500"}`}
              >
                {count > 9 ? "9+" : count}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Alarme</span>
          <span className="text-xs text-muted-foreground">
            {critical > 0 ? `${critical} kritike` : count > 0 ? `${count} paralajmërime` : "asnjë"}
          </span>
        </div>
        {count === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">Gjithçka në rregull ✓</div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto py-1">
            {items.map((a) => {
              const dot = a.severity === "critical" ? "bg-rose-500" : "bg-amber-500";
              async function ack(e: React.MouseEvent) {
                e.preventDefault();
                e.stopPropagation();
                try {
                  await api.alarmAction(a.id, "ack");
                  setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, acked: true } : x)));
                } catch {
                  /* ignore */
                }
              }
              async function silence(e: React.MouseEvent) {
                e.preventDefault();
                e.stopPropagation();
                try {
                  await api.alarmAction(a.id, "silence", 60);
                  setItems((prev) => prev.filter((x) => x.id !== a.id));
                  setCritical((c) => Math.max(0, c - (a.severity === "critical" ? 1 : 0)));
                } catch {
                  /* ignore */
                }
              }
              const body = (
                <div className={`flex items-start gap-2.5 px-3 py-2 hover:bg-muted/60 ${a.acked ? "opacity-60" : ""}`}>
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">
                        {KIND_LABEL[a.kind]}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground">{a.title}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{a.detail}</div>
                    <div className="mt-1 flex gap-2">
                      <button type="button" onClick={ack} className="text-[10px] font-medium text-primary hover:underline">
                        {a.acked ? "Acked" : "Ack"}
                      </button>
                      <button type="button" onClick={silence} className="text-[10px] font-medium text-muted-foreground hover:underline">
                        Silence 1h
                      </button>
                      {a.href && (
                        <Link href={a.href} className="text-[10px] font-medium text-muted-foreground hover:underline">
                          Hap
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
              return <div key={a.id}>{body}</div>;
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
