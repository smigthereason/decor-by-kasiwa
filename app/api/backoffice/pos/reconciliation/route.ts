import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getPaymentReconciliation } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  if (staff.role === "MANAGER" && !staff.storeLocationId) return NextResponse.json({ message: "Manager must be assigned to a store." }, { status: 403 });
  const requestedStoreId = new URL(request.url).searchParams.get("store")?.trim() || undefined;
  const storeId = staff.role === "MANAGER" ? staff.storeLocationId : requestedStoreId;
  return NextResponse.json({ payments: await getPaymentReconciliation(500, storeId) });
}
