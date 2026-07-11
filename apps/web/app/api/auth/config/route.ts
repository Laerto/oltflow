import { NextResponse } from "next/server";
import { isPublicSignupEnabled } from "@/lib/mailer";

/** Public: whether self-signup is open (for landing/signup UI). */
export async function GET() {
  const publicSignup = await isPublicSignupEnabled();
  return NextResponse.json({ publicSignup });
}
