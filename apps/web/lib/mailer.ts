/**
 * Branded auth emails via the SMTP Integration (Gmail app-password STARTTLS).
 * Env SMTP_* remains bootstrap fallback through getIntegrationSecrets.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  getIntegrationSecrets,
  getBooleanSetting,
  getStringSetting,
  SETTING_KEYS,
  type SmtpConfig,
} from "@oltflow/db";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function resolveAppBaseUrl(request?: Request): Promise<string> {
  const fromSetting = (await getStringSetting(SETTING_KEYS.appBaseUrl)).trim();
  if (fromSetting) return fromSetting.replace(/\/$/, "");
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (request) {
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3030";
}

export async function isPublicSignupEnabled(): Promise<boolean> {
  return getBooleanSetting(SETTING_KEYS.publicSignup);
}

async function transport() {
  const { enabled, config } = await getIntegrationSecrets("smtp");
  const cfg = config as SmtpConfig;
  if (!enabled || !cfg.host || !cfg.user || !cfg.pass) {
    return null;
  }
  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer) return null;
  const port = cfg.port ?? 587;
  return {
    mailer: nodemailer.createTransport({
      host: cfg.host,
      port,
      // 465 = implicit TLS, 587/25 = STARTTLS. Derive when not set explicitly so
      // the port-only UI still connects correctly.
      secure: cfg.secure ?? port === 465,
      // Gmail displays app passwords space-separated ("abcd efgh ijkl mnop") — strip
      // whitespace so a pasted value authenticates, and trim a stray-space username.
      auth: { user: cfg.user.trim(), pass: cfg.pass.replace(/\s+/g, "") },
    }),
    from: cfg.from || cfg.user,
  };
}

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="sq">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0f172a;font-family:Inter,system-ui,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden">
        <tr><td style="padding:20px 24px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff">
          <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em"><span style="opacity:.9">OLT</span>Flow</div>
          <div style="font-size:12px;opacity:.85;margin-top:2px">${title}</div>
        </td></tr>
        <tr><td style="padding:28px 24px;font-size:14px;line-height:1.6;color:#cbd5e1">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;font-size:11px;color:#64748b;border-top:1px solid #334155">
          OLTFlow · ISP NOC platform · Mos i përgjigju këtij emaili
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">${label}</a></p>
<p style="font-size:11px;color:#64748b;word-break:break-all">Nëse butoni nuk funksionon, hap:<br/>${href}</p>`;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const t = await transport();
  if (!t) return { ok: false, error: "SMTP not configured" };
  try {
    await t.mailer.sendMail({
      from: t.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function sendVerifyEmail(to: string, name: string, verifyUrl: string) {
  const html = shell(
    "Konfirmo emailin",
    `<p>Përshëndetje <strong>${escapeHtml(name)}</strong>,</p>
     <p>Faleminderit që u regjistruat në OLTFlow. Klikoni butonin për të konfirmuar adresën e emailit (lidhja skadon pas 24 orësh).</p>
     ${cta(verifyUrl, "Konfirmo emailin")}
     <p>Pas konfirmimit, një administrator duhet të miratojë llogarinë tuaj para se të hyni në panel.</p>`
  );
  return sendMail({
    to,
    subject: "OLTFlow — Konfirmo emailin",
    html,
    text: `Konfirmo emailin: ${verifyUrl}`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
  const html = shell(
    "Rivendos fjalëkalimin",
    `<p>Përshëndetje <strong>${escapeHtml(name || to)}</strong>,</p>
     <p>Kërkuat rivendosjen e fjalëkalimit. Lidhja është e vlefshme për 1 orë dhe përdoret një herë.</p>
     ${cta(resetUrl, "Vendos fjalëkalim të ri")}
     <p>Nëse nuk e kërkuat ju, injoroni këtë mesazh.</p>`
  );
  return sendMail({
    to,
    subject: "OLTFlow — Rivendos fjalëkalimin",
    html,
    text: `Rivendos fjalëkalimin: ${resetUrl}`,
  });
}

export async function sendWelcomeApprovedEmail(to: string, name: string, loginUrl: string) {
  const html = shell(
    "Llogaria u miratua",
    `<p>Përshëndetje <strong>${escapeHtml(name || to)}</strong>,</p>
     <p>Administratori miratoi llogarinë tuaj. Tani mund të hyni në OLTFlow.</p>
     ${cta(loginUrl, "Hyr në panel")}`
  );
  return sendMail({
    to,
    subject: "OLTFlow — Llogaria u aktivizua",
    html,
    text: `Llogaria u miratua. Hyr: ${loginUrl}`,
  });
}

export async function sendInviteEmail(to: string, inviteUrl: string) {
  const html = shell(
    "Ftesë për OLTFlow",
    `<p>Jeni ftuar të krijoni llogari në OLTFlow.</p>
     ${cta(inviteUrl, "Krijo llogarinë")}
     <p>Lidhja skadon pas 7 ditësh.</p>`
  );
  return sendMail({
    to,
    subject: "OLTFlow — Ftesë regjistrimi",
    html,
    text: `Ftesë: ${inviteUrl}`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
