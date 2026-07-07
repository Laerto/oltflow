import { NextResponse } from "next/server";
import { connect } from "node:net";
import { requireUser } from "@/lib/auth";

// Strict IPv4 (0-255 per octet).
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

// Reachability of an ONU's WAN IP, checked with a TCP handshake instead of ICMP: the web
// container has no `ping` binary and no CAP_NET_RAW for raw ICMP, so `ping` always failed
// even for reachable ONUs. A TCP connect needs neither, works from any container, and matches
// what the operator actually cares about ("can I open the box?"). We probe the ports a ZTE
// ONU / customer router typically exposes; the first to answer wins.
const PROBE_PORTS = [80, 443, 8291, 7547, 22, 23]; // http, https, winbox, tr-069, ssh, telnet
const PROBE_TIMEOUT_MS = 2000;

interface Probe {
  up: boolean; // host answered (open port, or a RST = refused-but-alive)
  open: boolean; // the port accepted a connection
  ms: number | null;
}

function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<Probe> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = connect({ host: ip, port });
    let done = false;
    const finish = (r: Probe) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish({ up: true, open: true, ms: Date.now() - start }));
    sock.once("timeout", () => finish({ up: false, open: false, ms: null }));
    sock.once("error", (err: NodeJS.ErrnoException) => {
      // A refused connection still proves the host is alive — it replied with an RST.
      if (err.code === "ECONNREFUSED") finish({ up: true, open: false, ms: Date.now() - start });
      else finish({ up: false, open: false, ms: null }); // EHOSTUNREACH / ENETUNREACH / etc.
    });
  });
}

export async function GET(request: Request) {
  await requireUser();
  const ip = new URL(request.url).searchParams.get("ip") ?? "";
  if (!IP_RE.test(ip)) {
    return NextResponse.json({ error: "IP jo e vlefshme" }, { status: 400 });
  }

  const results = await Promise.all(PROBE_PORTS.map((p) => tcpProbe(ip, p, PROBE_TIMEOUT_MS)));
  const alive = results.filter((r) => r.up);
  if (alive.length === 0) {
    return NextResponse.json({ alive: false, avgMs: null, loss: 100 });
  }
  // Prefer an actually-open port's handshake time; fall back to a refused round-trip.
  const openMs = alive.filter((r) => r.open && r.ms !== null).map((r) => r.ms as number);
  const anyMs = alive.filter((r) => r.ms !== null).map((r) => r.ms as number);
  const avgMs = openMs.length ? Math.min(...openMs) : anyMs.length ? Math.min(...anyMs) : null;
  return NextResponse.json({ alive: true, avgMs, loss: 0 });
}
