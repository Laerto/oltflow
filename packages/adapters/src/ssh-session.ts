import { Client, type ClientChannel } from "ssh2";
import { assertSingleCliLine, type CliSession } from "./cli-session.js";

/**
 * Interactive-shell SSH session matching the CliSession contract used by
 * zte-c300.ts. SSH auths at the protocol layer (no Username:/Password:
 * prompt scraping needed) but the ZTE CLI still drops the shell into the
 * same `#` prompt once connected, so command sequencing is identical to
 * TelnetSession from that point on.
 */
export class SshSession implements CliSession {
  private buffer = "";
  private closed = false;

  private constructor(
    private client: Client,
    private channel: ClientChannel
  ) {
    channel.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
    });
    channel.on("close", () => {
      this.closed = true;
    });
    channel.on("error", () => {
      this.closed = true;
    });
    client.on("error", () => {
      this.closed = true;
    });
  }

  static connect(
    host: string,
    port: number,
    username: string,
    password: string,
    timeoutMs = 15_000
  ): Promise<SshSession> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const onError = (err: Error) => {
        client.end();
        reject(err);
      };
      client.once("error", onError);
      client.on("ready", () => {
        client.shell((err, channel) => {
          if (err) return onError(err);
          client.removeListener("error", onError);
          resolve(new SshSession(client, channel));
        });
      });
      client.connect({
        host,
        port,
        username,
        password,
        readyTimeout: timeoutMs,
        algorithms: {
          // ZTE C300/C320 SSH stacks are often old firmware — widen accepted
          // algorithms beyond ssh2's modern-only defaults instead of failing
          // the handshake outright.
          kex: [
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group1-sha1",
            "diffie-hellman-group-exchange-sha1",
          ],
          cipher: ["aes128-cbc", "3des-cbc", "aes128-ctr"],
          serverHostKey: ["ssh-rsa", "ssh-dss"],
        },
      });
    });
  }

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
    if (!this.closed) this.channel.write(data + "\n");
  }

  async sendCommand(cmd: string, delayMs = 1200): Promise<string> {
    this.write(cmd);
    await sleep(delayMs);
    const out = this.buffer;
    this.buffer = "";
    return out;
  }

  close() {
    if (!this.closed) {
      this.channel.end();
      this.client.end();
      this.closed = true;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
