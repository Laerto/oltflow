import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const k of [
    "name",
    "eventType",
    "severityMin",
    "enabled",
    "scopeAll",
    "oltIds",
    "channels",
    "behavior",
    "quietStart",
    "quietEnd",
    "escalateAfterMin",
  ]) {
    if (body[k] !== undefined) data[k] = body[k];
  }

  const rule = await prisma.notificationRule.update({ where: { id }, data });
  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "notification_rule_update",
        result: "success",
        payload: { id, ...data },
      },
    })
    .catch(() => {});
  return NextResponse.json({ rule });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;
  const id = Number((await params).id);
  await prisma.notificationRule.delete({ where: { id } }).catch(() => {});
  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "notification_rule_delete",
        result: "success",
        payload: { id },
      },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
