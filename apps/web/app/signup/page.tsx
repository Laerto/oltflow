"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publicSignup, setPublicSignup] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => setPublicSignup(Boolean(d.publicSignup)))
      .catch(() => setPublicSignup(false));
  }, []);

  const closed = publicSignup === false && !inviteToken;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gabim");
      setOk(data.message ?? "Sukses");
      if (data.warning) setError(data.warning);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Krijo llogari"
      subtitle={
        inviteToken
          ? "Ftesë admini — llogaria aktivizohet menjëherë"
          : "Pas emailit, admini miraton qasjen"
      }
      footer={
        <>
          Ke llogari?{" "}
          <Link href="/login" className="font-medium text-blue-400 hover:underline">
            Hyr
          </Link>
        </>
      }
    >
      {closed ? (
        <div className="space-y-3 text-center text-sm text-slate-400">
          <p>Regjistrimi publik është i mbyllur.</p>
          <p className="text-xs">Kërko ftesë nga administratori i OLTFlow.</p>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/login">Kthehu te hyrja</Link>
          </Button>
        </div>
      ) : ok && !error?.includes("SMTP") ? (
        <div className="space-y-3 text-center text-sm text-slate-300">
          <p className="font-medium text-emerald-400">✓ {ok}</p>
          <Button asChild className="w-full bg-blue-600 hover:bg-blue-500">
            <Link href="/login">Vazhdo te hyrja</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Emri</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-slate-700 bg-slate-950 text-slate-100"
              placeholder="Emër Mbiemër"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Fjalëkalimi (min 8)</Label>
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
          {ok && (
            <Alert>
              <AlertDescription>{ok}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500">
            {loading ? "Duke regjistruar..." : "Regjistrohu"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
