import { createHmac } from "node:crypto";
import {
  getIntegrationSecrets,
  type TelegramConfig,
  type SmtpConfig,
  type WebhookConfig,
  type WhatsappConfig,
} from "@oltflow/db";
import type { ChannelTarget, NotifyEvent } from "@oltflow/core";

export interface ChannelResult {
  ok: boolean;
  target?: string;
  error?: string;
  skipped?: boolean;
}

/** Telegram Bot API. */
export async function sendTelegramChannel(
  event: NotifyEvent,
  target?: ChannelTarget
): Promise<ChannelResult> {
  const { enabled, config } = await getIntegrationSecrets("telegram");
  if (!enabled) return { ok: false, skipped: true, error: "telegram disabled" };
  const cfg = config as TelegramConfig;
  const token = cfg.botToken ?? "";
  const chatId = target?.chatId || cfg.defaultChatId || "";
  if (!token || !chatId) return { ok: false, skipped: true, error: "telegram unconfigured" };

  const text = `<b>${escapeHtml(event.title)}</b>\n${event.body}`;
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
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, target: chatId, error: `HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true, target: chatId };
  } catch (err) {
    return { ok: false, target: chatId, error: String(err) };
  }
}

/** SMTP via nodemailer (optional dep). */
export async function sendSmtpChannel(
  event: NotifyEvent,
  target?: ChannelTarget
): Promise<ChannelResult> {
  const { enabled, config } = await getIntegrationSecrets("smtp");
  if (!enabled) return { ok: false, skipped: true, error: "smtp disabled" };
  const cfg = config as SmtpConfig;
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { ok: false, skipped: true, error: "smtp unconfigured" };
  }
  const to = target?.to?.length ? target.to : [];
  if (to.length === 0) return { ok: false, skipped: true, error: "no recipients" };

  try {
    // Dynamic import so worker boots without nodemailer until installed.
    const nodemailer = await import("nodemailer").catch(() => null);
    if (!nodemailer) return { ok: false, error: "nodemailer not installed" };
    const port = cfg.port ?? 587;
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port,
      // 465 = implicit TLS, 587 = STARTTLS. Strip spaces from Gmail app passwords.
      secure: cfg.secure ?? port === 465,
      auth: { user: cfg.user!.trim(), pass: cfg.pass!.replace(/\s+/g, "") },
    });
    await transport.sendMail({
      from: cfg.from || cfg.user,
      to: to.join(", "),
      subject: `[OLTFlow] ${event.title}`,
      text: stripHtml(event.body),
      html: `<h3>${escapeHtml(event.title)}</h3><p>${event.body}</p>`,
    });
    return { ok: true, target: to.join(",") };
  } catch (err) {
    return { ok: false, target: to.join(","), error: String(err) };
  }
}

/** Outbound webhook with optional HMAC-SHA256 signature. */
export async function sendWebhookChannel(
  event: NotifyEvent,
  _target?: ChannelTarget
): Promise<ChannelResult> {
  const { enabled, config } = await getIntegrationSecrets("webhook");
  if (!enabled) return { ok: false, skipped: true, error: "webhook disabled" };
  const cfg = config as WebhookConfig;
  if (!cfg.url) return { ok: false, skipped: true, error: "webhook unconfigured" };

  if (cfg.eventFilter?.length && !cfg.eventFilter.includes(event.eventType)) {
    return { ok: false, skipped: true, error: "event filtered", target: cfg.url };
  }

  const body = JSON.stringify({
    event: event.eventType,
    severity: event.severity,
    title: event.title,
    body: event.body,
    alarmKey: event.alarmKey,
    oltId: event.oltId,
    onuId: event.onuId,
    detail: event.detail,
    ts: new Date().toISOString(),
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.secret) {
    headers["X-OLTFlow-Signature"] = createHmac("sha256", cfg.secret).update(body).digest("hex");
  }
  try {
    const res = await fetch(cfg.url, { method: "POST", headers, body });
    if (!res.ok) return { ok: false, target: cfg.url, error: `HTTP ${res.status}` };
    return { ok: true, target: cfg.url };
  } catch (err) {
    return { ok: false, target: cfg.url, error: String(err) };
  }
}

/** WhatsApp — Baileys QR link (default) or Meta Cloud API template. */
export async function sendWhatsappChannel(
  event: NotifyEvent,
  target?: ChannelTarget
): Promise<ChannelResult> {
  const { enabled, config } = await getIntegrationSecrets("whatsapp");
  if (!enabled) return { ok: false, skipped: true, error: "whatsapp disabled" };
  const cfg = config as WhatsappConfig;
  const to = target?.phone || target?.to?.[0] || cfg.defaultRecipient;
  if (!to) return { ok: false, skipped: true, error: "no recipient" };

  // Baileys (QR-linked device): send a free-form message via the worker's socket.
  if (cfg.provider !== "meta") {
    const { sendWhatsappText, getWhatsappStatus } = await import("../whatsapp/manager.js");
    if (getWhatsappStatus().status !== "connected") {
      return { ok: false, skipped: true, error: "whatsapp not linked", target: to };
    }
    try {
      await sendWhatsappText(to, `*${event.title}*\n${stripHtml(event.body)}`);
      return { ok: true, target: to };
    } catch (err) {
      return { ok: false, target: to, error: String(err) };
    }
  }

  // Meta Cloud API (official) — template message (business-initiated).
  if (!cfg.phoneNumberId || !cfg.accessToken) {
    return { ok: false, skipped: true, error: "whatsapp unconfigured" };
  }
  const template = cfg.templateAlarm || "oltflow_alarm";
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/\D/g, ""),
          type: "template",
          template: {
            name: template,
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: event.title.slice(0, 100) },
                  { type: "text", text: stripHtml(event.body).slice(0, 200) },
                ],
              },
            ],
          },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, target: to, error: `HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true, target: to };
  } catch (err) {
    return { ok: false, target: to, error: String(err) };
  }
}

export async function dispatchChannel(
  type: string,
  event: NotifyEvent,
  target?: ChannelTarget
): Promise<ChannelResult> {
  switch (type) {
    case "telegram":
      return sendTelegramChannel(event, target);
    case "smtp":
      return sendSmtpChannel(event, target);
    case "webhook":
      return sendWebhookChannel(event, target);
    case "whatsapp":
      return sendWhatsappChannel(event, target);
    default:
      return { ok: false, error: `unknown channel ${type}` };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}
