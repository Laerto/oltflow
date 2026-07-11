/** Event types the notification engine understands (Phase 3). */
export const EVENT_TYPES = [
  "onu.offline",
  "onu.online",
  "onu.signal.warning",
  "onu.signal.danger",
  "onu.expiry",
  "olt.unreachable",
  "olt.recovered",
  "pon.outage",
  "ticket.opened",
  "ticket.assigned",
  "ticket.resolved",
  "backup.completed",
  "backup.failed",
  "system.worker-down",
  "uncfg.new",
  "user.signup",
  "acs.not_registered",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const CHANNEL_TYPES = ["telegram", "smtp", "webhook", "whatsapp"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const BEHAVIORS = ["once_until_clear", "daily", "every"] as const;
export type NotifyBehavior = (typeof BEHAVIORS)[number];

export interface ChannelTarget {
  type: ChannelType;
  /** Override default chat (Telegram). */
  chatId?: string;
  /** Email recipients. */
  to?: string[];
  /** WhatsApp E.164 number. */
  phone?: string;
}

export interface NotifyEvent {
  eventType: EventType | string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string; // plain or HTML for Telegram
  alarmKey?: string;
  oltId?: number | null;
  onuId?: number | null;
  detail?: Record<string, unknown>;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  "onu.offline": "ONU offline",
  "onu.online": "ONU online (recovery)",
  "onu.signal.warning": "Sinjal i dobët",
  "onu.signal.danger": "Sinjal në rrezik",
  "onu.expiry": "Skadencë klienti",
  "olt.unreachable": "OLT pa lidhje",
  "olt.recovered": "OLT rikuperuar",
  "pon.outage": "PON outage",
  "ticket.opened": "Ticket u hap",
  "ticket.assigned": "Ticket u caktua",
  "ticket.resolved": "Ticket u zgjidh",
  "backup.completed": "Backup OK",
  "backup.failed": "Backup dështoi",
  "system.worker-down": "Worker down",
  "uncfg.new": "ONU e re unconfigured",
  "user.signup": "Signup i ri",
  "acs.not_registered": "ONU nuk u regjistrua në ACS",
};

export const INTEGRATION_CATALOGUE = [
  { id: "telegram", label: "Telegram", description: "Bot API — alarme dhe ticket DM", group: "notify" },
  { id: "whatsapp", label: "WhatsApp", description: "Meta Cloud API (templates)", group: "notify" },
  { id: "smtp", label: "Email (SMTP)", description: "Gmail app password / SMTP", group: "notify" },
  { id: "webhook", label: "Webhooks", description: "HMAC-signed outbound events", group: "notify" },
  { id: "genieacs", label: "GenieACS", description: "TR-069 NBI + ACS URL", group: "device" },
  { id: "radius", label: "RADIUS Manager", description: "MySQL read-only enrichment", group: "device" },
  { id: "winbox", label: "Winbox handler", description: "One-click Mikrotik launch", group: "device" },
] as const;

export type IntegrationId = (typeof INTEGRATION_CATALOGUE)[number]["id"];
