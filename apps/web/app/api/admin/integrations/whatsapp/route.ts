import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/authorize";
import { redis } from "@/lib/redis";

// Keep in sync with apps/worker/src/whatsapp/manager.ts (worker owns the socket;
// the web tier only reads status/QR from Redis and sends control via pub/sub).
const WA_STATUS_KEY = "wa:status";
const WA_QR_KEY = "wa:qr";
const WA_CONTROL_CHANNEL = "wa:control";

/** Current WhatsApp link status + QR (if the worker is showing one). */
export async function GET() {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const [statusRaw, qr] = await Promise.all([
    redis.get(WA_STATUS_KEY).catch(() => null),
    redis.get(WA_QR_KEY).catch(() => null),
  ]);
  let status = { status: "disconnected", number: null, error: null } as Record<string, unknown>;
  if (statusRaw) {
    try {
      status = JSON.parse(statusRaw);
    } catch {
      /* keep default */
    }
  }
  return NextResponse.json({ ...status, qr: qr ?? null });
}

/** Body: { action: "link" | "unlink" } — tells the worker to (re)link or log out. */
export async function POST(request: Request) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== "link" && action !== "unlink") {
    return NextResponse.json({ error: "action must be link|unlink" }, { status: 400 });
  }
  const delivered = await redis.publish(WA_CONTROL_CHANNEL, action).catch(() => 0);
  return NextResponse.json({ ok: true, workerListening: delivered > 0 });
}
