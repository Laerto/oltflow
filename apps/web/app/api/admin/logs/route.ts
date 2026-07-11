import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { requirePerm } from "@/lib/authorize";

const LOG_KEY = "oltflow:logs";

/** Recent structured log lines from the Redis ring buffer (worker pushes here). */
export async function GET(request: Request) {
  const denied = await requirePerm("admin.access");
  if ("error" in denied && denied.error) return denied.error;

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  const level = url.searchParams.get("level"); // info | warn | error | debug

  const raw = await redis.lrange(LOG_KEY, 0, limit - 1).catch(() => [] as string[]);
  let entries: { level?: string; msg?: string; time?: string; [k: string]: unknown }[] = [];
  for (const line of raw) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      entries.push({ msg: line, level: "info" });
    }
  }
  if (level) entries = entries.filter((e) => e.level === level);

  return NextResponse.json({ logs: entries, total: entries.length });
}

export { LOG_KEY };
