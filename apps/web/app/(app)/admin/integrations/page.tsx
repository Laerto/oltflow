"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plug,
  MessageCircle,
  Mail,
  Webhook,
  Radio,
  Database,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

interface IntegrationCard {
  id: string;
  label: string;
  description: string;
  group: string;
  enabled: boolean;
  status: string | null;
  statusDetail: string | null;
  fromEnvFallback: boolean;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  telegram: MessageCircle,
  whatsapp: MessageCircle,
  smtp: Mail,
  webhook: Webhook,
  genieacs: Radio,
  radius: Database,
  winbox: Terminal,
};

function StatusBadge({ status, enabled }: { status: string | null; enabled: boolean }) {
  if (!enabled) return <Badge variant="outline" className="text-muted-foreground">off</Badge>;
  if (status === "ok")
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> connected
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="outline" className="border-rose-500/30 text-rose-600">
        <XCircle className="mr-1 h-3 w-3" /> error
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-amber-500/30 text-amber-600">
      <AlertCircle className="mr-1 h-3 w-3" /> {status ?? "unknown"}
    </Badge>
  );
}

export default function IntegrationsHubPage() {
  const [items, setItems] = useState<IntegrationCard[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminIntegrations();
      setItems(data.integrations);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notify = items.filter((i) => i.group === "notify");
  const device = items.filter((i) => i.group === "device");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plug className="h-4 w-4 text-primary" /> Integrime
          </h2>
          <p className="text-xs text-muted-foreground">
            Konfiguro kanalet e njoftimeve dhe shërbimet e jashtme. Secret-et ruhen të enkriptuara.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/integrations/rules">Rregullat e njoftimeve</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/integrations/logs">Delivery log</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/integrations/maintenance">Maintenance</Link>
          </Button>
        </div>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      {[
        { title: "Njoftime", list: notify },
        { title: "Pajisje / shërbime", list: device },
      ].map((section) => (
        <div key={section.title}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.list.map((i) => {
              const Icon = ICONS[i.id] ?? Plug;
              return (
                <Link key={i.id} href={`/admin/integrations/${i.id}`}>
                  <Card className="h-full transition hover:bg-muted/40">
                    <CardContent className="flex gap-3 p-4">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{i.label}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{i.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={i.status} enabled={i.enabled} />
                          {i.fromEnvFallback && (
                            <Badge variant="outline" className="text-[9px]">
                              env fallback
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
