import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function is
// renamed too) — see node_modules/next/dist/docs/.../proxy.md.
const SESSION_COOKIE = "oltflow_session";
const PUBLIC_PATHS = ["/login", "/api/login", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToLogin(request);

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET ?? ""));
    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
