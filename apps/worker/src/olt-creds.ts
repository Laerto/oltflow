import { prisma, type Olt } from "@oltflow/db";
import { decryptSecret } from "@oltflow/core";
import type { OltCreds } from "@oltflow/adapters";
import type { SnmpCreds } from "@oltflow/adapters";

const OLT_CRED_KEY = process.env.OLT_CRED_KEY ?? "";

export function toCreds(
  olt: Pick<Olt, "ip" | "port" | "protocol" | "username" | "passwordEnc" | "enablePasswordEnc">
): OltCreds {
  return {
    host: olt.ip,
    port: olt.port,
    protocol: olt.protocol === "ssh" ? "ssh" : "telnet",
    username: olt.username,
    password: decryptSecret(olt.passwordEnc, OLT_CRED_KEY),
    enablePassword: olt.enablePasswordEnc ? decryptSecret(olt.enablePasswordEnc, OLT_CRED_KEY) : undefined,
  };
}

export function toSnmpCreds(
  olt: Pick<Olt, "ip" | "snmpPort" | "snmpCommunity" | "snmpVersion">
): SnmpCreds {
  return {
    host: olt.ip,
    port: olt.snmpPort,
    community: olt.snmpCommunity ?? "public",
    version: olt.snmpVersion === "1" ? "1" : "2c",
  };
}

export async function loadOlt(oltId: number): Promise<Olt> {
  const olt = await prisma.olt.findUnique({ where: { id: oltId } });
  if (!olt) throw new Error(`OLT ${oltId} nuk ekziston`);
  return olt;
}
