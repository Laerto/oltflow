/**
 * Structured JSON logger for the web app. Console-JSON by default; upgrades to
 * pino when the package is present.
 */

type LogFn = (obj: Record<string, unknown> | string, msg?: string) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  child: (bindings: Record<string, unknown>) => Logger;
}

function format(level: string, obj: Record<string, unknown> | string, msg?: string): string {
  const base =
    typeof obj === "string"
      ? { level, msg: obj, time: new Date().toISOString(), service: "oltflow-web" }
      : { level, time: new Date().toISOString(), service: "oltflow-web", ...obj, ...(msg ? { msg } : {}) };
  return JSON.stringify(base);
}

function makeConsoleLogger(bindings: Record<string, unknown> = {}): Logger {
  const wrap =
    (level: string, fn: (...a: unknown[]) => void): LogFn =>
    (obj, msg) => {
      const payload =
        typeof obj === "string" ? { ...bindings, msg: obj } : { ...bindings, ...obj };
      fn(format(level, payload, msg));
    };
  return {
    info: wrap("info", console.log),
    warn: wrap("warn", console.warn),
    error: wrap("error", console.error),
    debug: wrap("debug", console.debug),
    child: (b) => makeConsoleLogger({ ...bindings, ...b }),
  };
}

export const log: Logger = makeConsoleLogger();
