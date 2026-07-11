"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — users management moved to /admin/users (Phase 2). */
export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/users");
  }, [router]);
  return <div className="py-16 text-center text-sm text-muted-foreground">Duke ridrejtuar te Admin → Përdoruesit…</div>;
}
