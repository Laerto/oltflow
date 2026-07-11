"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [msg, setMsg] = useState("Duke verifikuar…");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!token) {
      setMsg("Mungon tokeni i verifikimit.");
      return;
    }
    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Gabim");
        setOk(true);
        setMsg(d.message ?? "Email u konfirmua.");
      })
      .catch((e) => setMsg((e as Error).message));
  }, [token]);

  return (
    <AuthShell title="Verifikimi i emailit" subtitle="OLTFlow">
      <div className="space-y-4 text-center text-sm text-slate-300">
        <p className={ok ? "text-emerald-400" : "text-slate-300"}>{msg}</p>
        <Button asChild className="w-full bg-blue-600 hover:bg-blue-500">
          <Link href="/login">Vazhdo te hyrja</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
