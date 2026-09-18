import { NextResponse } from "next/server";

import { createPasswordReset } from "@/lib/auth/password-auth";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const reset = await createPasswordReset(email);
    if (reset) {
      const url = new URL("/account/reset-password", request.url);
      url.searchParams.set("email", reset.email);
      url.searchParams.set("token", reset.token);
      await sendPasswordResetEmail({ email: reset.email, name: reset.name, resetUrl: url.toString() });
    }

    return NextResponse.json({
      ok: true,
      message: "If an active account exists for that email, a password reset link has been sent.",
    });
  } catch (cause) {
    console.error("Password reset request failed:", cause);
    return NextResponse.json({ message: "Unable to send the reset email right now. Please try again." }, { status: 500 });
  }
}
