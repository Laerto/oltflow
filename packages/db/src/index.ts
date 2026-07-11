import { PrismaClient, Prisma } from "@prisma/client";
import type { Olt, Onu, Signal, User, AuditLog, Job, Alarm, Session, Setting } from "@prisma/client";

export { prisma } from "./client.js";

// Named (not wildcard) re-exports: `export *` from a CJS module whose exports are
// constructed dynamically (as @prisma/client's are) isn't reliably statically
// analyzable by bundlers — it broke Turbopack resolution of this entire package.
export { PrismaClient, Prisma };
export type { Olt, Onu, Signal, User, AuditLog, Job, Alarm, Session, Setting };

export {
  SETTING_KEYS,
  SETTING_DEFAULTS,
  getSetting,
  getNumberSetting,
  getStringSetting,
  getBooleanSetting,
  getSignalThresholds,
  setSetting,
  ensureDefaultSettings,
  invalidateSettingsCache,
  type SettingKey,
} from "./settings.js";

export {
  openAlarm,
  clearAlarm,
  clearAlarmsExcept,
  openAlarms,
  type AlarmType,
  type AlarmSeverity,
  type OpenAlarmInput,
} from "./alarms.js";

export {
  getIntegration,
  getIntegrationSecrets,
  saveIntegration,
  setIntegrationStatus,
  listIntegrations,
  redactConfig,
  invalidateIntegrationCache,
  type IntegrationId,
  type TelegramConfig,
  type SmtpConfig,
  type WebhookConfig,
  type WhatsappConfig,
  type GenieacsConfig,
  type RadiusConfig,
} from "./integrations.js";
