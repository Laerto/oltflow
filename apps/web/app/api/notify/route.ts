import { NextResponse } from "next/server";
import { TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardTier } from "@/lib/olt-access";

// Sends a Telegram message (Bot API). Body: { text }. No-op error if unconfigured.
export async function POST(request: Request) {
  await requireUser();
  const tierDenied = await guardTier(TIER.ADMIN);
  if (tierDenied) return tierDenied;
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  if (!token || !chatId) {
    return NextResponse.json({ error: "Telegram nuk është konfiguruar (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" && body.text.trim() ? body.text.trim() : "🔔 OLTFlow test";
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ error: "Dërgimi te Telegram dështoi" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
