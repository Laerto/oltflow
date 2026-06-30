import snmp from "net-snmp";

export interface SnmpCreds {
  host: string;
  port: number;
  community: string;
  version?: "2c" | "1";
}

export interface VarBind {
  oid: string;
  value: string;
}

function session(creds: SnmpCreds) {
  const version = creds.version === "1" ? snmp.Version1 : snmp.Version2c;
  return snmp.createSession(creds.host, creds.community, { port: creds.port, version, timeout: 5000 });
}

function stringifyValue(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value === null || value === undefined) return "";
  return String(value);
}

/** GET a small set of OIDs (e.g. sysDescr) — one round-trip. */
export function snmpGet(creds: SnmpCreds, oids: string[]): Promise<VarBind[]> {
  const s = session(creds);
  return new Promise((resolve, reject) => {
    s.get(oids, (err, varbinds) => {
      s.close();
      if (err) return reject(err);
      resolve((varbinds ?? []).map((v) => ({ oid: v.oid, value: stringifyValue(v.value) })));
    });
  });
}

/** Bulk-walk every OID under `baseOid` — the fast alternative to per-ONU CLI scraping. */
export function snmpWalk(creds: SnmpCreds, baseOid: string): Promise<VarBind[]> {
  const s = session(creds);
  const out: VarBind[] = [];
  return new Promise((resolve, reject) => {
    s.subtree(
      baseOid,
      (varbinds) => {
        for (const v of varbinds ?? []) {
          if (snmp.isVarbindError(v)) continue;
          out.push({ oid: v.oid, value: stringifyValue(v.value) });
        }
      },
      (err) => {
        s.close();
        if (err) return reject(err);
        resolve(out);
      }
    );
  });
}
