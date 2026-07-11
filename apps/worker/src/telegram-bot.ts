import { prisma, getIntegrationSecrets, type TelegramConfig } from "@oltflow/db";
import { JOB_NAMES, formatPonPort, isEponPort } from "@oltflow/core";
import { enqueue } from "./queue.js";
import { kv } from "./kv.js";
import { log } from "./logger.js";

/**
 * Inbound Telegram command bot (long-poll getUpdates). Read commands (ONU lookup, active alarms,
 * fleet/OLT status) and action commands (WiFi on/off, reboot) — every command is gated to an
 * allowlist of chat ids (the integration's defaultChatId plus optional config.allowedChatIds), so
 * a stranger who finds the bot can't query or control the network. Outbound alarms are separate
 * (notify engine); this is purely the request side. Offset is persisted in Redis so a worker
 * restart doesn't reprocess or drop messages.
 */

const OFFSET_KEY = "telegram:bot:offset";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function api(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function send(token: string, chatId: number | string, text: string): Promise<void> {
  await fetch(api(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

function authorizedChats(cfg: TelegramConfig): Set<string> {
  const allow = new Set<string>();
  if (cfg.defaultChatId) allow.add(String(cfg.defaultChatId));
  const extra = (cfg as unknown as { allowedChatIds?: unknown }).allowedChatIds;
  if (Array.isArray(extra)) for (const x of extra) allow.add(String(x));
  return allow;
}

function bandEmoji(level?: string | null): string {
  return level === "good" ? "🟢" : level === "warning" ? "🟡" : level === "critical" ? "🔴" : "⚪";
}

type OnuHit = Awaited<ReturnType<typeof findOnus>>[number];

async function findOnus(q: string, take = 5) {
  return prisma.onu.findMany({
    where: {
      OR: [
        { serial: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { pppoeUser: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      olt: { select: { id: true, name: true } },
      acsDevice: true,
      signals: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
    take,
    orderBy: { name: "asc" },
  });
}

function fmtOnu(o: OnuHit): string {
  const rx = o.lastOnuRx ?? o.signals[0]?.onuRx ?? null;
  const online = o.state === "working";
  const lines = [
    `<b>${esc(o.name || o.ponPort)}</b>`,
    `🖧 OLT: ${esc(o.olt?.name ?? String(o.oltId))} · <code>${esc(formatPonPort(o.ponPort))}</code>`,
    `${online ? "🟢 online" : "🔴 " + (o.state || "offline")}`,
    `SN: <code>${esc(o.serial || "—")}</code>`,
    rx != null ? `📶 Sinjal: ${bandEmoji(o.lastSignalLevel)} ${rx} dBm` : null,
    o.acsDevice?.wanIp ? `🌐 WAN: <code>${esc(o.acsDevice.wanIp)}</code>` : null,
    o.acsDevice?.ssid2g ? `📡 WiFi: ${esc(o.acsDevice.ssid2g)}` : null,
    o.pppoeUser ? `👤 PPPoE: <code>${esc(o.pppoeUser)}</code>` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

const HELP = [
  "<b>OLTflow bot</b> — komandat:",
  "",
  "🔎 <code>/onu &lt;serial|emër|pppoe&gt;</code> — kërko ONU",
  "   <i>(ose thjesht shkruaj emrin/serialin pa /)</i>",
  "🌐 <code>/ip &lt;adresë&gt;</code> — gjej ONU nga WAN/mgmt IP",
  "📶 <code>/signal &lt;onu&gt;</code> — sinjali optik",
  "📡 <code>/wifi &lt;onu&gt;</code> — gjendja e WiFi (SSID + on/off)",
  "🖧 <code>/lan &lt;onu&gt;</code> — pajisjet LAN",
  "📦 <code>/cpe &lt;onu&gt;</code> — model/firmware/WAN/uptime",
  "",
  "🚨 <code>/alarms</code> — alarmet aktive",
  "📊 <code>/status</code> — përmbledhje flote",
  "🖧 <code>/olts</code> — të gjitha OLT-të",
  "🖧 <code>/olt &lt;emër&gt;</code> — një OLT",
  "🔻 <code>/offline [olt]</code> — ONU offline",
  "",
  "⚙️ <i>Veprime:</i>",
  "📡 <code>/wifi_on &lt;onu&gt;</code> · <code>/wifi_off &lt;onu&gt;</code>",
  "🔄 <code>/reboot &lt;onu&gt;</code> · <code>/refresh &lt;onu&gt;</code>",
].join("\n");

async function cmdOnu(token: string, chatId: number, arg: string) {
  if (!arg) return send(token, chatId, "Përdorimi: <code>/onu &lt;serial|emër|pppoe&gt;</code>");
  const hits = await findOnus(arg, 6);
  if (!hits.length) return send(token, chatId, `S'u gjet asnjë ONU për "<b>${esc(arg)}</b>".`);
  if (hits.length > 4) {
    const list = hits.map((o) => `• ${esc(o.name || o.ponPort)} — <code>${esc(o.serial || "")}</code>`).join("\n");
    return send(token, chatId, `${hits.length}+ përputhje — bëje më specifik:\n${list}`);
  }
  await send(token, chatId, hits.map(fmtOnu).join("\n\n"));
}

async function cmdAlarms(token: string, chatId: number) {
  const alarms = await prisma.alarm.findMany({
    where: { clearedAt: null },
    orderBy: [{ severity: "asc" }, { openedAt: "desc" }],
    take: 20,
    include: { olt: { select: { name: true } } },
  });
  if (!alarms.length) return send(token, chatId, "✅ Asnjë alarm aktiv.");
  const lines = alarms.map((a) => {
    const icon = a.severity === "critical" ? "🔴" : "🟡";
    const olt = a.olt?.name ? ` · ${esc(a.olt.name)}` : "";
    const t = new Date(a.openedAt).toLocaleString("sq-AL");
    return `${icon} <b>${esc(a.title)}</b>${olt}\n   <i>${t}</i>`;
  });
  await send(token, chatId, `<b>Alarme aktive (${alarms.length})</b>\n\n${lines.join("\n")}`);
}

async function cmdStatus(token: string, chatId: number) {
  const [olts, onusByState] = await Promise.all([
    prisma.olt.findMany({ select: { status: true } }),
    prisma.onu.groupBy({ by: ["state"], _count: { _all: true } }),
  ]);
  const oltOnline = olts.filter((o) => o.status === "online").length;
  const working = onusByState.find((s) => s.state === "working")?._count._all ?? 0;
  const total = onusByState.reduce((n, s) => n + s._count._all, 0);
  const offline = total - working;
  const activeAlarms = await prisma.alarm.count({ where: { clearedAt: null } });
  await send(
    token,
    chatId,
    [
      "<b>📊 Përmbledhje flote</b>",
      `🖧 OLT: ${oltOnline}/${olts.length} online`,
      `🟢 ONU online: ${working}`,
      `🔴 ONU offline: ${offline}`,
      `📦 Gjithsej ONU: ${total}`,
      `🚨 Alarme aktive: ${activeAlarms}`,
    ].join("\n")
  );
}

async function cmdOlt(token: string, chatId: number, arg: string) {
  if (!arg) return send(token, chatId, "Përdorimi: <code>/olt &lt;emër&gt;</code>");
  const olt = await prisma.olt.findFirst({ where: { name: { contains: arg, mode: "insensitive" } } });
  if (!olt) return send(token, chatId, `S'u gjet OLT për "<b>${esc(arg)}</b>".`);
  const byState = await prisma.onu.groupBy({ by: ["state"], where: { oltId: olt.id }, _count: { _all: true } });
  const working = byState.find((s) => s.state === "working")?._count._all ?? 0;
  const total = byState.reduce((n, s) => n + s._count._all, 0);
  await send(
    token,
    chatId,
    [
      `<b>🖧 ${esc(olt.name)}</b>`,
      `${olt.status === "online" ? "🟢 online" : "🔴 " + (olt.status ?? "offline")} · <code>${esc(olt.ip)}</code>`,
      `🟢 ONU online: ${working}/${total}`,
      olt.lastSync ? `🕑 Sync: ${new Date(olt.lastSync).toLocaleString("sq-AL")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

/** Resolve exactly one ONU for an action command, or reply why it can't. */
async function resolveOne(token: string, chatId: number, arg: string): Promise<OnuHit | null> {
  if (!arg) {
    await send(token, chatId, "Jep serial/emër të ONU-së.");
    return null;
  }
  const hits = await findOnus(arg, 3);
  if (!hits.length) {
    await send(token, chatId, `S'u gjet ONU për "<b>${esc(arg)}</b>".`);
    return null;
  }
  if (hits.length > 1) {
    const list = hits.map((o) => `• ${esc(o.name || o.ponPort)} — <code>${esc(o.serial || "")}</code>`).join("\n");
    await send(token, chatId, `Disa përputhje — bëje më specifik:\n${list}`);
    return null;
  }
  return hits[0]!;
}

async function cmdWifi(token: string, chatId: number, arg: string, on: boolean) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  if (!onu.acsDevice?.deviceId) return send(token, chatId, `<b>${esc(onu.name || onu.ponPort)}</b> s'ka ACS/TR-069 — s'menaxhohet WiFi.`);
  await enqueue(JOB_NAMES.wifi, { onuId: onu.id, deviceId: onu.acsDevice.deviceId, enable2g: on, enable5g: on });
  await send(token, chatId, `📡 WiFi <b>${on ? "NDEZ" : "FIK"}</b> u dërgua për <b>${esc(onu.name || onu.ponPort)}</b> via TR-069 — efekt pas 1-2 min (kur CPE-ja informon).`);
}

async function cmdReboot(token: string, chatId: number, arg: string) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  const name = esc(onu.name || onu.ponPort);
  // Prefer the OLT CLI reboot (telnet): it works regardless of whether the CPE is talking to the
  // ACS, and rebooting the ONU makes it bootstrap → inform → any pending ACS tasks (e.g. WiFi on)
  // then apply. ACS reboot only helps a CPE that's already informing. EPON uses a different CLI
  // tree, so fall back to ACS there.
  if (isEponPort(onu.ponPort)) {
    if (!onu.acsDevice?.deviceId) return send(token, chatId, `Reboot s'mbështetet për këtë ONU EPON (pa ACS).`);
    await enqueue(JOB_NAMES.rebootOnu, { onuId: onu.id, deviceId: onu.acsDevice.deviceId });
    return send(token, chatId, `🔄 Reboot (ACS) u dërgua për <b>${name}</b>.`);
  }
  await enqueue(JOB_NAMES.rebootOnuCli, { oltId: onu.oltId, onuId: onu.id, ponPort: onu.ponPort });
  await send(token, chatId, `🔄 Reboot (OLT) u dërgua për <b>${name}</b> — ONU-ja riniset (~1-2 min) dhe pastaj informon ACS-në, kështu aplikohen komandat në pritje.`);
}

function fmtUptime(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function cmdSignal(token: string, chatId: number, arg: string) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  const s = onu.signals[0];
  if (!s && onu.lastOnuRx == null) return send(token, chatId, `Nuk ka sinjal të regjistruar për <b>${esc(onu.name || onu.ponPort)}</b>.`);
  await send(
    token,
    chatId,
    [
      `📶 <b>${esc(onu.name || onu.ponPort)}</b> — sinjali`,
      `${bandEmoji(onu.lastSignalLevel)} ONU RX: ${s?.onuRx ?? onu.lastOnuRx ?? "—"} dBm`,
      `ONU TX: ${s?.onuTx ?? "—"} dBm`,
      `OLT RX: ${s?.oltRx ?? "—"} dBm · OLT TX: ${s?.oltTx ?? "—"} dBm`,
      s?.attenUp != null || s?.attenDown != null ? `Att: ↑${s?.attenUp ?? "—"} / ↓${s?.attenDown ?? "—"} dB` : "",
      s?.recordedAt ? `🕑 ${new Date(s.recordedAt).toLocaleString("sq-AL")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function cmdWifiInfo(token: string, chatId: number, arg: string) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  const a = onu.acsDevice;
  if (!a) return send(token, chatId, `<b>${esc(onu.name || onu.ponPort)}</b> s'ka ACS/TR-069.`);
  const st = (on: boolean | null) => (on == null ? "—" : on ? "🟢 ndezur" : "🔴 fikur");
  await send(
    token,
    chatId,
    [
      `📡 <b>${esc(onu.name || onu.ponPort)}</b> — WiFi`,
      `2.4G: ${esc(a.ssid2g || "—")} · ${st(a.wifiEnabled2g)}`,
      `5G: ${esc(a.ssid5g || "—")} · ${st(a.wifiEnabled5g)}`,
      "",
      "Menaxho: <code>/wifi_on</code> · <code>/wifi_off</code> · SSID/pass nga paneli.",
    ].join("\n")
  );
}

async function cmdLan(token: string, chatId: number, arg: string) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  const hosts = (Array.isArray(onu.acsDevice?.lanHosts) ? onu.acsDevice!.lanHosts : []) as Array<{
    hostname?: string | null;
    mac?: string | null;
    ip?: string | null;
    active?: boolean;
  }>;
  if (!hosts.length) return send(token, chatId, `Asnjë pajisje LAN në mirror për <b>${esc(onu.name || onu.ponPort)}</b>.`);
  const lines = hosts.map((h) => `${h.active ? "🟢" : "⚪"} ${esc(h.hostname || "—")} · <code>${esc(h.ip || "—")}</code> · <code>${esc(h.mac || "—")}</code>`);
  await send(token, chatId, `🖧 <b>${esc(onu.name || onu.ponPort)}</b> — pajisjet LAN (${hosts.length})\n${lines.join("\n")}`);
}

async function cmdCpe(token: string, chatId: number, arg: string) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  const a = onu.acsDevice;
  if (!a) return send(token, chatId, `<b>${esc(onu.name || onu.ponPort)}</b> s'ka ACS/TR-069.`);
  await send(
    token,
    chatId,
    [
      `📦 <b>${esc(onu.name || onu.ponPort)}</b> — CPE`,
      `Model: ${esc(a.modelName || a.productClass || "—")}`,
      `Firmware: ${esc(a.softwareVersion || "—")}`,
      `WAN: <code>${esc(a.wanIp || "—")}</code>${a.wanMode ? ` · ${esc(a.wanMode)}` : ""}`,
      `Uptime: ${fmtUptime(a.uptimeSec)}`,
      a.lastInform ? `Last inform: ${new Date(a.lastInform).toLocaleString("sq-AL")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function cmdOlts(token: string, chatId: number) {
  const olts = await prisma.olt.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } });
  if (!olts.length) return send(token, chatId, "Asnjë OLT.");
  const counts = await prisma.onu.groupBy({ by: ["oltId", "state"], _count: { _all: true } });
  const workingByOlt = new Map<number, number>();
  const totalByOlt = new Map<number, number>();
  for (const c of counts) {
    totalByOlt.set(c.oltId, (totalByOlt.get(c.oltId) ?? 0) + c._count._all);
    if (c.state === "working") workingByOlt.set(c.oltId, c._count._all);
  }
  const lines = olts.map(
    (o) => `${o.status === "online" ? "🟢" : "🔴"} <b>${esc(o.name)}</b> — ${workingByOlt.get(o.id) ?? 0}/${totalByOlt.get(o.id) ?? 0} online`
  );
  await send(token, chatId, `<b>🖧 OLT-të (${olts.length})</b>\n${lines.join("\n")}`);
}

async function cmdOffline(token: string, chatId: number, arg: string) {
  const where: { state: { not: string }; olt?: { name: { contains: string; mode: "insensitive" } } } = { state: { not: "working" } };
  if (arg) where.olt = { name: { contains: arg, mode: "insensitive" } };
  const [count, list] = await Promise.all([
    prisma.onu.count({ where }),
    prisma.onu.findMany({ where, include: { olt: { select: { name: true } } }, take: 15, orderBy: { name: "asc" } }),
  ]);
  if (!count) return send(token, chatId, arg ? `✅ Asnjë ONU offline te "${esc(arg)}".` : "✅ Asnjë ONU offline.");
  const lines = list.map((o) => `🔴 ${esc(o.name || o.ponPort)} · ${esc(o.olt?.name ?? "")}`);
  const more = count > list.length ? `\n… +${count - list.length} të tjera` : "";
  await send(token, chatId, `<b>ONU offline (${count})</b>${arg ? ` · ${esc(arg)}` : ""}\n${lines.join("\n")}${more}`);
}

async function cmdIp(token: string, chatId: number, arg: string) {
  if (!arg) return send(token, chatId, "Përdorimi: <code>/ip 10.0.0.5</code>");
  const hits = await prisma.onu.findMany({
    where: { OR: [{ mgmtIp: arg }, { acsDevice: { wanIp: arg } }] },
    include: { olt: { select: { id: true, name: true } }, acsDevice: true, signals: { orderBy: { recordedAt: "desc" }, take: 1 } },
    take: 4,
  });
  if (!hits.length) return send(token, chatId, `S'u gjet ONU me IP <code>${esc(arg)}</code>.`);
  await send(token, chatId, hits.map(fmtOnu).join("\n\n"));
}

async function cmdRefresh(token: string, chatId: number, arg: string) {
  const onu = await resolveOne(token, chatId, arg);
  if (!onu) return;
  if (!onu.serial) return send(token, chatId, `<b>${esc(onu.name || onu.ponPort)}</b> s'ka serial — s'rifreskohet nga ACS.`);
  await enqueue(JOB_NAMES.acsRefresh, { onuId: onu.id, serial: onu.serial });
  await send(token, chatId, `🔄 Rifreskim ACS u dërgua për <b>${esc(onu.name || onu.ponPort)}</b>.`);
}

async function handleCommand(token: string, chatId: number, text: string) {
  const [raw, ...rest] = text.split(/\s+/);
  const cmd = (raw ?? "").toLowerCase().replace(/@.*$/, "");
  const arg = rest.join(" ").trim();
  switch (cmd) {
    case "/start":
    case "/help":
      return send(token, chatId, HELP);
    case "/onu":
    case "/kerko":
      return cmdOnu(token, chatId, arg);
    case "/alarms":
    case "/alarme":
      return cmdAlarms(token, chatId);
    case "/status":
      return cmdStatus(token, chatId);
    case "/olt":
      return cmdOlt(token, chatId, arg);
    case "/olts":
      return cmdOlts(token, chatId);
    case "/offline":
      return cmdOffline(token, chatId, arg);
    case "/signal":
    case "/sinjal":
      return cmdSignal(token, chatId, arg);
    case "/wifi":
      return cmdWifiInfo(token, chatId, arg);
    case "/lan":
      return cmdLan(token, chatId, arg);
    case "/cpe":
      return cmdCpe(token, chatId, arg);
    case "/ip":
      return cmdIp(token, chatId, arg);
    case "/refresh":
      return cmdRefresh(token, chatId, arg);
    case "/wifi_on":
      return cmdWifi(token, chatId, arg, true);
    case "/wifi_off":
      return cmdWifi(token, chatId, arg, false);
    case "/reboot":
      return cmdReboot(token, chatId, arg);
    default:
      // Bare text (no leading slash) → treat as an ONU search, so an operator can just type
      // a client name/serial without remembering /onu.
      if (cmd && !cmd.startsWith("/")) return cmdOnu(token, chatId, text.trim());
      return send(token, chatId, "Komandë e panjohur. Shkruaj /help");
  }
}

export async function startTelegramBot(): Promise<void> {
  log.info("telegram bot poller starting");
  for (;;) {
    try {
      const { enabled, config } = await getIntegrationSecrets("telegram");
      const cfg = config as TelegramConfig;
      const token = cfg?.botToken;
      if (!enabled || !token) {
        await sleep(15_000);
        continue;
      }
      const allow = authorizedChats(cfg);
      const offset = Number(await kv.get(OFFSET_KEY)) || 0;
      const res = await fetch(api(token, `getUpdates?timeout=30&offset=${offset}`)).catch(() => null);
      if (!res || !res.ok) {
        await sleep(3_000);
        continue;
      }
      const data = (await res.json()) as { result?: Array<{ update_id: number; message?: { text?: string; chat?: { id: number } } }> };
      for (const u of data.result ?? []) {
        await kv.set(OFFSET_KEY, String(u.update_id + 1));
        const msg = u.message;
        const chatId = msg?.chat?.id;
        if (!msg?.text || chatId == null) continue;
        if (!allow.has(String(chatId))) {
          log.warn({ chatId }, "telegram bot: unauthorized chat ignored");
          continue;
        }
        await handleCommand(token, chatId, msg.text.trim()).catch((e) =>
          send(token, chatId, "⚠️ Gabim: " + esc(String(e?.message ?? e)))
        );
      }
    } catch (err) {
      log.error({ err: String(err) }, "telegram bot loop error");
      await sleep(5_000);
    }
  }
}
