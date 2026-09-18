import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { changePassword, getPasswordState } from "@/lib/auth/password-auth";

async function customerId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || "";
}

export async function GET() {
  const id = await customerId();
  if (!id) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json(await getPasswordState(id));
}

export async function PATCH(request: Request) {
  const id = await customerId();
  if (!id) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    await changePassword({
      customerId: id,
      currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : undefined,
      password: typeof body.password === "string" ? body.password : "",
      confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
    });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to update password." },
      { status: 400 },
    );
  }
}
