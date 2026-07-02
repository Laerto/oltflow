// Minimal Telegram sender (Bot API, fetch-only — no deps). No-op when unconfigured.
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT = () => process.env.TELEGRAM_CHAT_ID ?? "";

export function telegramConfigured(): boolean {
  return Boolean(TOKEN() && CHAT());
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT(), text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
