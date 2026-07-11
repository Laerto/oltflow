import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Activity,
  Map as MapIcon,
  Router,
  Shield,
  Signal,
  Ticket,
  Wifi,
  Server,
  Zap,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

/**
 * Public marketing landing. Logged-in users are bounced to the NOC dashboard.
 * Static — no DB reads (fast, cacheable).
 */
export default async function LandingPage() {
  const store = await cookies();
  if (store.get("oltflow_session")?.value) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
            <Server className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">
            <span className="text-blue-400">OLT</span>Flow
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Hyr
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
          >
            Regjistrohu
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              <Zap className="h-3.5 w-3.5" /> ISP NOC · ZTE C300/C320
            </div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              Menaxho, monitoro dhe rregullo{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                të gjithë flotën GPON
              </span>{" "}
              nga një panel
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              OLTFlow është platforma e NOC për ISP: alarme live, provizionim one-click, harta e
              rrjetit, defekte me MTTR, dhe TR-069 — e ndërtuar për 50–100 OLT dhe dhjetëra mijëra ONU.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition hover:bg-blue-500"
              >
                Fillo falas <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
              >
                Hyr në panel
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Alarme Telegram
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Role & leje
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Audit i plotë
              </span>
            </div>
          </div>

          {/* Mock dashboard card */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-blue-600/20 to-cyan-500/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/40">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-[11px] font-medium text-slate-500">NOC Dashboard</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {[
                  { l: "Online", v: "1 842", c: "text-emerald-400" },
                  { l: "Offline", v: "97", c: "text-rose-400" },
                  { l: "Sinjal i dobët", v: "34", c: "text-amber-400" },
                  { l: "Uncfg", v: "3", c: "text-blue-400" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">{s.l}</div>
                    <div className={`mt-1 text-xl font-bold ${s.c}`}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t border-slate-800 px-4 py-3">
                {[
                  { t: "OLT Tiranë-2 pa lidhje", s: "critical" },
                  { t: "Port 1/15/6 — 12/14 ONU offline", s: "warning" },
                  { t: "Klient −31.2 dBm · F660", s: "critical" },
                ].map((a) => (
                  <div key={a.t} className="flex items-center gap-2 rounded-md bg-slate-950/50 px-2.5 py-2 text-xs">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${a.s === "critical" ? "bg-rose-500" : "bg-amber-500"}`}
                    />
                    <span className="text-slate-300">{a.t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-800/80 bg-slate-900/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4 sm:px-6">
          {[
            { v: "50–100", l: "OLT për instance" },
            { v: "100k+", l: "ONU të skalueshme" },
            { v: "<1s", l: "Dashboard load" },
            { v: "24/7", l: "Alarme live" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-2xl font-extrabold text-white sm:text-3xl">{s.v}</div>
              <div className="mt-1 text-xs text-slate-500">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Gjithçka që ka nevojë NOC</h2>
          <p className="mt-3 text-sm text-slate-400">
            Nga autorizimi i ONU deri te defektet me MTTR — një panel, një burim i vërtetë.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Activity, t: "Monitorim flote", d: "State, sinjal, trafik PON, CPU/temp kartash — live." },
            { icon: Router, t: "Provizionim one-click", d: "GPON + EPON authorize, PPPoE, ACS push, Route/Bridge." },
            { icon: Signal, t: "Sinjal & alarme", d: "Thresholds, danger daily flash, ack/silence, Telegram." },
            { icon: MapIcon, t: "Harta ODN", d: "OLT, splitter kaskadë, fiber, ONU me ngjyrë sinjali." },
            { icon: Ticket, t: "Defektet / MTTR", d: "Assign teknik, before/after Rx, Telegram DM." },
            { icon: Wifi, t: "TR-069 / GenieACS", d: "WiFi, WAN IP, reboot — pa rënë te ACS për çdo klik." },
            { icon: Shield, t: "Role & audit", d: "Admin / support / teknik / viewer + leje granulare." },
            { icon: Server, t: "Multi-OLT zones", d: "Scope per përdorues — çdo ekip sheh zonën e vet." },
            { icon: Zap, t: "Integrime", d: "Telegram, Email, WhatsApp, webhooks, RADIUS, Winbox." },
          ].map((f) => (
            <div
              key={f.t}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-slate-700 hover:bg-slate-900"
            >
              <div className="mb-3 inline-flex rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-white">{f.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-800/80 bg-slate-900/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-white">Si funksionon</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { n: "1", t: "Shto OLT", d: "IP, kredenciale, slot-et GPON/EPON, SNMP — test lidhjeje automatik." },
              { n: "2", t: "Sinkronizo", d: "Worker-i merr inventarin, sinjalin dhe uncfg çdo minutë." },
              { n: "3", t: "Opero", d: "Proviziono, alarme, defekte, harta — ekipi në një panel." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {s.n}
                </div>
                <h3 className="font-semibold text-white">{s.t}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-600/20 via-slate-900 to-slate-950 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Gati për NOC-un tënd?</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
            Krijo llogari (viewer derisa admini të miratojë) ose hyr nëse ke ftesë.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
            >
              Regjistrohu
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Hyr
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/80 py-8 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} OLTFlow · ISP Management & Monitoring
      </footer>
    </div>
  );
}
