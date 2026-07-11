import { NextResponse } from "next/server";
import {
  getIntegrationSecrets,
  saveIntegration,
  setIntegrationStatus,
  type IntegrationId,
} from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";
import { prisma } from "@oltflow/db";

const IDS = new Set(["telegram", "whatsapp", "smtp", "webhook", "genieacs", "radius", "winbox"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!IDS.has(id)) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });

  const { enabled, config } = await getIntegrationSecrets(id as IntegrationId);
  // Redact secrets for the form (show placeholders)
  const redacted: Record<string, unknown> = { ...config };
  for (const k of ["botToken", "pass", "password", "accessToken", "secret", "databaseUrl"]) {
    if (typeof redacted[k] === "string" && (redacted[k] as string).length > 0) {
      const v = redacted[k] as string;
      redacted[k] = v.length <= 8 ? "••••••••" : `${v.slice(0, 3)}…${v.slice(-2)}`;
      redacted[`${k}Set`] = true;
    }
  }
  const row = await prisma.integration.findUnique({ where: { id } });
  return NextResponse.json({
    id,
    enabled,
    config: redacted,
    status: row?.status ?? null,
    statusDetail: row?.statusDetail ?? null,
    lastCheckAt: row?.lastCheckAt?.toISOString() ?? null,
  });
}

/** Body: { enabled, config } */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;
  const { id } = await params;
  if (!IDS.has(id)) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean" || typeof body.config !== "object") {
    return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });
  }

  const { config: prev } = await getIntegrationSecrets(id as IntegrationId);
  await saveIntegration(id as IntegrationId, {
    enabled: body.enabled,
    config: body.config,
    mergeFrom: prev as Record<string, unknown>,
    updatedById: Number(session.sub),
    status: "unknown",
  });

  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "integration_update",
        result: "success",
        payload: { id, enabled: body.enabled },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

/** Test connection. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!IDS.has(id)) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { enabled, config } = await getIntegrationSecrets(id as IntegrationId);
  if (!enabled && id !== "winbox") {
    return NextResponse.json({ ok: false, error: "Integration is disabled" }, { status: 400 });
  }

  let ok = false;
  let detail = "";

  try {
    if (id === "telegram") {
      const cfg = config as { botToken?: string; defaultChatId?: string };
      if (!cfg.botToken) throw new Error("botToken missing");
      const me = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getMe`);
      if (!me.ok) throw new Error(`getMe HTTP ${me.status}`);
      const meJson = (await me.json()) as { result?: { username?: string } };
      detail = `bot @${meJson.result?.username ?? "?"}`;
      if (body.sendTest && cfg.defaultChatId) {
        const send = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cfg.defaultChatId,
            text: "✅ OLTFlow test — Telegram u lidh me sukses.",
          }),
        });
        if (!send.ok) throw new Error(`sendMessage HTTP ${send.status}`);
        detail += " · test message sent";
      }
      ok = true;
    } else if (id === "smtp") {
      const cfg = config as { host?: string; port?: number; user?: string; pass?: string; secure?: boolean; from?: string };
      if (!cfg.host || !cfg.user || !cfg.pass) throw new Error("SMTP incomplete");
      const nodemailer = await import("nodemailer").catch(() => null);
      if (!nodemailer) throw new Error("nodemailer not installed — run npm i nodemailer");
      const port = cfg.port ?? 587;
      const t = nodemailer.createTransport({
        host: cfg.host,
        port,
        // 465 = implicit TLS, 587 = STARTTLS; strip spaces from Gmail app passwords.
        secure: cfg.secure ?? port === 465,
        auth: { user: cfg.user.trim(), pass: cfg.pass.replace(/\s+/g, "") },
      });
      await t.verify();
      if (body.sendTest && body.to) {
        await t.sendMail({
          from: cfg.from || cfg.user,
          to: body.to,
          subject: "OLTFlow SMTP test",
          text: "SMTP u lidh me sukses.",
        });
        detail = `verified · test sent to ${body.to}`;
      } else {
        detail = "SMTP verify OK";
      }
      ok = true;
    } else if (id === "webhook") {
      const cfg = config as { url?: string; secret?: string };
      if (!cfg.url) throw new Error("URL missing");
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "system.test", title: "OLTFlow test", ts: new Date().toISOString() }),
      });
      ok = res.ok || res.status < 500;
      detail = `HTTP ${res.status}`;
      if (!ok) throw new Error(detail);
    } else if (id === "genieacs") {
      const cfg = config as { nbiUrl?: string };
      if (!cfg.nbiUrl) throw new Error("NBI URL missing");
      const res = await fetch(cfg.nbiUrl.replace(/\/$/, "") + "/devices?limit=1", {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      ok = Boolean(res?.ok || res?.status === 401 || res?.status === 200);
      detail = res ? `HTTP ${res.status}` : "unreachable";
      if (!ok) throw new Error(detail);
    } else if (id === "radius") {
      const cfg = config as { databaseUrl?: string };
      ok = Boolean(cfg.databaseUrl);
      detail = ok ? "URL present (full connect test runs in worker)" : "missing URL";
      if (!ok) throw new Error(detail);
    } else if (id === "whatsapp") {
      const cfg = config as { phoneNumberId?: string; accessToken?: string };
      if (!cfg.phoneNumberId || !cfg.accessToken) throw new Error("WhatsApp incomplete");
      const res = await fetch(`https://graph.facebook.com/v18.0/${cfg.phoneNumberId}`, {
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      ok = res.ok;
      detail = `HTTP ${res.status}`;
      if (!ok) throw new Error(detail);
    } else if (id === "winbox") {
      ok = true;
      detail = "handler ready";
    } else {
      throw new Error("no test for this integration");
    }
  } catch (err) {
    ok = false;
    detail = String(err);
  }

  await setIntegrationStatus(id as IntegrationId, ok ? "ok" : "error", detail);
  return NextResponse.json({ ok, detail });
}
