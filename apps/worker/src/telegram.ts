// Backward-compatible Telegram helpers — now backed by the Integration table
// (env TELEGRAM_* still works as bootstrap via getIntegrationSecrets).
import { getIntegrationSecrets, type TelegramConfig } from "@oltflow/db";

export async function telegramConfigured(): Promise<boolean> {
  const { enabled, config } = await getIntegrationSecrets("telegram");
  const cfg = config as TelegramConfig;
  return Boolean(enabled && cfg.botToken && cfg.defaultChatId);
}

export async function sendTelegram(text: string, chatIdOverride?: string): Promise<boolean> {
  const { enabled, config } = await getIntegrationSecrets("telegram");
  if (!enabled) return false;
  const cfg = config as TelegramConfig;
  const token = cfg.botToken ?? "";
  const chatId = chatIdOverride || cfg.defaultChatId || "";
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
