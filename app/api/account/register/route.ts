import { NextResponse } from "next/server";

import { registerPasswordCustomer } from "@/lib/auth/password-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const customer = await registerPasswordCustomer({
      name: typeof body.name === "string" ? body.name : "",
      email: typeof body.email === "string" ? body.email : "",
      password: typeof body.password === "string" ? body.password : "",
      confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
    });

    return NextResponse.json({ ok: true, customerId: customer._id }, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to create account." },
      { status: 400 },
    );
  }
}
