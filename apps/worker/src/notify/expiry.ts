import { getExpiringClients } from "../radius.js";
import { getWhatsappStatus, sendWhatsappText } from "../whatsapp/manager.js";
import { kv } from "../kv.js";
import { log } from "../logger.js";

/**
 * WhatsApp expiry reminders for internet clients (from RADIUS Manager rm_users). Two touches per
 * cycle: 3 days before expiry, and again on the expiry day itself. Only clients that will actually
 * be cut off (autorenew=0, enableuser=1) with a mobile on file are messaged — the RADIUS query
 * already filters that. Each (client, kind, expiry-date) is sent at most once (Redis dedup); if the
 * client renews, the new expiry date starts a fresh cycle.
 *
 * Safe by default: does nothing unless EXPIRY_NOTIFY_ENABLED=true, and even then defaults to
 * DRY-RUN (logs exactly what it *would* send, sends nothing) until EXPIRY_NOTIFY_DRYRUN=false.
 */

const THROTTLE_MS = 2500; // space sends — the unofficial Baileys socket gets banned for bursts
const DEDUP_TTL_SEC = 60 * 60 * 24 * 40; // 40 days, comfortably past a monthly cycle

const MONTHS = ["Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor", "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor"];

function enabled(): boolean {
  return process.env.EXPIRY_NOTIFY_ENABLED === "true";
}
function dryRun(): boolean {
  return process.env.EXPIRY_NOTIFY_DRYRUN !== "false"; // default ON
}
function ispName(): string {
  return process.env.ISP_NAME ?? "neWave";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Normalise a RADIUS phone into WhatsApp MSISDN digits (country code + number, no +/spaces).
 * Handles `+CC…`, `00CC…`, and bare local Albanian `0xx…` (→ 355xx…). Returns null if implausible.
 */
export function normalizeMsisdn(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const has00 = s.startsWith("00");
  const hasPlus = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  if (has00) d = d.slice(2);
  else if (!hasPlus && d.startsWith("0")) d = "355" + d.slice(1);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function buildMessage(name: string | null, exp: Date, daysLeft: number): string {
  const hi = name ? `I/E nderuar ${name},` : "I/E nderuar klient,";
  const date = fmtDate(exp);
  const isp = ispName();
  if (daysLeft <= 0) {
    return `${hi}\n\nAbonimi juaj i internetit skadon *sot* (${date}). Për të shmangur ndërprerjen e shërbimit, ju lutemi kryeni rinovimin sot.\n\nFaleminderit,\n${isp}`;
  }
  return `${hi}\n\nJu kujtojmë se abonimi juaj i internetit skadon më *${date}* (pas ${daysLeft} ditësh). Për shërbim pa ndërprerje, ju lutemi kryeni rinovimin në kohë.\n\nFaleminderit,\n${isp}`;
}

export interface ExpiryNotifyResult {
  skipped?: boolean;
  total: number;
  sent: number;
  dry: number;
  deduped: number;
  badNumber: number;
  failed: number;
  dryRun: boolean;
}

/** Run one expiry-reminder pass. `force` bypasses the EXPIRY_NOTIFY_ENABLED gate (for a manual/dry test). */
export async function runExpiryNotify(force = false): Promise<ExpiryNotifyResult> {
  const isDry = dryRun();
  if (!enabled() && !force) {
    return { skipped: true, total: 0, sent: 0, dry: 0, deduped: 0, badNumber: 0, failed: 0, dryRun: isDry };
  }

  const clients = await getExpiringClients();
  if (!clients) {
    log.warn("expiry-notify: RADIUS not available");
    return { skipped: true, total: 0, sent: 0, dry: 0, deduped: 0, badNumber: 0, failed: 0, dryRun: isDry };
  }

  const waReady = getWhatsappStatus().status === "connected";
  let sent = 0,
    dry = 0,
    deduped = 0,
    badNumber = 0,
    failed = 0;

  for (const c of clients) {
    const kind = c.daysLeft <= 0 ? "d0" : "d3";
    const expKey = c.expiration.toISOString().slice(0, 10);
    const dedupKey = `expiry-notice:${c.username}:${kind}:${expKey}`;

    if (await kv.get(dedupKey)) {
      deduped++;
      continue;
    }

    const num = normalizeMsisdn(c.mobile || c.phone);
    if (!num) {
      log.warn({ username: c.username, mobile: c.mobile }, "expiry-notify: unusable phone");
      badNumber++;
      continue;
    }

    const text = buildMessage(c.name, c.expiration, c.daysLeft);

    if (isDry) {
      log.info({ username: c.username, to: num, kind, exp: expKey, name: c.name, preview: text }, "expiry-notify DRY-RUN — would send");
      dry++;
      continue; // don't mark dedup in dry-run, so re-running shows the same set
    }

    if (!waReady) {
      log.warn("expiry-notify: WhatsApp not connected — skipping live sends");
      failed++;
      continue;
    }

    try {
      await sendWhatsappText(num, text);
      await kv.set(dedupKey, new Date().toISOString(), "EX", DEDUP_TTL_SEC);
      log.info({ username: c.username, to: num, kind, exp: expKey }, "expiry-notify sent");
      sent++;
      await sleep(THROTTLE_MS);
    } catch (err) {
      log.error({ username: c.username, err: String(err) }, "expiry-notify send failed");
      failed++;
    }
  }

  const result: ExpiryNotifyResult = { total: clients.length, sent, dry, deduped, badNumber, failed, dryRun: isDry };
  log.info({ ...result }, "expiry-notify done");
  return result;
}
