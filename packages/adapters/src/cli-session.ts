/**
 * Common interface for an interactive CLI session against a ZTE OLT, whether
 * reached over Telnet or SSH. zte-c300.ts's command sequences are written
 * against this interface so the transport is a pluggable concern (see
 * session-factory.ts), not duplicated per-protocol logic.
 */
export interface CliSession {
  write(data: string): void;
  /** Waits until `pattern` appears in the accumulated buffer, then drains and returns everything read so far. */
  readUntil(pattern: string, timeoutMs?: number): Promise<string>;
  /** Writes `cmd`, waits `delayMs`, then drains and returns whatever arrived (mirrors the old Python telnetlib polling style). */
  sendCommand(cmd: string, delayMs?: number): Promise<string>;
  close(): void;
}

/**
 * Catch-all guard against CLI command injection into the OLT. Every command is built and
 * sent one-per-line — the transport appends the single trailing "\n" itself — so a value
 * arriving here with an embedded newline/CR means untrusted input leaked through the schema
 * layer and would be split by the OLT into extra commands. Refuse to send it. Field-level
 * validation (see @oltflow/core schemas) is the first line; this is the last.
 */
export function assertSingleCliLine(data: string): void {
  if (/[\r\n]/.test(data)) {
    throw new Error("Komandë CLI e pavlefshme: përmban karakter rreshti të ri (injektim i mundshëm)");
  }
}
