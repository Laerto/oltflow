import { getIntegrationSecrets, type GenieacsConfig } from "@oltflow/db";

/** Resolve GenieACS NBI URL: DB Integration first, then GENIEACS_URL env. */
export async function resolveGenieacsUrl(): Promise<string> {
  try {
    const { enabled, config } = await getIntegrationSecrets("genieacs");
    const cfg = config as GenieacsConfig;
    if (enabled && cfg.nbiUrl) return cfg.nbiUrl.replace(/\/$/, "");
    if (cfg.nbiUrl) return cfg.nbiUrl.replace(/\/$/, "");
  } catch {
    /* fall through */
  }
  return (process.env.GENIEACS_URL ?? "").replace(/\/$/, "");
}

export async function resolveAcsUrl(): Promise<string> {
  try {
    const { config } = await getIntegrationSecrets("genieacs");
    const cfg = config as GenieacsConfig;
    if (cfg.acsUrl) return cfg.acsUrl;
  } catch {
    /* fall through */
  }
  return process.env.ACS_URL ?? "";
}
