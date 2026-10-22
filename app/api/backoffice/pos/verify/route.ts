import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { markPosPaymentTimedOut, PosPaymentAccessError, verifyPosPayment } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const url = new URL(request.url);
    const reference = url.searchParams.get("reference")?.trim();
    const forceProviderQuery = url.searchParams.get("forceProviderQuery") === "1";
    if (!reference) return NextResponse.json({ message: "POS payment reference is required." }, { status: 400 });
    const scopedStaff = staff.role === "MANAGER" || staff.role === "STORE_STAFF";
    if (scopedStaff && !staff.storeLocationId) {
      return NextResponse.json({ message: "An assigned store is required to verify payments." }, { status: 403 });
    }
    return NextResponse.json(await verifyPosPayment(reference, {
      forceProviderQuery,
      allowedStoreLocationId: scopedStaff ? staff.storeLocationId : undefined,
      failedTransactionOnly: staff.role === "STORE_STAFF" && forceProviderQuery,
      allowInventoryRetry: staff.role !== "STORE_STAFF",
    }));
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to verify POS payment." },
      { status: cause instanceof PosPaymentAccessError ? 403 : 400 },
    );
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const body = await request.json() as { reference?: string; action?: string };
    const reference = body.reference?.trim() || "";
    if (!reference || body.action !== "timeout") return NextResponse.json({ message: "Invalid timeout request." }, { status: 400 });
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role, storeLocationId: staff.storeLocationId, storeLocationName: staff.storeLocationName, storeLocationCode: staff.storeLocationCode };
    return NextResponse.json(await markPosPaymentTimedOut(reference, seller));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update payment timeout." }, { status: 400 });
  }
}
