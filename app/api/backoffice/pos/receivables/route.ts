import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { listReceivables } from "@/lib/pos/operations";
import { recordOutstandingCashPayment } from "@/lib/pos/server";
import { dbk61ReadHistory, dbk61SandboxAllowed, isDbk61SyntheticOrderId } from "@/lib/db/dbk61-pos-compat";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  if (staff.role === "MANAGER" && !staff.storeLocationId) return NextResponse.json({ message: "Manager must be assigned to a store." }, { status: 403 });
  try {
    const requestedStoreId = new URL(request.url).searchParams.get("store")?.trim() || undefined;
    const storeId = staff.role === "MANAGER" ? staff.storeLocationId : requestedStoreId;
    const sandbox = new URL(request.url).searchParams.get("dbk61");
    if (sandbox !== null) {
      if (sandbox !== "test" || staff.role !== "ADMIN" || !dbk61SandboxAllowed(request)) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
      }
      const orders = await dbk61ReadHistory({ storeId });
      return NextResponse.json({ receivables: orders.filter(o=>o.balanceDue>0), testOnly: true },
        { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ receivables: await listReceivables(storeId) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load receivables." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    const body = await request.json() as { orderId?: string; amount?: number };
    if (!body.orderId) return NextResponse.json({ message: "Order is required." }, { status: 400 });
    // DBK-61 does not support payment writes: never let a synthetic order fall through to Sanity.
    if (isDbk61SyntheticOrderId(body.orderId)) {
      return NextResponse.json({ message: "Test orders cannot receive real payments" }, { status: 403 });
    }

    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role, storeLocationId: staff.storeLocationId, storeLocationName: staff.storeLocationName, storeLocationCode: staff.storeLocationCode };
    return NextResponse.json(await recordOutstandingCashPayment({ orderId: body.orderId, amount: Number(body.amount || 0), seller }));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to record receivable payment." }, { status: 400 });
  }
}
