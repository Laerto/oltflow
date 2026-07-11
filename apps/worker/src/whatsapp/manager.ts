import { Redis } from "ioredis";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type BaileysEventMap,
  type WASocket,
} from "@whiskeysockets/baileys";
import { useDbAuthState, type DbAuthState } from "./auth-state.js";
import { log } from "../logger.js";

/**
 * Persistent WhatsApp (Baileys / WhatsApp Web multi-device) connection, hosted in
 * the long-lived worker process. Publishes its status + login QR to Redis so the
 * web tier can render them, and listens on a Redis pub/sub channel for link/unlink
 * commands. Unofficial protocol — the linked number can be banned; use a dedicated
 * SIM. Session is persisted encrypted via useDbAuthState.
 */

export type WaStatus = "disconnected" | "connecting" | "qr" | "connected";

export const WA_STATUS_KEY = "wa:status";
export const WA_QR_KEY = "wa:qr";
export const WA_CONTROL_CHANNEL = "wa:control";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const waLogger = pino({ level: "silent" });

let sock: WASocket | null = null;
let auth: DbAuthState | null = null;
let status: WaStatus = "disconnected";
let linkedNumber: string | null = null;
let lastError: string | null = null;
let starting = false;
// True only while an admin-initiated link is in progress, so we surface QR then.
let wantLink = false;

function jidToNumber(jid?: string | null): string | null {
  if (!jid) return null;
  const m = jid.match(/^(\d+)/);
  return m ? m[1] : null;
}

/** Convert a raw phone number (any punctuation) to a WhatsApp user JID. */
export function toJid(number: string): string {
  const digits = number.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

async function publishStatus(): Promise<void> {
  const payload = JSON.stringify({
    status,
    number: linkedNumber,
    error: lastError,
    updatedAt: new Date().toISOString(),
  });
  await pub.set(WA_STATUS_KEY, payload).catch(() => {});
}

async function setStatus(next: WaStatus, err?: string | null): Promise<void> {
  status = next;
  lastError = err ?? null;
  if (next !== "qr") await pub.del(WA_QR_KEY).catch(() => {});
  await publishStatus();
}

export function getWhatsappStatus(): { status: WaStatus; number: string | null; error: string | null } {
  return { status, number: linkedNumber, error: lastError };
}

async function connect(): Promise<void> {
  if (starting || sock) return;
  starting = true;
  try {
    auth = await useDbAuthState();
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    await setStatus("connecting");

    sock = makeWASocket({
      version,
      auth: auth.state,
      logger: waLogger,
      browser: ["OLTFlow", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", () => void auth?.saveCreds());

    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 288 }).catch(() => null);
        if (dataUrl) {
          await pub.set(WA_QR_KEY, dataUrl, "EX", 90).catch(() => {});
          await setStatus("qr");
        }
      }
      if (connection === "open") {
        wantLink = false;
        linkedNumber = jidToNumber(sock?.user?.id);
        log.info(`WhatsApp connected as ${linkedNumber ?? "?"}`);
        await setStatus("connected");
      }
      if (connection === "close") {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        sock = null;
        if (loggedOut) {
          log.warn("WhatsApp logged out — clearing session");
          await auth?.clear().catch(() => {});
          linkedNumber = null;
          await setStatus("disconnected", "logged out");
        } else {
          await setStatus("connecting", lastDisconnect?.error ? String(lastDisconnect.error) : null);
          // Reconnect with backoff; keeps notifications flowing after drops.
          setTimeout(() => void connect(), 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", (ev) => void handleInbound(ev));
  } catch (err) {
    log.error(`WhatsApp connect failed: ${String(err)}`);
    sock = null;
    await setStatus("disconnected", String(err));
  } finally {
    starting = false;
  }
}

/** Minimal two-way: reply to a "status"/"ping" text so a tech can probe the bot. */
async function handleInbound(ev: BaileysEventMap["messages.upsert"]): Promise<void> {
  for (const m of ev.messages) {
    if (m.key.fromMe || !m.key.remoteJid) continue;
    const text =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((m.message as any)?.conversation ?? (m.message as any)?.extendedTextMessage?.text ?? "")
        .toString()
        .trim()
        .toLowerCase();
    if (text === "status" || text === "ping") {
      await sock
        ?.sendMessage(m.key.remoteJid, { text: "✅ OLTFlow WhatsApp është aktiv." })
        .catch(() => {});
    }
  }
}

export async function sendWhatsappText(to: string, text: string): Promise<void> {
  if (!sock || status !== "connected") throw new Error("WhatsApp not connected");
  await sock.sendMessage(toJid(to), { text });
}

export async function sendWhatsappImage(to: string, image: Buffer, caption?: string): Promise<void> {
  if (!sock || status !== "connected") throw new Error("WhatsApp not connected");
  await sock.sendMessage(toJid(to), { image, caption });
}

/** Admin action: start a fresh link (emits a QR if no valid session). */
export async function linkWhatsapp(): Promise<void> {
  wantLink = true;
  if (status === "connected") return;
  await connect();
}

/** Admin action: log out and wipe the stored session. */
export async function unlinkWhatsapp(): Promise<void> {
  try {
    await sock?.logout().catch(() => {});
  } finally {
    sock = null;
    const a = auth ?? (await useDbAuthState());
    await a.clear().catch(() => {});
    linkedNumber = null;
    wantLink = false;
    await setStatus("disconnected");
  }
}

/**
 * Boot hook: subscribe to the control channel and auto-reconnect if a session
 * already exists (so alarms keep flowing after a worker restart). A fresh install
 * with no session stays idle until an admin clicks "Link device".
 */
export async function startWhatsapp(): Promise<void> {
  const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await sub.subscribe(WA_CONTROL_CHANNEL).catch(() => {});
  sub.on("message", (_ch, msg) => {
    if (msg === "link") void linkWhatsapp();
    else if (msg === "unlink") void unlinkWhatsapp();
  });

  await publishStatus();
  const existing = await useDbAuthState();
  if (existing.state.creds.registered) {
    log.info("WhatsApp: existing session found — reconnecting");
    await connect();
  } else {
    log.info("WhatsApp: no session — idle until an admin links a device");
  }
}
