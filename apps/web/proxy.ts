import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function is renamed too) —
// see node_modules/next/dist/docs/.../proxy.md. This is the single authorization gate:
// authentication (valid session) + role-tier authorization by (method, path).
const SESSION_COOKIE = "oltflow_session";
const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout", "/api/health"];

// Inlined role logic (edge-safe — importing @oltflow/core would pull in node:crypto).
// Keep in sync with packages/core/src/roles.ts.
const TIER = { VIEW: 1, OPERATE: 2, ADMIN: 3 } as const;
type Tier = (typeof TIER)[keyof typeof TIER];
const ROLE_RANK: Record<string, number> = { admin: 3, support: 2, operator: 2, technician: 1, viewer: 1 };
const roleRank = (role: string | null | undefined): number => (role && ROLE_RANK[role]) || 1;

interface Rule {
  method?: string;
  re: RegExp;
  tier: Tier;
}
// First match wins; anything unlisted defaults to VIEW (any authenticated user).
const RULES: Rule[] = [
  // ── ADMIN ──────────────────────────────────────────────────────────────
  { re: /^\/api\/users(\/\d+)?$/, tier: TIER.ADMIN },
  { method: "GET", re: /^\/api\/audit$/, tier: TIER.ADMIN },
  { method: "POST", re: /^\/api\/notify$/, tier: TIER.ADMIN },
  { method: "POST", re: /^\/api\/olts$/, tier: TIER.ADMIN },
  { method: "PATCH", re: /^\/api\/olts\/\d+$/, tier: TIER.ADMIN },
  { method: "DELETE", re: /^\/api\/olts\/\d+$/, tier: TIER.ADMIN },
  { method: "POST", re: /^\/api\/olts\/\d+\/push-acs$/, tier: TIER.ADMIN },
  { method: "POST", re: /^\/api\/olts\/\d+\/snmp-discover$/, tier: TIER.ADMIN },
  { method: "DELETE", re: /^\/api\/onus\/\d+$/, tier: TIER.ADMIN },
  { method: "POST", re: /^\/api\/onus\/\d+\/replace$/, tier: TIER.ADMIN },
  { re: /^\/users(\/|$)/, tier: TIER.ADMIN }, // Users admin page
  // ── OPERATE (support + admin) ────────────────────────────────────────────
  { method: "GET", re: /^\/api\/technicians$/, tier: TIER.OPERATE }, // technician list for assign
  { method: "POST", re: /^\/api\/splitters$/, tier: TIER.OPERATE }, // ODN plant editing
  { method: "PATCH", re: /^\/api\/splitters\/\d+$/, tier: TIER.OPERATE },
  { method: "DELETE", re: /^\/api\/splitters\/\d+$/, tier: TIER.OPERATE },
  { method: "POST", re: /^\/api\/fiber$/, tier: TIER.OPERATE },
  { method: "DELETE", re: /^\/api\/fiber\/\d+$/, tier: TIER.OPERATE },
  { method: "POST", re: /^\/api\/tickets$/, tier: TIER.OPERATE }, // open a ticket
  { method: "PATCH", re: /^\/api\/tickets\/\d+$/, tier: TIER.OPERATE }, // (re)assign technician
  // NOTE: GET /api/tickets(/id) + POST /api/tickets/id/action ⇒ VIEW default; the routes do
  // the fine-grained check (assigned technician vs office, canWorkTickets).
  { method: "POST", re: /^\/api\/provision(\/.*)?$/, tier: TIER.OPERATE },
  { method: "POST", re: /^\/api\/wifi\/update$/, tier: TIER.OPERATE },
  { method: "POST", re: /^\/api\/onus\/\d+\/reboot$/, tier: TIER.OPERATE },
  { method: "POST", re: /^\/api\/onus\/\d+\/restart$/, tier: TIER.OPERATE },
  { method: "POST", re: /^\/api\/onus\/\d+\/wan-access$/, tier: TIER.OPERATE },
  { method: "PATCH", re: /^\/api\/onus\/\d+$/, tier: TIER.OPERATE }, // set mgmt IP
  { method: "POST", re: /^\/api\/olts\/\d+\/scan-unconfigured$/, tier: TIER.OPERATE },
  { re: /^\/provision(\/|$)/, tier: TIER.OPERATE }, // Provision page
  // NOTE: /api/onus/[id]/live and /refresh are read-only in effect ⇒ VIEW (default).
];

function requiredTier(method: string, pathname: string): Tier {
  for (const r of RULES) {
    if (r.method && r.method !== method) continue;
    if (r.re.test(pathname)) return r.tier;
  }
  return TIER.VIEW;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET ?? ""));
      role = (payload.role as string) ?? "viewer";
    } catch {
      role = null;
    }
  }

  if (!role) {
    if (isApi) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (roleRank(role) < requiredTier(request.method, pathname)) {
    if (isApi) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.redirect(new URL("/", request.url)); // bounce off admin-only pages
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
