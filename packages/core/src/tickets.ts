import { z } from "zod";

export const TICKET_STATUSES = ["open", "assigned", "in_progress", "resolved", "verified", "reopened"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CATEGORIES = ["signal_high", "offline", "pppoe", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  signal_high: "Sinjal i dobët",
  offline: "Offline / LOS",
  pppoe: "PPPoE / Lidhje",
  other: "Tjetër",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Hapur",
  assigned: "Caktuar",
  in_progress: "Në riparim",
  resolved: "Përfunduar",
  verified: "Verifikuar",
  reopened: "Rihapur",
};

/** Statuses still needing work (office worklist / technician queue). */
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["open", "assigned", "in_progress", "resolved", "reopened"];

export const createTicketSchema = z.object({
  onuId: z.coerce.number().int().positive(),
  category: z.enum(TICKET_CATEGORIES),
  title: z.string().trim().min(1, "Titulli është i detyrueshëm").max(140),
  description: z.string().trim().max(2000).optional(),
  assignedToId: z.coerce.number().int().positive().optional(), // optionally assign a technician on open
});

export const assignTicketSchema = z.object({
  assignedToId: z.coerce.number().int().positive().nullable(),
});

/** Technician/office actions that advance the repair workflow. */
export const TICKET_ACTIONS = ["start", "resolve", "verify", "reopen"] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

export const ticketActionSchema = z.object({
  action: z.enum(TICKET_ACTIONS),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type TicketActionInput = z.infer<typeof ticketActionSchema>;

/** Target status for each workflow action (guarded against the current state in the route). */
export function nextStatusForAction(action: TicketAction): TicketStatus {
  switch (action) {
    case "start":
      return "in_progress";
    case "resolve":
      return "resolved";
    case "verify":
      return "verified";
    case "reopen":
      return "reopened";
  }
}

/** Which actions are valid from a given status (drives which buttons the UI shows). */
export function allowedActions(status: string): TicketAction[] {
  switch (status) {
    case "open":
    case "assigned":
    case "reopened":
      return ["start"];
    case "in_progress":
      return ["resolve"];
    case "resolved":
      return ["verify", "reopen"];
    default:
      return [];
  }
}
