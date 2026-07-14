"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Server } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { OltShelf } from "@/components/olt-shelf";
import { OltHealthCard } from "@/components/olt-health-card";
import { useOlts } from "../../providers";

// Keep recharts out of the initial per-OLT bundle — the PON chart streams its own chunk.
const PonTrafficCard = dynamic(
  () => import("@/components/pon-traffic-card").then((m) => m.PonTrafficCard),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);

/** Specialised per-OLT detail page: the heavier per-PON bandwidth chart and card/port map
 * live here so the main dashboard can stay focused on health + fleet status. */
export default function OltDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const oltId = Number(id);
  const router = useRouter();
  const { olts, loading, currentOlt, setCurrentOltId } = useOlts();
  const olt = olts.find((o) => o.id === oltId) ?? null;

  // Keep the global OLT selector in sync so the sidebar/header reflect this OLT.
  useEffect(() => {
    if (olt) setCurrentOltId(olt.id);
  }, [olt, setCurrentOltId]);

  // Follow the header OLT selector: once the selector has matched this page's OLT (in sync), a
  // later change means the operator picked a different OLT → navigate to its detail page. The
  // `inSync` guard prevents a wrong redirect on mount when the persisted selection differs from
  // the URL (that first pass syncs instead of navigating).
  const inSync = useRef(false);
  useEffect(() => {
    const curId = currentOlt?.id ?? null;
    if (curId === oltId) inSync.current = true;
    else if (inSync.current && curId != null) router.push(`/olts/${curId}`);
  }, [currentOlt, oltId, router]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!olt) {
    return (
      <Card>
        <EmptyState>
          Ky OLT nuk u gjet — kthehu te <Link href="/olts" className="text-primary underline">lista e OLT-eve</Link>.
        </EmptyState>
      </Card>
    );
  }

  return (
    // key by OLT id: switching OLT fully remounts the cards, guaranteeing fresh data (belt-and-
    // suspenders on top of the per-card oltId refetch).
    <div key={olt.id}>
      <div className="mb-5">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <Server className="h-5 w-5 text-primary" /> {olt.name}
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {olt.ip} · {olt.location || "–"}
        </p>
      </div>

      <div className="mb-5">
        <PonTrafficCard oltId={olt.id} />
      </div>

      <div className="mb-5">
        <OltHealthCard oltId={olt.id} />
      </div>

      <div className="mb-5">
        <OltShelf oltId={olt.id} />
      </div>
    </div>
  );
}
