import type { Prisma } from "@prisma/client";
import { encryptSecret, decryptSecret } from "@oltflow/core";
import { prisma } from "./client.js";

/**
 * DB-backed integration configs. Secrets are AES-GCM encrypted with OLT_CRED_KEY.
 * Env vars remain bootstrap fallback until an admin saves a row.
 */

function credKey(): string {
  const k = process.env.OLT_CRED_KEY ?? "";
  if (!k) throw new Error("OLT_CRED_KEY nuk është konfiguruar");
  return k;
}

export type IntegrationId =
  | "telegram"
  | "whatsapp"
  | "smtp"
  | "webhook"
  | "genieacs"
  | "radius"
  | "winbox";

export interface TelegramConfig {
  botToken?: string;
  defaultChatId?: string;
}

export interface SmtpConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string; // Gmail app password
  from?: string;
}

export interface WebhookConfig {
  url?: string;
  secret?: string;
  eventFilter?: string[]; // empty = all
}

export interface WhatsappConfig {
  provider?: "meta" | "baileys";
  // Meta Cloud API (official)
  phoneNumberId?: string;
  accessToken?: string;
  templateAlarm?: string;
  // Baileys QR link (unofficial). Session lives in WhatsappAuth, not here; only a
  // fallback default recipient is stored.
  defaultRecipient?: string;
}

export interface GenieacsConfig {
  nbiUrl?: string;
  acsUrl?: string;
  username?: string;
  password?: string;
}

export interface RadiusConfig {
  databaseUrl?: string;
}

export interface WinboxConfig {
  enabled?: boolean;
  port?: number;
}

export type IntegrationConfigMap = {
  telegram: TelegramConfig;
  whatsapp: WhatsappConfig;
  smtp: SmtpConfig;
  webhook: WebhookConfig;
  genieacs: GenieacsConfig;
  radius: RadiusConfig;
  winbox: WinboxConfig;
};

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { expires: number; enabled: boolean; config: unknown; status: string | null }>();

export function invalidateIntegrationCache(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}

function envFallback(id: IntegrationId): { enabled: boolean; config: unknown } {
  switch (id) {
    case "telegram": {
      const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
      const defaultChatId = process.env.TELEGRAM_CHAT_ID ?? "";
      return {
        enabled: Boolean(botToken && defaultChatId),
        config: { botToken, defaultChatId } satisfies TelegramConfig,
      };
    }
    case "smtp": {
      const host = process.env.SMTP_HOST ?? "";
      const user = process.env.SMTP_USER ?? "";
      const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "";
      return {
        enabled: Boolean(host && user && pass),
        config: {
          host,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === "true",
          user,
          pass,
          from: process.env.SMTP_FROM ?? user,
        } satisfies SmtpConfig,
      };
    }
    case "webhook": {
      const url = process.env.WEBHOOK_URL ?? "";
      return {
        enabled: Boolean(url),
        config: {
          url,
          secret: process.env.WEBHOOK_SECRET ?? "",
          eventFilter: [],
        } satisfies WebhookConfig,
      };
    }
    case "whatsapp": {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
      const meta = Boolean(phoneNumberId && accessToken);
      // Default to the Baileys QR provider; it stays disabled until an admin links
      // a device (connection status is checked at send time by the channel).
      return {
        enabled: meta,
        config: {
          provider: meta ? "meta" : "baileys",
          phoneNumberId,
          accessToken,
          templateAlarm: process.env.WHATSAPP_TEMPLATE_ALARM ?? "oltflow_alarm",
        } satisfies WhatsappConfig,
      };
    }
    case "genieacs": {
      const nbiUrl = process.env.GENIEACS_URL ?? "";
      return {
        enabled: Boolean(nbiUrl),
        config: {
          nbiUrl,
          acsUrl: process.env.ACS_URL ?? "",
          username: process.env.GENIEACS_USER ?? "",
          password: process.env.GENIEACS_PASS ?? "",
        } satisfies GenieacsConfig,
      };
    }
    case "radius": {
      const databaseUrl = process.env.RADIUS_DB_URL ?? "";
      return {
        enabled: Boolean(databaseUrl),
        config: { databaseUrl } satisfies RadiusConfig,
      };
    }
    case "winbox":
      return { enabled: true, config: { enabled: true, port: 8291 } satisfies WinboxConfig };
    default:
      return { enabled: false, config: {} };
  }
}

export async function getIntegration<T = unknown>(
  id: IntegrationId
): Promise<{ enabled: boolean; config: T; status: string | null; fromDb: boolean }> {
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expires > now) {
    return { enabled: hit.enabled, config: hit.config as T, status: hit.status, fromDb: true };
  }

  const row = await prisma.integration.findUnique({ where: { id } });
  if (row?.configEnc) {
    try {
      const plain = decryptSecret(row.configEnc, credKey());
      const config = JSON.parse(plain) as T;
      const enabled = row.enabled;
      cache.set(id, { expires: now + CACHE_TTL_MS, enabled, config, status: row.status });
      return { enabled, config, status: row.status, fromDb: true };
    } catch {
      // fall through to env
    }
  }

  const fb = envFallback(id);
  // If row exists but no config, still honour enabled flag when false.
  const enabled = row ? row.enabled && fb.enabled : fb.enabled;
  cache.set(id, {
    expires: now + CACHE_TTL_MS,
    enabled: row?.enabled ? enabled : fb.enabled,
    config: fb.config,
    status: row?.status ?? (fb.enabled ? "ok" : "unconfigured"),
  });
  return {
    enabled: row ? (row.enabled ? fb.enabled || Boolean(row.configEnc) : false) : fb.enabled,
    config: fb.config as T,
    status: row?.status ?? null,
    fromDb: Boolean(row),
  };
}

/** Redacted config for admin UI (secrets masked). */
export function redactConfig(id: IntegrationId, config: Record<string, unknown>): Record<string, unknown> {
  const secretKeys = new Set([
    "botToken",
    "pass",
    "password",
    "accessToken",
    "secret",
    "databaseUrl",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secretKeys.has(k) && typeof v === "string" && v.length > 0) {
      out[k] = v.length <= 8 ? "••••••••" : `${v.slice(0, 3)}…${v.slice(-2)}`;
      out[`${k}Set`] = true;
    } else {
      out[k] = v;
    }
  }
  void id;
  return out;
}

export async function saveIntegration(
  id: IntegrationId,
  opts: {
    enabled: boolean;
    config: Record<string, unknown>;
    /** Previous config — used so masked "••••" fields don't wipe secrets. */
    mergeFrom?: Record<string, unknown>;
    updatedById?: number | null;
    status?: string | null;
    statusDetail?: string | null;
  }
): Promise<void> {
  const secretKeys = ["botToken", "pass", "password", "accessToken", "secret", "databaseUrl"];
  const merged = { ...(opts.mergeFrom ?? {}), ...opts.config };
  for (const k of secretKeys) {
    const v = opts.config[k];
    if (typeof v === "string" && (v.includes("…") || v.includes("•"))) {
      // keep previous
      if (opts.mergeFrom && opts.mergeFrom[k] !== undefined) merged[k] = opts.mergeFrom[k];
      else delete merged[k];
    }
  }
  // strip *Set helper flags
  for (const k of Object.keys(merged)) {
    if (k.endsWith("Set")) delete merged[k];
  }

  const configEnc = encryptSecret(JSON.stringify(merged), credKey());
  await prisma.integration.upsert({
    where: { id },
    create: {
      id,
      enabled: opts.enabled,
      configEnc,
      status: opts.status ?? "unknown",
      statusDetail: opts.statusDetail ?? null,
      updatedById: opts.updatedById ?? null,
      lastCheckAt: opts.status ? new Date() : null,
    },
    update: {
      enabled: opts.enabled,
      configEnc,
      status: opts.status ?? undefined,
      statusDetail: opts.statusDetail ?? undefined,
      updatedById: opts.updatedById ?? null,
      lastCheckAt: opts.status ? new Date() : undefined,
    },
  });
  invalidateIntegrationCache(id);
}

export async function setIntegrationStatus(
  id: IntegrationId,
  status: string,
  statusDetail?: string | null
): Promise<void> {
  await prisma.integration.updateMany({
    where: { id },
    data: { status, statusDetail: statusDetail ?? null, lastCheckAt: new Date() },
  });
  invalidateIntegrationCache(id);
}

export async function listIntegrations(): Promise<
  {
    id: string;
    enabled: boolean;
    status: string | null;
    statusDetail: string | null;
    lastCheckAt: Date | null;
    updatedAt: Date;
    config: Record<string, unknown>;
    fromEnvFallback: boolean;
  }[]
> {
  const ids: IntegrationId[] = [
    "telegram",
    "whatsapp",
    "smtp",
    "webhook",
    "genieacs",
    "radius",
    "winbox",
  ];
  const rows = await prisma.integration.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = [];
  for (const id of ids) {
    const full = await getIntegration<Record<string, unknown>>(id);
    const row = byId.get(id);
    out.push({
      id,
      enabled: full.enabled,
      status: full.status ?? (full.enabled ? "ok" : "unconfigured"),
      statusDetail: row?.statusDetail ?? null,
      lastCheckAt: row?.lastCheckAt ?? null,
      updatedAt: row?.updatedAt ?? new Date(0),
      config: redactConfig(id, (full.config as Record<string, unknown>) ?? {}),
      fromEnvFallback: !full.fromDb || !row?.configEnc,
    });
  }
  return out;
}

/** Raw decrypted config for server-side use (worker channels). Never send to browser. */
export async function getIntegrationSecrets<K extends IntegrationId>(
  id: K
): Promise<{ enabled: boolean; config: IntegrationConfigMap[K] }> {
  const r = await getIntegration<IntegrationConfigMap[K]>(id);
  return { enabled: r.enabled, config: r.config };
}

export type { Prisma };
