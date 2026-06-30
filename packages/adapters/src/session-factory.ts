import type { CliSession } from "./cli-session.js";
import { TelnetSession } from "./telnet-session.js";
import { SshSession } from "./ssh-session.js";

export interface SessionCreds {
  host: string;
  port: number;
  protocol: "telnet" | "ssh";
  username: string;
  password: string;
}

/** Opens a transport-level session only — does not perform the ZTE CLI login
 * handshake (Telnet's Username:/Password: scrape vs SSH's protocol-level
 * auth); see zte-c300.ts's login() for that. */
export function connectSession(creds: SessionCreds): Promise<CliSession> {
  if (creds.protocol === "ssh") {
    return SshSession.connect(creds.host, creds.port, creds.username, creds.password);
  }
  return TelnetSession.connect(creds.host, creds.port);
}
