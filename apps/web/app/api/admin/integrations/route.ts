import { NextResponse } from "next/server";
import { listIntegrations } from "@oltflow/db";
import { INTEGRATION_CATALOGUE } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

export async function GET() {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const rows = await listIntegrations();
  const meta = new Map(INTEGRATION_CATALOGUE.map((c) => [c.id, c]));

  return NextResponse.json({
    integrations: rows.map((r) => ({
      ...r,
      label: meta.get(r.id as never)?.label ?? r.id,
      description: meta.get(r.id as never)?.description ?? "",
      group: meta.get(r.id as never)?.group ?? "other",
      lastCheckAt: r.lastCheckAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}
