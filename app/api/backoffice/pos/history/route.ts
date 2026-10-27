import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { listSalesCashiers, listSalesHistory } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  if ((staff.role === "MANAGER" || staff.role === "STORE_STAFF") && !staff.storeLocationId) return NextResponse.json({ message: "You must be assigned to a store to view sales history." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const channel = params.get("channel");
  const cashier = params.get("cashier")?.trim() || undefined;
  const query = params.get("q")?.trim() || undefined;
  const from = params.get("from")?.trim() || undefined;
  const to = params.get("to")?.trim() || undefined;
  const limit = Number(params.get("limit") || 150);
  const requestedStoreId = params.get("store")?.trim() || undefined;
  const storeId = staff.role === "MANAGER" || staff.role === "STORE_STAFF" ? staff.storeLocationId : requestedStoreId;
  try {
    const [orders, cashiers] = await Promise.all([
      listSalesHistory({ limit, channel: channel === "POS" || channel === "ONLINE" ? channel : undefined, cashier, query, from, to, storeId }),
      listSalesCashiers(storeId),
    ]);
    const visibleOrders = staff.role === "STORE_STAFF"
      ? orders.map((order) => ({ ...order, lineItems: order.lineItems.map(({ unitCost: _unitCost, ...line }) => line) }))
      : orders;
    return NextResponse.json({ orders: visibleOrders, cashiers });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load sales history." }, { status: 400 });
  }
}
