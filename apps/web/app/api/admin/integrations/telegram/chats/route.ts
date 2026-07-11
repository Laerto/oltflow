import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/authorize";
import { getIntegrationSecrets } from "@oltflow/db";

/**
 * Guided setup helper: list chats the bot has recently seen (via getUpdates), so
 * an admin can pick a chat ID instead of hunting for it. The app never long-polls
 * Telegram itself (it only sends), so getUpdates here is safe.
 */
export async function GET() {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const { config } = await getIntegrationSecrets("telegram");
  const token = (config as { botToken?: string }).botToken;
  if (!token) return NextResponse.json({ chats: [], detail: "Bot token mungon" });

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, {
      signal: AbortSignal.timeout(8000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (!data.ok) return NextResponse.json({ chats: [], detail: data.description ?? "getUpdates dështoi" });

    const map = new Map<string, { id: string; title: string; type: string }>();
    for (const u of data.result ?? []) {
      const chat = (u.message ?? u.channel_post ?? u.my_chat_member ?? u.chat_member)?.chat;
      if (!chat) continue;
      const title =
        chat.title ??
        [chat.first_name, chat.last_name].filter(Boolean).join(" ") ??
        chat.username ??
        String(chat.id);
      map.set(String(chat.id), { id: String(chat.id), type: chat.type, title });
    }
    const chats = [...map.values()];
    return NextResponse.json({
      chats,
      detail: chats.length === 0 ? "Asnjë chat — dërgo një mesazh botit, pastaj provo prapë." : undefined,
    });
  } catch (e) {
    return NextResponse.json({ chats: [], detail: String(e) });
  }
}
