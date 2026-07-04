// Browser-safe mirror of core/roles.ts (importing @oltflow/core client-side would pull in
// node:crypto). This only tailors the UI — the server always enforces the real check.
export type Role = "admin" | "support" | "technician" | "viewer";

const RANK: Record<string, number> = { admin: 3, support: 2, operator: 2, technician: 1, viewer: 1 };
export const roleRank = (role: string | null | undefined): number => (role && RANK[role]) || 1;

export const can = {
  view: (role: string | null | undefined) => roleRank(role) >= 1,
  operate: (role: string | null | undefined) => roleRank(role) >= 2, // support + admin
  admin: (role: string | null | undefined) => roleRank(role) >= 3,
  technician: (role: string | null | undefined) => role === "technician",
  // Ticket work: the assigned technician, or office (support/admin).
  workTickets: (role: string | null | undefined) => role === "technician" || roleRank(role) >= 2,
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin (i plotë)",
  support: "Support (operacione)",
  technician: "Teknik (riparime)",
  viewer: "Vetëm shikim",
};
