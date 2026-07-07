import { Socket } from "node:net";
import { assertSingleCliLine, type CliSession } from "./cli-session.js";

/**
 * Minimal raw-TCP "telnet" session matching Python telnetlib's usage in
 * main.py/sync_service.py: no IAC/option negotiation, just byte streaming
 * with read_until()/write()/read_very_eager() semantics. ZTE C300/C320
 * doesn't require real telnet negotiation for this prompt-scraping flow.
 */
export class TelnetSession implements CliSession {
  private socket: Socket;
  private buffer = "";
  private closed = false;

  private constructor(socket: Socket) {
    this.socket = socket;
    this.socket.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
    });
    this.socket.on("close", () => {
      this.closed = true;
    });
    this.socket.on("error", () => {
      this.closed = true;
    });
  }

  static connect(host: string, port: number, timeoutMs = 15_000): Promise<TelnetSession> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const onError = (err: Error) => {
        socket.destroy();
        reject(err);
      };
      socket.setTimeout(timeoutMs, () => onError(new Error("Telnet connection timeout")));
      socket.once("error", onError);
      socket.connect(port, host, () => {
        socket.setTimeout(0);
        socket.removeListener("error", onError);
        resolve(new TelnetSession(socket));
      });
    });
  }

  /** Waits until `pattern` appears in the accumulated buffer, then drains and returns everything read so far. */
  async readUntil(pattern: string, timeoutMs = 10_000): Promise<string> {
    const start = Date.now();
    while (!this.buffer.includes(pattern)) {
      if (this.closed) break;
      if (Date.now() - start > timeoutMs) break;
      await sleep(50);
    }
    const out = this.buffer;
    this.buffer = "";
    return out;
  }

  write(data: string) {
    assertSingleCliLine(data);
    if (!this.closed) this.socket.write(data + "\n");
  }

  /** Mirrors Python's `time.sleep(delay); read_very_eager()` — wait, then drain whatever arrived. */
  async sendCommand(cmd: string, delayMs = 1200): Promise<string> {
    this.write(cmd);
    await sleep(delayMs);
    const out = this.buffer;
    this.buffer = "";
    return out;
  }

  close() {
    if (!this.closed) {
      this.socket.destroy();
      this.closed = true;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
