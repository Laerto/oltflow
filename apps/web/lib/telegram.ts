// Minimal Telegram sender for the web tier (Bot API, fetch-only). Mirrors the worker's
// sender but lets API routes DM a specific chat (a technician) with a fallback to the
// shared group. No-op when the bot isn't configured.
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const GROUP = () => process.env.TELEGRAM_CHAT_ID ?? "";

export async function sendTelegramTo(chatId: string | null | undefined, text: string): Promise<boolean> {
  const token = TOKEN();
  const chat = (chatId && chatId.trim()) || GROUP();
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
