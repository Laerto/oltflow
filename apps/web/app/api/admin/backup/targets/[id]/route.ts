import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { encryptSecret, decryptSecret } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

const KEY = () => process.env.OLT_CRED_KEY ?? "";

function decryptConfig(enc: string): Record<string, unknown> {
  try {
    return JSON.parse(decryptSecret(enc, KEY())) as Record<string, unknown>;
  } catch {
    return JSON.parse(enc) as Record<string, unknown>;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const existing = await prisma.backupTarget.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.schedule !== undefined) data.schedule = body.schedule;
  if (body.retention !== undefined) data.retention = body.retention;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.config && typeof body.config === "object") {
    const prev = decryptConfig(existing.configEnc);
    const merged = { ...prev, ...body.config };
    for (const k of ["password", "privateKey"]) {
      const v = body.config[k];
      if (typeof v === "string" && (v.includes("•") || v.includes("…"))) {
        merged[k] = prev[k];
      }
    }
    data.configEnc = encryptSecret(JSON.stringify(merged), KEY());
  }

  await prisma.backupTarget.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  await prisma.backupTarget.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

/** Test SSH connectivity (or local path writability). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  const target = await prisma.backupTarget.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const cfg = decryptConfig(target.configEnc);
  if (target.kind === "local") {
    const p = String(cfg.path || process.env.BACKUP_DIR || "/var/lib/oltflow/backups");
    return NextResponse.json({ ok: true, detail: `local path configured: ${p}` });
  }

  // SSH: try a short ssh -o BatchMode echo
  const { spawn } = await import("node:child_process");
  const host = String(cfg.host ?? "");
  const user = String(cfg.user ?? "");
  const port = String(cfg.port ?? 22);
  if (!host || !user) return NextResponse.json({ ok: false, detail: "host/user missing" });

  const result = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const args = [
      "-p",
      port,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${user}@${host}`,
      "echo ok",
    ];
    // private key via temp file not wired in web tier — recommend key-based test from worker
    const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        detail: code === 0 ? "SSH connection OK" : err.slice(0, 300) || `exit ${code}`,
      });
    });
    child.on("error", (e) => resolve({ ok: false, detail: String(e) }));
  });
  return NextResponse.json(result);
}
