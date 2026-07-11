"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/app/(app)/providers";
import { can } from "@/lib/permissions";
import { AdminNav } from "@/components/admin-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  // Until we expose effective permissions on /api/me, admin.access ≡ role admin.
  // authorize() still enforces server-side for every /api/admin/* route.
  const allowed = can.admin(me?.role);

  useEffect(() => {
    if (me && !allowed) router.replace("/");
  }, [me, allowed, router]);

  if (!me) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!allowed) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Nuk keni leje për admin.</div>;
  }

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
