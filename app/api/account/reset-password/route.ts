import { NextResponse } from "next/server";

import { resetPassword } from "@/lib/auth/password-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    await resetPassword({
      email: typeof body.email === "string" ? body.email : "",
      token: typeof body.token === "string" ? body.token : "",
      password: typeof body.password === "string" ? body.password : "",
      confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
    });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to reset password." },
      { status: 400 },
    );
  }
}
