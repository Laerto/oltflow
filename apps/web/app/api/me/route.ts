import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Current user — lets the client tailor the UI to the role (buttons/pages).
// Authorization itself is enforced server-side (middleware + routes), never here.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({
    id: Number(session.sub),
    email: session.email,
    name: session.name,
    role: session.role,
  });
}
