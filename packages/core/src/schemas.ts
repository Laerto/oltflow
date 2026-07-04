import { z } from "zod";
import { ONU_TYPES, TCONT_PROFILES, DEFAULT_VLAN_ID, DEFAULT_ONU_NAME, DEFAULT_TRAFFIC_PROFILE, DEFAULT_EPON_VLAN_ID } from "./onu-constants.js";

export const ponPortString = z
  .string()
  .regex(/^gpon-onu_\d+\/\d+\/\d+:\d+$/, "Format: gpon-onu_1/15/1:1");

export const eponPonPortString = z
  .string()
  .regex(/^epon-onu_\d+\/\d+\/\d+:\d+$/, "Format: epon-onu_1/2/3:1");

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
});

export const authorizeOnuSchema = z.object({
  oltId: z.coerce.number().int().positive(),
  onuSerial: z.string().min(1),
  ponPort: ponPortString,
  onuName: z.string().optional().default(DEFAULT_ONU_NAME),
  onuType: z.enum(ONU_TYPES).optional().default("F660"),
  tcontProfile: z.enum(TCONT_PROFILES).optional().default("SMARTOLT-1G-UP"),
  trafficProfile: z.string().optional().default(DEFAULT_TRAFFIC_PROFILE),
  vlanId: z.coerce.number().int().positive().optional().default(DEFAULT_VLAN_ID),
});

export const authorizeEponSchema = z.object({
  oltId: z.coerce.number().int().positive(),
  ponPort: eponPonPortString,
  onuMac: z.string().min(1, "MAC është i detyrueshëm"),
  onuType: z.string().min(1, "Zgjidh tipin e ONU-së"),
  onuName: z.string().optional().default(DEFAULT_ONU_NAME),
  vlanId: z.coerce.number().int().positive().optional().default(DEFAULT_EPON_VLAN_ID),
});

export const pppoeSchema = z.object({
  oltId: z.coerce.number().int().positive(),
  ponPort: ponPortString,
  pppoeUsername: z.string().min(1),
  pppoePassword: z.string().min(1),
  vlanId: z.coerce.number().int().positive().optional().default(DEFAULT_VLAN_ID),
});

export const authorizeAndPppoeSchema = authorizeOnuSchema.extend({
  pppoeUsername: z.string().min(1),
  pppoePassword: z.string().min(1),
});

export const replaceOnuSchema = z.object({
  onuId: z.coerce.number().int().positive(),
  onuSerial: z.string().min(1),
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
