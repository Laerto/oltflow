import { z } from "zod";

export const SPLITTER_RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"] as const;
export type SplitterRatio = (typeof SPLITTER_RATIOS)[number];

export const FIBER_KINDS = ["backbone", "distribution", "drop"] as const;
export type FiberKind = (typeof FIBER_KINDS)[number];

export const FIBER_KIND_LABELS: Record<FiberKind, string> = {
  backbone: "Backbone",
  distribution: "Shpërndarje",
  drop: "Drop",
};

/** How many ONU ports a ratio provides (for capacity/utilisation). */
export function splitterCapacity(ratio: string): number {
  const n = Number(ratio.split(":")[1]);
  return Number.isFinite(n) ? n : 0;
}

export const createSplitterSchema = z.object({
  name: z.string().trim().min(1, "Emri është i detyrueshëm").max(80),
  ratio: z.enum(SPLITTER_RATIOS).optional().default("1:8"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  oltId: z.coerce.number().int().positive().optional().nullable(),
  ponPort: z.string().max(64).optional().nullable(),
  parentSplitterId: z.coerce.number().int().positive().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});
// Explicit (not .partial()) so a PATCH that omits `ratio` doesn't re-apply its default.
export const updateSplitterSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  ratio: z.enum(SPLITTER_RATIOS).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  oltId: z.coerce.number().int().positive().optional().nullable(),
  ponPort: z.string().max(64).optional().nullable(),
  parentSplitterId: z.coerce.number().int().positive().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

const latLng = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
export const createFiberSchema = z.object({
  name: z.string().trim().max(80).optional().nullable(),
  kind: z.enum(FIBER_KINDS).optional().default("distribution"),
  path: z.array(latLng).min(2, "Rruga duhet të ketë të paktën 2 pika"),
  oltId: z.coerce.number().int().positive().optional().nullable(),
  cores: z.coerce.number().int().positive().optional().nullable(),
  lengthM: z.coerce.number().int().nonnegative().optional().nullable(),
});

export type CreateSplitterInput = z.infer<typeof createSplitterSchema>;
export type UpdateSplitterInput = z.infer<typeof updateSplitterSchema>;
export type CreateFiberInput = z.infer<typeof createFiberSchema>;
