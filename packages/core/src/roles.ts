import { z } from "zod";

/** The three access tiers. Higher rank ⊇ every lower rank's abilities.
 * - viewer  (1): read-only — see everything, change nothing.
 * - support (2): day-to-day ops — authorize ONU, PPPoE/VLAN, WiFi, reboot, WAN access.
 * - admin   (3): everything — OLT/ONU delete, users, ACS, billing, audit.
 * "operator" is the legacy default and is treated as support. */
export const ROLES = ["admin", "support", "technician", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<string, number> = {
  admin: 3,
  support: 2,
  operator: 2, // legacy alias for support
  technician: 1, // view-tier for general access; ticket work is a separate capability
  viewer: 1,
};

/** Authenticated but unknown role ⇒ least privilege (read-only). */
export function roleRank(role: string | null | undefined): number {
  return (role && ROLE_RANK[role]) || 1;
}

/** Access tiers used across the authorization matrix (middleware + routes). */
export const TIER = { VIEW: 1, OPERATE: 2, ADMIN: 3 } as const;
export type Tier = (typeof TIER)[keyof typeof TIER];

export function hasTier(role: string | null | undefined, tier: Tier): boolean {
  return roleRank(role) >= tier;
}

// Human labels for the UI.
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin (i plotë)",
  support: "Support (operacione)",
  technician: "Teknik (riparime)",
  viewer: "Vetëm shikim",
};

/** Ticket-work capability: technicians (their assigned tickets) + office (support/admin). */
export function canWorkTickets(role: string | null | undefined): boolean {
  return role === "technician" || roleRank(role) >= 2;
}

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(6).max(200),
  role: z.enum(ROLES),
  // OLTs the user may see/operate. Empty/omitted = all (unrestricted). Ignored for admins.
  oltIds: z.array(z.number().int().positive()).optional(),
  // Telegram chat id for the ticket "ring" (mainly technicians). Empty string clears it.
  telegramChatId: z.string().trim().max(64).optional(),
});

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    role: z.enum(ROLES).optional(),
    password: z.string().min(6).max(200).optional(),
    oltIds: z.array(z.number().int().positive()).optional(),
    telegramChatId: z.string().trim().max(64).optional(),
    /** pending | active | disabled — admin approval of self-signups. */
    status: z.enum(["pending", "active", "disabled"]).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.role !== undefined ||
      v.password !== undefined ||
      v.oltIds !== undefined ||
      v.telegramChatId !== undefined ||
      v.status !== undefined,
    { message: "Asgjë për të ndryshuar" }
  );

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
