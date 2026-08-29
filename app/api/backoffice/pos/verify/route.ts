import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { verifyPosMpesaSale } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const reference = new URL(request.url).searchParams.get("reference")?.trim();
    if (!reference) return NextResponse.json({ message: "POS payment reference is required." }, { status: 400 });
    return NextResponse.json(await verifyPosMpesaSale(reference));
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to verify POS M-PESA payment." },
      { status: 400 },
    );
  }
}
