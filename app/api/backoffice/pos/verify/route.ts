import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { markPosPaymentTimedOut, verifyPosPayment } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const reference = new URL(request.url).searchParams.get("reference")?.trim();
    if (!reference) return NextResponse.json({ message: "POS payment reference is required." }, { status: 400 });
    return NextResponse.json(await verifyPosPayment(reference));
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to verify POS payment." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const body = await request.json() as { reference?: string; action?: string };
    const reference = body.reference?.trim() || "";
    if (!reference || body.action !== "timeout") return NextResponse.json({ message: "Invalid timeout request." }, { status: 400 });
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role };
    return NextResponse.json(await markPosPaymentTimedOut(reference, seller));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update payment timeout." }, { status: 400 });
  }
}
