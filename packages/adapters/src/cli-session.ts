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
