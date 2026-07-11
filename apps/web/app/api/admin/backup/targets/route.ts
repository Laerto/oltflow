import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { encryptSecret, decryptSecret } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

const KEY = () => process.env.OLT_CRED_KEY ?? "";

function redact(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  if (typeof out.password === "string" && out.password) {
    out.password = "••••••••";
    out.passwordSet = true;
  }
  if (typeof out.privateKey === "string" && out.privateKey) {
    out.privateKey = "••••••••";
    out.privateKeySet = true;
  }
  return out;
}

function decryptConfig(enc: string): Record<string, unknown> {
  try {
    return JSON.parse(decryptSecret(enc, KEY())) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(enc) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

export async function GET() {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;

  const targets = await prisma.backupTarget.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json({
    targets: targets.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      schedule: t.schedule,
      retention: t.retention,
      enabled: t.enabled,
      lastRunAt: t.lastRunAt?.toISOString() ?? null,
      config: redact(decryptConfig(t.configEnc)),
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

/** Body: { kind, name, config, schedule?, retention?, enabled? } */
export async function POST(request: Request) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.kind || !body?.name || !body?.config) {
    return NextResponse.json({ error: "kind, name, config required" }, { status: 400 });
  }
  if (!["local", "ssh"].includes(body.kind)) {
    return NextResponse.json({ error: "kind must be local|ssh" }, { status: 400 });
  }
  if (!KEY()) return NextResponse.json({ error: "OLT_CRED_KEY missing" }, { status: 500 });

  const configEnc = encryptSecret(JSON.stringify(body.config), KEY());
  const t = await prisma.backupTarget.create({
    data: {
      kind: body.kind,
      name: String(body.name),
      configEnc,
      schedule: body.schedule ?? null,
      retention: body.retention ?? { keepLast: 7 },
      enabled: body.enabled !== false,
    },
  });
  return NextResponse.json({ target: { id: t.id } });
}
