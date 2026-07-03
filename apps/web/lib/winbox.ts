// Server-only helper: builds a one-click `winbox://` launch URL that carries the shared
// Mikrotik credentials so support connects in a single click (no copy/paste/typing).
//
// The client Mikrotiks behind bridge ONUs expose ONLY Winbox (port 8291) — SSH/API/WebFig
// are disabled — so an in-browser terminal isn't possible. Instead each support PC installs
// a tiny `winbox://` protocol handler once (see tools/winbox-handler/) that maps the link to
// `winbox.exe <host> <user> <password>`, Winbox's documented auto-login command line.
//
// Credentials live in server env and the URL is only attached to API responses for users who
// can operate — so the shared password never ships in the static client bundle. Returns null
// when creds aren't configured, so the UI falls back to the copy-IP flow.
const USER = process.env.MIKROTIK_WINBOX_USER ?? "";
const PASSWORD = process.env.MIKROTIK_WINBOX_PASSWORD ?? "";
const PORT = process.env.MIKROTIK_WINBOX_PORT ?? "8291";

export function buildWinboxUrl(host: string | null | undefined): string | null {
  if (!host || !USER) return null;
  const authority = PORT && PORT !== "8291" ? `${host}:${PORT}` : host;
  return `winbox://${authority}?u=${encodeURIComponent(USER)}&p=${encodeURIComponent(PASSWORD)}`;
}
