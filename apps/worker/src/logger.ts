/**
 * Structured JSON logger for the worker. Uses pino when available; falls back to
 * console JSON so boots never fail on a missing optional dep.
 * Also mirrors lines into a Redis ring buffer for /admin/logs.
 */

import { kv } from "./kv.js";

type LogFn = (obj: Record<string, unknown> | string, msg?: string) => void;

interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  child: (bindings: Record<string, unknown>) => Logger;
}

const LOG_KEY = "oltflow:logs";
const LOG_RING = 500;

function format(level: string, obj: Record<string, unknown> | string, msg?: string): string {
  const base =
    typeof obj === "string"
      ? { level, msg: obj, time: new Date().toISOString(), service: "oltflow-worker" }
      : {
          level,
          time: new Date().toISOString(),
          service: "oltflow-worker",
          ...obj,
          ...(msg ? { msg } : {}),
        };
  return JSON.stringify(base);
}

function pushRing(line: string): void {
  // Fire-and-forget — logging must never block or throw into app code.
  void kv
    .multi()
    .lpush(LOG_KEY, line)
    .ltrim(LOG_KEY, 0, LOG_RING - 1)
    .exec()
    .catch(() => {});
}

function makeConsoleLogger(bindings: Record<string, unknown> = {}): Logger {
  const wrap =
    (level: string, fn: (...a: unknown[]) => void): LogFn =>
    (obj, msg) => {
      const payload =
        typeof obj === "string" ? { ...bindings, msg: obj } : { ...bindings, ...obj };
      const line = format(level, payload, msg);
      fn(line);
      pushRing(line);
    };
  return {
    info: wrap("info", console.log),
    warn: wrap("warn", console.warn),
    error: wrap("error", console.error),
    debug: wrap("debug", console.debug),
    child: (b) => makeConsoleLogger({ ...bindings, ...b }),
  };
}

function wrapPino(instance: {
  info: (o: object | string, m?: string) => void;
  warn: (o: object | string, m?: string) => void;
  error: (o: object | string, m?: string) => void;
  debug: (o: object | string, m?: string) => void;
  child: (b: object) => unknown;
}): Logger {
  const call =
    (level: string, fn: (o: object | string, m?: string) => void): LogFn =>
    (obj, msg) => {
      if (typeof obj === "string") {
        fn(obj);
        pushRing(format(level, obj));
      } else {
        const m = msg ?? (typeof obj.msg === "string" ? obj.msg : undefined);
        fn(obj, m);
        pushRing(format(level, obj, m));
      }
    };
  return {
    info: call("info", instance.info.bind(instance)),
    warn: call("warn", instance.warn.bind(instance)),
    error: call("error", instance.error.bind(instance)),
    debug: call("debug", instance.debug.bind(instance)),
    child: (b) => wrapPino(instance.child(b) as typeof instance),
  };
}

// Synchronous console logger immediately; upgrade to pino when available.
export let log: Logger = makeConsoleLogger();

export async function initLogger(): Promise<void> {
  try {
    const pino = (await import("pino")).default;
    const root = pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "oltflow-worker" },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
    log = wrapPino(root as Parameters<typeof wrapPino>[0]);
  } catch {
    // pino missing — keep console JSON logger
  }
}
