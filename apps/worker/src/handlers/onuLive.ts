import { getOnuLive } from "@oltflow/adapters";
import type { OnuLivePayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";

// On-demand live snapshot for the View panel: two read-only CLI commands on a dedicated,
// short-lived session. Deliberately NOT gated by the per-OLT lock — a large OLT (e.g. 600+
// ONUs) syncs almost continuously, so waiting for the lock would leave the live view
// perpetually "busy". ZTE allows concurrent telnet sessions, and read-only shows can't
// corrupt a concurrent sync/provision session.
export async function handleOnuLive(payload: OnuLivePayload) {
  const olt = await loadOlt(payload.oltId);
  return getOnuLive(toCreds(olt), payload.ponPort);
}
