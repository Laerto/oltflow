"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gabim");
      const next = searchParams.get("next") ?? "/dashboard";
      router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Hyrje në panel"
      subtitle="NOC · OLT / ONU management"
      footer={
        <>
          Nuk ke llogari?{" "}
          <Link href="/signup" className="font-medium text-blue-400 hover:underline">
            Regjistrohu
          </Link>
          {" · "}
          <Link href="/forgot" className="font-medium text-blue-400 hover:underline">
            Harruat fjalëkalimin?
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs text-slate-400">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ju@kompania.al"
            className="border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs text-slate-400">
            Fjalëkalimi
          </Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500">
          {loading ? "Duke hyrë..." : "Hyr"}
        </Button>
      </form>
    </AuthShell>
  );
}
