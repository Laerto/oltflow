import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireUser } from "@/lib/auth";

const run = promisify(execFile);
// Strict IPv4 (0-255 per octet) — also guarantees execFile args can't be abused.
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

// Reachability check for the WAN IP an ONU got over PPPoE. Runs a short ICMP ping
// from the server (execFile with an args array — no shell, no injection).
export async function GET(request: Request) {
  await requireUser();
  const ip = new URL(request.url).searchParams.get("ip") ?? "";
  if (!IP_RE.test(ip)) {
    return NextResponse.json({ error: "IP jo e vlefshme" }, { status: 400 });
  }
  try {
    const { stdout } = await run("ping", ["-c", "3", "-W", "2", ip], { timeout: 12_000 });
    const avg = /=\s*[\d.]+\/([\d.]+)\//.exec(stdout); // rtt min/avg/max line
    const loss = /(\d+)% packet loss/.exec(stdout);
    return NextResponse.json({
      alive: true,
      avgMs: avg ? Number(avg[1]) : null,
      loss: loss ? Number(loss[1]) : 0,
    });
  } catch {
    // ping exits non-zero on 100% loss / unreachable host.
    return NextResponse.json({ alive: false, avgMs: null, loss: 100 });
  }
}
