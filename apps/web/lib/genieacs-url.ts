import { getIntegrationSecrets, type GenieacsConfig } from "@oltflow/db";

/** Server-side helper: DB Integration → env fallback. */
export async function resolveGenieacsUrl(): Promise<string> {
  try {
    const { config } = await getIntegrationSecrets("genieacs");
    const cfg = config as GenieacsConfig;
    if (cfg.nbiUrl) return cfg.nbiUrl.replace(/\/$/, "");
  } catch {
    /* fall through */
  }
  return (process.env.GENIEACS_URL ?? "").replace(/\/$/, "");
}
