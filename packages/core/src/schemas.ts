import { z } from "zod";
import { ONU_TYPES, TCONT_PROFILES, EPON_ONU_TYPES, DEFAULT_VLAN_ID, DEFAULT_ONU_NAME, DEFAULT_TRAFFIC_PROFILE, DEFAULT_EPON_VLAN_ID } from "./onu-constants.js";

export const ponPortString = z
  .string()
  .regex(/^gpon-onu_\d+\/\d+\/\d+:\d+$/, "Format: gpon-onu_1/15/1:1");

export const eponPonPortString = z
  .string()
  .regex(/^epon-onu_\d+\/\d+\/\d+:\d+$/, "Format: epon-onu_1/2/3:1");

// ── CLI-safe field validators ────────────────────────────────────────────────
// Every field below is interpolated verbatim into a ZTE CLI command that the worker sends
// to the OLT one-command-per-line (see @oltflow/adapters). A newline/CR embedded in a value
// would be split by the OLT into EXTRA commands — command injection into live network gear.
// So each CLI-bound field is constrained here: structured tokens get a strict allow-list;
// free-text fields at minimum forbid whitespace/control chars (\p{Cc} = all control chars,
// which includes \n \r \t). The CLI transport enforces a second, catch-all layer that refuses
// any command containing a newline (assertSingleCliLine in @oltflow/adapters).

/** ONU serial: hex/alnum plus dot & dash (e.g. ZTEGCF1234, ZTEG.C0FF.EE01). No whitespace. */
const onuSerialField = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.\-]+$/, "Serial i pavlefshëm");
/** EPON MAC in the dotted form the ZTE `mac` command expects, e.g. bcf8.8b45.ebcc. */
const macField = z
  .string()
  .trim()
  .regex(/^[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}$/, "MAC i pavlefshëm (format: bcf8.8b45.ebcc)");
/** Traffic/SLA profile name: a single bareword token. */
const profileField = z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9._\-]+$/, "Profil i pavlefshëm");
/** PPPoE username/password: a single CLI token — symbols allowed, but no whitespace or
 * control chars (a space would already break the `pppoe ... user X password Y` command). */
const pppoeField = z.string().min(1).max(64).regex(/^[^\s\p{Cc}]+$/u, "Karaktere të palejuara");
/** ONU display name: printable, spaces allowed, but no newline/control chars. */
const onuNameField = z.string().trim().min(1).max(48).regex(/^[^\p{Cc}]+$/u, "Karaktere të palejuara në emër");

export const createOltSchema = z.object({
  name: z.string().min(1, "Emri është i detyrueshëm"),
  ip: z.string().min(1, "IP është e detyrueshme"),
  port: z.coerce.number().int().positive().default(23),
  protocol: z.enum(["telnet", "ssh"]).default("telnet"),
  username: z.string().min(1),
  password: z.string().min(1),
  enablePassword: z.string().optional(),
  location: z.string().optional().default(""),
  model: z.string().optional(),
  slots: z.array(z.number().int().positive()).optional(),
  eponSlots: z.array(z.number().int().positive()).optional(),
  snmpCommunity: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export const updateOltSchema = z.object({
  name: z.string().min(1).optional(),
  ip: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  protocol: z.enum(["telnet", "ssh"]).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(), // omit to keep the existing encrypted password
  enablePassword: z.string().optional(), // omit to keep existing; empty string clears it
  location: z.string().optional(),
  model: z.string().optional(),
  slots: z.array(z.number().int().positive()).optional(),
  eponSlots: z.array(z.number().int().positive()).optional(),
  snmpCommunity: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export const authorizeOnuSchema = z.object({
  oltId: z.coerce.number().int().positive(),
  onuSerial: onuSerialField,
  ponPort: ponPortString,
  onuName: onuNameField.optional().default(DEFAULT_ONU_NAME),
  onuType: z.enum(ONU_TYPES).optional().default("F660"),
  tcontProfile: z.enum(TCONT_PROFILES).optional().default("SMARTOLT-1G-UP"),
  trafficProfile: profileField.optional().default(DEFAULT_TRAFFIC_PROFILE),
  vlanId: z.coerce.number().int().positive().optional().default(DEFAULT_VLAN_ID),
});

export const authorizeEponSchema = z.object({
  oltId: z.coerce.number().int().positive(),
  ponPort: eponPonPortString,
  onuMac: macField,
  onuType: z.enum(EPON_ONU_TYPES),
  onuName: onuNameField.optional().default(DEFAULT_ONU_NAME),
  vlanId: z.coerce.number().int().positive().optional().default(DEFAULT_EPON_VLAN_ID),
});

export const pppoeSchema = z.object({
  oltId: z.coerce.number().int().positive(),
  ponPort: ponPortString,
  pppoeUsername: pppoeField,
  pppoePassword: pppoeField,
  vlanId: z.coerce.number().int().positive().optional().default(DEFAULT_VLAN_ID),
});

export const authorizeAndPppoeSchema = authorizeOnuSchema.extend({
  pppoeUsername: pppoeField,
  pppoePassword: pppoeField,
});

export const replaceOnuSchema = z.object({
  onuId: z.coerce.number().int().positive(),
  onuSerial: onuSerialField,
  onuType: z.enum(ONU_TYPES).optional().default("F660"),
});

export const rebootOnuSchema = z.object({
  onuId: z.coerce.number().int().positive(),
  deviceId: z.string().min(1),
});

export const wifiUpdateSchema = z.object({
  onuId: z.coerce.number().int().positive(),
  deviceId: z.string().min(1),
  ssid2g: z.string().optional(),
  pass2g: z.string().optional(),
  ssid5g: z.string().optional(),
  pass5g: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type CreateOltInput = z.infer<typeof createOltSchema>;
export type UpdateOltInput = z.infer<typeof updateOltSchema>;
export type AuthorizeOnuInput = z.infer<typeof authorizeOnuSchema>;
export type AuthorizeEponInput = z.infer<typeof authorizeEponSchema>;
export type PppoeInput = z.infer<typeof pppoeSchema>;
export type AuthorizeAndPppoeInput = z.infer<typeof authorizeAndPppoeSchema>;
export type WifiUpdateInput = z.infer<typeof wifiUpdateSchema>;
export type ReplaceOnuInput = z.infer<typeof replaceOnuSchema>;
export type RebootOnuInput = z.infer<typeof rebootOnuSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
