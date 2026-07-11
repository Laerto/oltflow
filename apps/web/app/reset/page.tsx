"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gabim");
      setOk(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Fjalëkalim i ri" subtitle="Min. 8 karaktere">
      {!token ? (
        <p className="text-center text-sm text-rose-400">Mungon tokeni. Hap lidhjen nga emaili.</p>
      ) : ok ? (
        <div className="space-y-3 text-center text-sm">
          <p className="text-emerald-400">Fjalëkalimi u ndryshua.</p>
          <Button asChild className="w-full bg-blue-600 hover:bg-blue-500">
            <Link href="/login">Hyr tani</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Fjalëkalimi i ri</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500">
            {loading ? "Duke ruajtur..." : "Ruaj fjalëkalimin"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
